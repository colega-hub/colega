-- Shared Workspace — the collaboration layer of Company workspaces ("Colega Work Graph").
-- Run AFTER 0025 (seats) and 0026 (workspace context). Additive: new columns on workspace_items
-- (every existing row keeps exactly its current meaning and visibility), new tables, new
-- functions, and REPLACED workspace_items policies that are identical for Personal rows and only
-- ever grant company members access to company rows that were explicitly made visible to them.
--
-- ============================================================================
-- DESIGN SUMMARY
-- ============================================================================
-- Work Items = workspace_items, extended — NOT a second system. Personal Notes/Tasks and
-- Company work share one table, one lifecycle, one context column (0026's org_id):
--   type        note | task (Personal + Company); issue | decision | follow_up (Company only)
--   visibility  private  -> creator (and assignee, if any) only       [every existing row]
--               selected -> creator, assignee, and the members in work_item_shares
--               company  -> every CURRENT member of that organization
--               Personal rows are always private with no assignee (CHECK constraint).
--   assignee_id a CURRENT member of the item's organization (trigger-validated at assignment
--               time; an existing assignment survives the assignee's removal as history, but a
--               removed member can no longer see it and cannot be newly assigned).
--
-- Collaboration records, all organization-scoped and members-only:
--   work_item_shares      "selected people" visibility
--   work_item_links       lightweight relations between Work Items of the same organization
--   company_feed_entries  ONE feed per organization: human messages + meaningful events only
--   work_inbox            per-recipient "needs my attention" (assigned / shared / mentioned)
--   org_temporary_rules   time-boxed authoritative instructions (owner/admin), fed to company AI
--
-- WRITE PATHS: collaboration side effects (feed events, inbox entries) are created by
-- SECURITY DEFINER triggers, so they are consistent no matter which path wrote the item, and
-- clients have NO insert/update policy on feed/inbox/shares/links/rules at all — they go through
-- the RPCs below, which re-validate membership, role, eligibility and visibility server-side and
-- never trust an organization id, role, assignee or visibility just because a client sent it.
--
-- COMPANY PLAN (Teams) GATE: collaboration WRITES require the organization's Teams entitlement to
-- be active right now (org_has_active_teams: the OWNER's effective plan is 'teams' — an
-- active/trialing, unexpired subscription or an unexpired, unrevoked admin grant). Being
-- owner/admin is a role, never an entitlement; a member's own Personal Pro never substitutes.
-- When the plan lapses NOTHING is deleted and everything stays readable; what stops is new
-- collaborative activity (messages, company/shared/assigned Work Items, Issues/Decisions/
-- Follow-ups, shares, links, new Temporary Rules), and active Temporary Rules stop reaching AI.
-- Still allowed while lapsed: reading everything, marking one's own inbox read, deleting one's
-- own messages, ending (revoking) a rule, and a member's own PRIVATE, unassigned note/task in the
-- company context (that was possible for any company before Teams collaboration existed — 0026).
-- Reactivating Teams restores everything as it was. Error code: COMPANY_PLAN_INACTIVE.
--
-- NOISE DISCIPLINE: the feed only ever receives: a human message; a company-visible Work Item
-- being created, shared to the company, assigned, completed/resolved; a Temporary Rule being
-- activated or revoked. Private / selected-people items NEVER produce company feed events (that
-- would leak them), and nothing is logged for views, opens, edits of text, reorders, or AI calls.

-- ============================================================================
-- 0. Company "has an active Teams entitlement" — corrected to honour admin grants (0022)
-- ============================================================================
-- 0026 checked the owner's subscriptions row only. Since 0022 (website, applied), an owner's
-- effective plan can also come from an active admin_entitlement_grants row. This mirrors 0022's
-- get_my_entitlement() resolution for an arbitrary user; the grants table is looked up
-- dynamically so this file also runs on a database without the website's migrations.

create or replace function public.effective_plan_for_user(target_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  sub_plan text := 'free';
  grant_plan text;
  rank constant jsonb := '{"free": 0, "pro": 1, "teams": 2}'::jsonb;
begin
  select case when s.status in ('active', 'trialing') and (s.current_period_end is null or s.current_period_end >= now()) then s.plan else 'free' end
    into sub_plan
    from public.subscriptions s where s.user_id = target_user_id;
  sub_plan := coalesce(sub_plan, 'free');

  if to_regclass('public.admin_entitlement_grants') is not null then
    execute 'select g.plan from public.admin_entitlement_grants g
               where g.user_id = $1 and g.revoked_at is null and g.expires_at > now()
               order by case g.plan when ''teams'' then 2 when ''pro'' then 1 else 0 end desc limit 1'
      into grant_plan using target_user_id;
  end if;

  if grant_plan is not null and (rank->>grant_plan)::int > (rank->>sub_plan)::int then
    return grant_plan;
  end if;
  return sub_plan;
end;
$$;

revoke all on function public.effective_plan_for_user(uuid) from public;
revoke all on function public.effective_plan_for_user(uuid) from anon;
revoke all on function public.effective_plan_for_user(uuid) from authenticated;

create or replace function public.org_has_active_teams(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.organizations o
    where o.id = target_org_id and o.archived_at is null and public.effective_plan_for_user(o.owner_id) = 'teams'
  );
$$;

revoke all on function public.org_has_active_teams(uuid) from public;
revoke all on function public.org_has_active_teams(uuid) from anon;
revoke all on function public.org_has_active_teams(uuid) from authenticated;

/** Client-callable, membership-scoped view of the gate (false for non-members — nothing about
 * another company's billing is revealed). Also used by RLS policies (0028). */
create or replace function public.company_plan_active(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select public.is_org_member(target_org_id) and public.org_has_active_teams(target_org_id) $$;
revoke all on function public.company_plan_active(uuid) from public;
revoke all on function public.company_plan_active(uuid) from anon;
grant execute on function public.company_plan_active(uuid) to authenticated;

/** A company Work Item that is only its creator's own business (the only kind a lapsed company
 * still accepts): a Note/Task, private, unassigned or assigned to the creator. */
create or replace function public.is_solo_company_item(p_type text, p_visibility text, p_assignee uuid, p_creator uuid)
returns boolean
language sql
immutable
as $$ select p_type in ('note', 'task') and p_visibility = 'private' and (p_assignee is null or p_assignee = p_creator) $$;

-- ============================================================================
-- 1. Work Items: extend workspace_items
-- ============================================================================

alter table public.workspace_items drop constraint if exists workspace_items_type_check;
alter table public.workspace_items
  add constraint workspace_items_type_check check (type in ('note', 'task', 'issue', 'decision', 'follow_up'));

alter table public.workspace_items add column if not exists visibility text not null default 'private';
alter table public.workspace_items drop constraint if exists workspace_items_visibility_check;
alter table public.workspace_items add constraint workspace_items_visibility_check check (visibility in ('private', 'selected', 'company'));

alter table public.workspace_items add column if not exists assignee_id uuid references auth.users(id) on delete set null;

-- Personal stays exactly what it was: private, unassigned notes/tasks.
alter table public.workspace_items drop constraint if exists workspace_items_personal_is_private;
alter table public.workspace_items add constraint workspace_items_personal_is_private
  check (org_id is not null or (visibility = 'private' and assignee_id is null and type in ('note', 'task')));

create index if not exists workspace_items_org_visibility_idx on public.workspace_items (org_id, visibility, created_at desc) where org_id is not null;
create index if not exists workspace_items_org_assignee_idx on public.workspace_items (org_id, assignee_id) where assignee_id is not null;

create table if not exists public.work_item_shares (
  item_id uuid not null references public.workspace_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
create index if not exists work_item_shares_user_idx on public.work_item_shares (user_id, org_id);
alter table public.work_item_shares enable row level security;

create table if not exists public.work_item_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  from_item_id uuid not null references public.workspace_items(id) on delete cascade,
  to_item_id uuid not null references public.workspace_items(id) on delete cascade,
  relation text not null check (relation in ('related', 'follow_up_of', 'resolves', 'decision_for')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint work_item_links_not_self check (from_item_id <> to_item_id),
  unique (from_item_id, to_item_id, relation)
);
alter table public.work_item_links enable row level security;

-- Visibility helpers (SECURITY DEFINER so policies never recurse into each other's RLS).
create or replace function public.is_work_item_shared_with_me(target_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.work_item_shares s where s.item_id = target_item_id and s.user_id = auth.uid());
$$;
revoke all on function public.is_work_item_shared_with_me(uuid) from public;
revoke all on function public.is_work_item_shared_with_me(uuid) from anon;
grant execute on function public.is_work_item_shared_with_me(uuid) to authenticated;

/** The single definition of "may the caller see this Work Item" (mirrors the SELECT policy). */
create or replace function public.can_view_work_item(target_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workspace_items w
    where w.id = target_item_id
      and (
        (w.org_id is null and w.user_id = auth.uid())
        or (
          w.org_id is not null and public.is_org_member(w.org_id) and (
            w.user_id = auth.uid() or w.assignee_id = auth.uid() or w.visibility = 'company'
            or (w.visibility = 'selected' and exists (select 1 from public.work_item_shares s where s.item_id = w.id and s.user_id = auth.uid()))
          )
        )
      )
  );
$$;
revoke all on function public.can_view_work_item(uuid) from public;
revoke all on function public.can_view_work_item(uuid) from anon;
grant execute on function public.can_view_work_item(uuid) to authenticated;

-- Replaces 0026's policies. Personal rows: unchanged (owner only). Company rows: current members
-- only, and only the items visible to them.
drop policy if exists "users can read their own workspace items in a context they can access" on public.workspace_items;
drop policy if exists "users can read workspace items visible to them" on public.workspace_items;
create policy "users can read workspace items visible to them"
  on public.workspace_items for select
  using (
    (org_id is null and auth.uid() = user_id)
    or (
      org_id is not null and public.is_org_member(org_id) and (
        auth.uid() = user_id or assignee_id = auth.uid() or visibility = 'company'
        or (visibility = 'selected' and public.is_work_item_shared_with_me(id))
      )
    )
  );

-- INSERT unchanged from 0026 (own rows, a context you can access); invariants are in the trigger.
drop policy if exists "users can update their own workspace items in a context they can access" on public.workspace_items;
drop policy if exists "creators and assignees can update workspace items" on public.workspace_items;
create policy "creators and assignees can update workspace items"
  on public.workspace_items for update
  using (
    (org_id is null and auth.uid() = user_id)
    or (org_id is not null and public.is_org_member(org_id) and (auth.uid() = user_id or assignee_id = auth.uid()))
  )
  with check (
    (org_id is null and auth.uid() = user_id)
    or (org_id is not null and public.is_org_member(org_id) and (auth.uid() = user_id or assignee_id = auth.uid()))
  );
-- DELETE unchanged from 0026: the creator only, in a context they can access.

/**
 * Work Item invariants, for EVERY write path (direct PostgREST writes included):
 *   * the creator (user_id) never changes;
 *   * an assignee must be a CURRENT member of the item's organization at the moment they are
 *     assigned (checked only when the assignee is set/changed, so an old assignment to a since-
 *     removed member doesn't block unrelated edits);
 *   * someone who is only the assignee may change status/completion — nothing else (not the
 *     text, visibility, sharing, due date or assignee);
 *   * visibility/assignee changes are the creator's.
 */
create or replace function public.workspace_items_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Company plan gate for client writes (system paths such as an account deletion's FK cleanup run
  -- without a user and are not collaboration). A lapsed company accepts only solo items, and an
  -- existing collaborative item is frozen (readable, not editable) until Teams is reactivated.
  if auth.uid() is not null and new.org_id is not null and not public.org_has_active_teams(new.org_id) then
    if not public.is_solo_company_item(new.type, new.visibility, new.assignee_id, new.user_id)
       or (tg_op = 'UPDATE' and not public.is_solo_company_item(old.type, old.visibility, old.assignee_id, old.user_id)) then
      raise exception 'COMPANY_PLAN_INACTIVE';
    end if;
  end if;

  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    if new.org_id is null or not exists (
      select 1 from public.organization_members m where m.org_id = new.org_id and m.user_id = new.assignee_id
    ) then
      raise exception 'ASSIGNEE_NOT_ELIGIBLE';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'WORK_ITEM_CREATOR_IMMUTABLE';
    end if;
    if auth.uid() is not null and auth.uid() <> old.user_id then
      -- Assignee-only edit: status and completion only.
      if (new.title, new.content, new.type, new.priority, new.due_at, new.remind_at, new.visibility, new.assignee_id, new.source, new.source_context)
         is distinct from
         (old.title, old.content, old.type, old.priority, old.due_at, old.remind_at, old.visibility, old.assignee_id, old.source, old.source_context)
      then
        raise exception 'NOT_AUTHORIZED';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.workspace_items_guard() from public, anon, authenticated;

drop trigger if exists workspace_items_guard on public.workspace_items;
create trigger workspace_items_guard
  before insert or update on public.workspace_items
  for each row execute function public.workspace_items_guard();

-- Shares/links: readable by those who can see the item(s); written only through RPCs.
drop policy if exists "members can read shares of items they can see" on public.work_item_shares;
create policy "members can read shares of items they can see"
  on public.work_item_shares for select
  using (public.is_org_member(org_id) and (user_id = auth.uid() or public.can_view_work_item(item_id)));

drop policy if exists "members can read links between items they can see" on public.work_item_links;
create policy "members can read links between items they can see"
  on public.work_item_links for select
  using (public.is_org_member(org_id) and public.can_view_work_item(from_item_id) and public.can_view_work_item(to_item_id));

-- ============================================================================
-- 2. Company Feed + Inbox
-- ============================================================================

create table if not exists public.company_feed_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('message', 'work', 'rule')),
  event text check (event in ('created', 'shared', 'assigned', 'completed', 'resolved', 'activated', 'revoked')),
  -- null only for a Colega-generated entry.
  actor_id uuid references auth.users(id) on delete set null,
  body text check (body is null or char_length(body) between 1 and 4000),
  mentions uuid[] not null default '{}',
  work_item_id uuid references public.workspace_items(id) on delete cascade,
  rule_id uuid,
  created_at timestamptz not null default now(),
  constraint company_feed_entries_shape check (
    (kind = 'message' and body is not null and event is null and work_item_id is null and rule_id is null)
    or (kind = 'work' and work_item_id is not null and event is not null)
    or (kind = 'rule' and rule_id is not null and event in ('activated', 'revoked'))
  )
);
create index if not exists company_feed_entries_org_created_idx on public.company_feed_entries (org_id, created_at desc, id desc);
alter table public.company_feed_entries enable row level security;
-- Reading goes through list_company_feed() (it hides items the reader may no longer see); the
-- direct SELECT is still member-scoped as defense in depth. Authors may delete their own
-- messages; nothing else is client-writable.
drop policy if exists "members can read their company feed" on public.company_feed_entries;
create policy "members can read their company feed"
  on public.company_feed_entries for select
  using (public.is_org_member(org_id) and (kind <> 'work' or public.can_view_work_item(work_item_id)));
drop policy if exists "authors can delete their own messages" on public.company_feed_entries;
create policy "authors can delete their own messages"
  on public.company_feed_entries for delete
  using (kind = 'message' and actor_id = auth.uid() and public.is_org_member(org_id));

create table if not exists public.work_inbox (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('assigned', 'shared', 'mentioned')),
  importance text not null check (importance in ('fyi', 'action', 'important')),
  actor_id uuid references auth.users(id) on delete set null,
  work_item_id uuid references public.workspace_items(id) on delete cascade,
  feed_entry_id uuid references public.company_feed_entries(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists work_inbox_user_org_idx on public.work_inbox (user_id, org_id, created_at desc);
alter table public.work_inbox enable row level security;
-- The recipient only, and only while still a member. read_at changes go through mark_inbox_read().
drop policy if exists "recipients can read their own inbox" on public.work_inbox;
create policy "recipients can read their own inbox"
  on public.work_inbox for select
  using (user_id = auth.uid() and public.is_org_member(org_id));

-- Triggers: meaningful events only.
create or replace function public.shared_workspace_item_events()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
begin
  if new.org_id is null then
    return null; -- Personal: never a feed event, never an inbox entry.
  end if;

  if tg_op = 'INSERT' then
    if new.visibility = 'company' then
      insert into public.company_feed_entries (org_id, kind, event, actor_id, work_item_id) values (new.org_id, 'work', 'created', actor, new.id);
    end if;
    if new.assignee_id is not null and new.assignee_id is distinct from actor then
      insert into public.work_inbox (org_id, user_id, reason, importance, actor_id, work_item_id)
      values (new.org_id, new.assignee_id, 'assigned', case when new.type = 'issue' then 'important' else 'action' end, actor, new.id);
    end if;
    return null;
  end if;

  -- UPDATE
  if new.visibility = 'company' and old.visibility <> 'company' then
    insert into public.company_feed_entries (org_id, kind, event, actor_id, work_item_id) values (new.org_id, 'work', 'shared', actor, new.id);
  end if;
  if new.assignee_id is not null and new.assignee_id is distinct from old.assignee_id then
    if new.assignee_id is distinct from actor then
      insert into public.work_inbox (org_id, user_id, reason, importance, actor_id, work_item_id)
      values (new.org_id, new.assignee_id, 'assigned', case when new.type = 'issue' then 'important' else 'action' end, actor, new.id);
    end if;
    if new.visibility = 'company' then
      insert into public.company_feed_entries (org_id, kind, event, actor_id, work_item_id) values (new.org_id, 'work', 'assigned', actor, new.id);
    end if;
  end if;
  if new.status = 'completed' and old.status <> 'completed' and new.visibility = 'company' and new.type in ('task', 'issue', 'follow_up') then
    insert into public.company_feed_entries (org_id, kind, event, actor_id, work_item_id)
    values (new.org_id, 'work', case when new.type = 'issue' then 'resolved' else 'completed' end, actor, new.id);
  end if;
  return null;
end;
$$;
revoke all on function public.shared_workspace_item_events() from public, anon, authenticated;

drop trigger if exists shared_workspace_item_events on public.workspace_items;
create trigger shared_workspace_item_events
  after insert or update on public.workspace_items
  for each row execute function public.shared_workspace_item_events();

create or replace function public.shared_workspace_share_events()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.user_id is distinct from new.created_by then
    insert into public.work_inbox (org_id, user_id, reason, importance, actor_id, work_item_id)
    values (new.org_id, new.user_id, 'shared', 'fyi', new.created_by, new.item_id);
  end if;
  return null;
end;
$$;
revoke all on function public.shared_workspace_share_events() from public, anon, authenticated;
drop trigger if exists shared_workspace_share_events on public.work_item_shares;
create trigger shared_workspace_share_events
  after insert on public.work_item_shares
  for each row execute function public.shared_workspace_share_events();

-- ============================================================================
-- 3. Temporary Rules
-- ============================================================================

create table if not exists public.org_temporary_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  starts_at timestamptz not null default now(),
  -- null = until revoked
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint org_temporary_rules_expiry_after_start check (expires_at is null or expires_at > starts_at),
  constraint org_temporary_rules_revocation_complete check ((revoked_at is null) = (revoked_by is null))
);
create index if not exists org_temporary_rules_org_idx on public.org_temporary_rules (org_id, created_at desc);
alter table public.org_temporary_rules enable row level security;
-- Every current member can see the company's rules (active and past). No client write policy.
drop policy if exists "members can read their company's temporary rules" on public.org_temporary_rules;
create policy "members can read their company's temporary rules"
  on public.org_temporary_rules for select
  using (public.is_org_member(org_id));

alter table public.company_feed_entries drop constraint if exists company_feed_entries_rule_fk;
alter table public.company_feed_entries
  add constraint company_feed_entries_rule_fk foreign key (rule_id) references public.org_temporary_rules(id) on delete cascade;

/** THE place that decides who may author/revoke Temporary Rules. Today: owner/admin (existing
 * role semantics). A future granular permission (e.g. manage_temporary_rules) changes only this. */
create or replace function public.can_manage_temporary_rules(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select public.is_org_admin(target_org_id) $$;
revoke all on function public.can_manage_temporary_rules(uuid) from public;
revoke all on function public.can_manage_temporary_rules(uuid) from anon;
grant execute on function public.can_manage_temporary_rules(uuid) to authenticated;

create or replace function public.shared_workspace_rule_events()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.company_feed_entries (org_id, kind, event, actor_id, rule_id) values (new.org_id, 'rule', 'activated', new.created_by, new.id);
  elsif new.revoked_at is not null and old.revoked_at is null then
    insert into public.company_feed_entries (org_id, kind, event, actor_id, rule_id) values (new.org_id, 'rule', 'revoked', new.revoked_by, new.id);
  end if;
  return null;
end;
$$;
revoke all on function public.shared_workspace_rule_events() from public, anon, authenticated;
drop trigger if exists shared_workspace_rule_events on public.org_temporary_rules;
create trigger shared_workspace_rule_events
  after insert or update on public.org_temporary_rules
  for each row execute function public.shared_workspace_rule_events();

-- ============================================================================
-- 4. RPCs (authoritative, re-validate everything)
-- ============================================================================

create or replace function public.create_work_item(
  target_org_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_visibility text default 'private',
  p_assignee_id uuid default null,
  p_share_with uuid[] default '{}',
  p_due_at timestamptz default null,
  p_source text default 'manual',
  p_source_context jsonb default null,
  p_related_item_id uuid default null,
  p_relation text default 'related'
)
returns public.workspace_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item public.workspace_items;
  share_id uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if target_org_id is null or not public.is_org_member(target_org_id) then raise exception 'NOT_AUTHORIZED'; end if;
  if p_type not in ('note', 'task', 'issue', 'decision', 'follow_up') then raise exception 'INVALID_TYPE'; end if;
  if p_visibility not in ('private', 'selected', 'company') then raise exception 'INVALID_VISIBILITY'; end if;
  if char_length(trim(coalesce(p_title, ''))) not between 1 and 200 then raise exception 'INVALID_TITLE'; end if;
  if p_body is not null and char_length(p_body) > 8000 then raise exception 'INVALID_BODY'; end if;
  if p_source not in ('manual', 'colega', 'screen', 'conversation') then raise exception 'INVALID_SOURCE'; end if;
  if (p_related_item_id is not null or not public.is_solo_company_item(p_type, p_visibility, p_assignee_id, auth.uid()))
     and not public.org_has_active_teams(target_org_id) then
    raise exception 'COMPANY_PLAN_INACTIVE';
  end if;
  if coalesce(array_length(p_share_with, 1), 0) > 50 then raise exception 'TOO_MANY_SHARES'; end if;
  if p_visibility = 'selected' and coalesce(array_length(p_share_with, 1), 0) = 0 then raise exception 'SHARES_REQUIRED'; end if;
  if p_visibility <> 'selected' and coalesce(array_length(p_share_with, 1), 0) > 0 then raise exception 'INVALID_VISIBILITY'; end if;
  -- Every person named must be a CURRENT member of THIS organization.
  if exists (
    select 1 from unnest(p_share_with) u(id)
    where not exists (select 1 from public.organization_members m where m.org_id = target_org_id and m.user_id = u.id)
  ) then raise exception 'SHARE_TARGET_NOT_ELIGIBLE'; end if;
  if p_related_item_id is not null then
    if p_relation not in ('related', 'follow_up_of', 'resolves', 'decision_for') then raise exception 'INVALID_RELATION'; end if;
    if not exists (select 1 from public.workspace_items w where w.id = p_related_item_id and w.org_id = target_org_id) or not public.can_view_work_item(p_related_item_id) then
      raise exception 'RELATED_ITEM_NOT_FOUND';
    end if;
  end if;

  -- The assignee check itself is the trigger's (ASSIGNEE_NOT_ELIGIBLE).
  insert into public.workspace_items (user_id, org_id, type, title, content, visibility, assignee_id, due_at, source, source_context)
  values (auth.uid(), target_org_id, p_type, trim(p_title), nullif(trim(coalesce(p_body, '')), ''), p_visibility, p_assignee_id, p_due_at, p_source, p_source_context)
  returning * into item;

  foreach share_id in array coalesce(p_share_with, '{}') loop
    insert into public.work_item_shares (item_id, user_id, org_id, created_by) values (item.id, share_id, target_org_id, auth.uid())
    on conflict do nothing;
  end loop;

  if p_related_item_id is not null then
    insert into public.work_item_links (org_id, from_item_id, to_item_id, relation, created_by)
    values (target_org_id, item.id, p_related_item_id, p_relation, auth.uid());
  end if;
  return item;
end;
$$;
revoke all on function public.create_work_item(uuid, text, text, text, text, uuid, uuid[], timestamptz, text, jsonb, uuid, text) from public, anon;
grant execute on function public.create_work_item(uuid, text, text, text, text, uuid, uuid[], timestamptz, text, jsonb, uuid, text) to authenticated;

/** Creator-only (re)assignment; the trigger re-validates membership. */
create or replace function public.assign_work_item(target_item_id uuid, p_assignee_id uuid)
returns public.workspace_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item public.workspace_items;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into item from public.workspace_items where id = target_item_id for update;
  if item.id is null or item.org_id is null or item.user_id <> auth.uid() or not public.is_org_member(item.org_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  update public.workspace_items set assignee_id = p_assignee_id where id = target_item_id returning * into item;
  return item;
end;
$$;
revoke all on function public.assign_work_item(uuid, uuid) from public, anon;
grant execute on function public.assign_work_item(uuid, uuid) to authenticated;

create or replace function public.post_company_message(target_org_id uuid, p_body text, p_mentions uuid[] default '{}')
returns public.company_feed_entries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  entry public.company_feed_entries;
  mentioned uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if target_org_id is null or not public.is_org_member(target_org_id) then raise exception 'NOT_AUTHORIZED'; end if;
  if not public.org_has_active_teams(target_org_id) then raise exception 'COMPANY_PLAN_INACTIVE'; end if;
  if char_length(trim(coalesce(p_body, ''))) not between 1 and 4000 then raise exception 'INVALID_BODY'; end if;
  if coalesce(array_length(p_mentions, 1), 0) > 20 then raise exception 'TOO_MANY_MENTIONS'; end if;
  if exists (
    select 1 from unnest(p_mentions) u(id)
    where not exists (select 1 from public.organization_members m where m.org_id = target_org_id and m.user_id = u.id)
  ) then raise exception 'MENTION_TARGET_NOT_ELIGIBLE'; end if;

  insert into public.company_feed_entries (org_id, kind, actor_id, body, mentions)
  values (target_org_id, 'message', auth.uid(), trim(p_body), (select coalesce(array_agg(distinct x), '{}') from unnest(p_mentions) x))
  returning * into entry;

  foreach mentioned in array entry.mentions loop
    if mentioned <> auth.uid() then
      insert into public.work_inbox (org_id, user_id, reason, importance, actor_id, feed_entry_id)
      values (target_org_id, mentioned, 'mentioned', 'fyi', auth.uid(), entry.id);
    end if;
  end loop;
  return entry;
end;
$$;
revoke all on function public.post_company_message(uuid, text, uuid[]) from public, anon;
grant execute on function public.post_company_message(uuid, text, uuid[]) to authenticated;

/**
 * One page of a company's feed, newest first, keyset-paginated by (created_at, id). A work event
 * whose item the reader can no longer see is omitted entirely (no title, no trace).
 */
create or replace function public.list_company_feed(target_org_id uuid, p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 30)
returns table (
  id uuid, kind text, event text, actor_id uuid, body text, mentions uuid[], created_at timestamptz,
  work_item_id uuid, work_item_type text, work_item_title text, work_item_status text, work_item_assignee_id uuid,
  rule_id uuid, rule_body text, rule_expires_at timestamptz, rule_revoked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_org_member(target_org_id) then raise exception 'NOT_AUTHORIZED'; end if;
  return query
    select f.id, f.kind, f.event, f.actor_id, f.body, f.mentions, f.created_at,
           w.id, w.type, w.title, w.status, w.assignee_id,
           r.id, r.body, r.expires_at, r.revoked_at
    from public.company_feed_entries f
    left join public.workspace_items w on w.id = f.work_item_id
    left join public.org_temporary_rules r on r.id = f.rule_id
    where f.org_id = target_org_id
      and (f.kind <> 'work' or public.can_view_work_item(f.work_item_id))
      and (p_before is null or (f.created_at, f.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by f.created_at desc, f.id desc
    limit least(greatest(coalesce(p_limit, 30), 1), 50);
end;
$$;
revoke all on function public.list_company_feed(uuid, timestamptz, uuid, integer) from public, anon;
grant execute on function public.list_company_feed(uuid, timestamptz, uuid, integer) to authenticated;

create or replace function public.mark_inbox_read(target_org_id uuid, p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update public.work_inbox set read_at = now()
   where user_id = auth.uid() and org_id = target_org_id and read_at is null
     and (p_ids is null or id = any(p_ids));
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.mark_inbox_read(uuid, uuid[]) from public, anon;
grant execute on function public.mark_inbox_read(uuid, uuid[]) to authenticated;

create or replace function public.create_temporary_rule(target_org_id uuid, p_body text, p_expires_at timestamptz default null)
returns public.org_temporary_rules
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rule public.org_temporary_rules;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  -- Role comes from organization_members, never from the client.
  if target_org_id is null or not public.can_manage_temporary_rules(target_org_id) then raise exception 'NOT_AUTHORIZED'; end if;
  if not public.org_has_active_teams(target_org_id) then raise exception 'COMPANY_PLAN_INACTIVE'; end if;
  if char_length(trim(coalesce(p_body, ''))) not between 1 and 500 then raise exception 'INVALID_BODY'; end if;
  if p_expires_at is not null and (p_expires_at <= now() or p_expires_at > now() + interval '366 days') then raise exception 'INVALID_EXPIRY'; end if;
  insert into public.org_temporary_rules (org_id, created_by, body, expires_at)
  values (target_org_id, auth.uid(), trim(p_body), p_expires_at)
  returning * into rule;
  return rule;
end;
$$;
revoke all on function public.create_temporary_rule(uuid, text, timestamptz) from public, anon;
grant execute on function public.create_temporary_rule(uuid, text, timestamptz) to authenticated;

create or replace function public.revoke_temporary_rule(target_rule_id uuid)
returns public.org_temporary_rules
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rule public.org_temporary_rules;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into rule from public.org_temporary_rules where id = target_rule_id for update;
  if rule.id is null or not public.can_manage_temporary_rules(rule.org_id) then raise exception 'NOT_AUTHORIZED'; end if;
  if rule.revoked_at is null then
    update public.org_temporary_rules set revoked_at = now(), revoked_by = auth.uid() where id = target_rule_id returning * into rule;
  end if;
  return rule;
end;
$$;
revoke all on function public.revoke_temporary_rule(uuid) from public, anon;
grant execute on function public.revoke_temporary_rule(uuid) to authenticated;

/** What company-aware AI flows use: ONLY the rules active right now, members only, bounded, and
 * only while the company's Teams plan is active. */
create or replace function public.get_active_temporary_rules(target_org_id uuid)
returns table (id uuid, body text, starts_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.body, r.starts_at, r.expires_at
  from public.org_temporary_rules r
  where r.org_id = target_org_id
    and public.is_org_member(target_org_id)
    and public.org_has_active_teams(target_org_id) -- paused (not deleted) while the plan is inactive
    and r.revoked_at is null
    and r.starts_at <= now()
    and (r.expires_at is null or r.expires_at > now())
  order by r.created_at desc
  limit 20;
$$;
revoke all on function public.get_active_temporary_rules(uuid) from public, anon;
grant execute on function public.get_active_temporary_rules(uuid) to authenticated;
