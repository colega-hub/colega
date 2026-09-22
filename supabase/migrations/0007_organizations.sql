-- Colega for Teams — Phase A: organizations + membership + company knowledge, foundation only.
-- Run this against the same Supabase project that already has 0001-0006 applied (SQL Editor ->
-- paste -> Run, or `supabase db push`). Additive only — does not touch any existing table's
-- columns except one new nullable column on insights (see bottom). Safe to re-run (every
-- statement is idempotent).
--
-- ============================================================================
-- WHY NOT REUSE work_rooms / work_room_members
-- ============================================================================
-- work_rooms is the right *shape* (named group + membership + role) but is semantically tied to
-- the removed chat/collaboration feature (work_room_messages, work_room_ai_state, invite tokens
-- for that flow) and only has two roles (owner/member — Teams needs admin as a third). Fresh
-- tables here copy the *pattern*, not the tables.
--
-- ============================================================================
-- RLS SHAPE — directly reusing the two hard-won lessons from 0002/0003
-- ============================================================================
--   1. (0002's lesson) Never inline `exists (select ... from organization_members)` inside a
--      policy ON organization_members itself — that is the exact infinite-recursion bug fixed in
--      0002. public.is_org_member()/is_org_admin() below are SECURITY DEFINER helpers, same
--      shape as is_work_room_member()/is_work_room_owner(): take only a target org id (never a
--      caller-supplied user id), resolve identity via auth.uid() only, fixed search_path, stable,
--      EXECUTE revoked from public/anon and granted only to authenticated.
--   2. (0003's lesson) Creating an org + the creator's own membership row must be ONE
--      SECURITY DEFINER RPC (create_organization below), not two separate client inserts — that
--      is the exact RETURNING-vs-SELECT-policy race fixed in 0003.
--
-- ============================================================================
-- DRAFT -> VERIFIED -> CRITICAL_RULE
-- ============================================================================
-- org_knowledge_items.status defaults to, and its INSERT policy enforces, 'draft' — a knowledge
-- item is NEVER created already-verified, whether it came from a document, an example, or a
-- future Teach-by-doing session. Only an org admin/owner can UPDATE status to 'verified' or the
-- deliberately-rare 'critical_rule'. Only verified/critical_rule items are meant to ever be read
-- into an AI prompt (that filtering happens app-side, at query time — this migration only
-- guarantees the never-auto-published invariant at the database level).

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.organization_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- Knowledge/Procedures/Rules/Systems/Products/Pricing/Brand/Examples share one table with a
-- `kind` + `status` column rather than eight separate tables (spec: "architectural distinction,
-- not necessarily eight UIs"). trigger_hint is a short free-text hint for when this item is
-- relevant (e.g. an app name or task keyword) — informational only, matching app_context's
-- convention on insights, never a hard-coded rules-engine key.
create table if not exists public.org_knowledge_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('knowledge', 'procedure', 'rule', 'system', 'product', 'pricing', 'brand', 'example')),
  title text not null check (char_length(trim(title)) between 1 and 200),
  content text not null check (char_length(trim(content)) between 1 and 8000),
  status text not null default 'draft' check (status in ('draft', 'verified', 'critical_rule')),
  importance text check (importance in ('normal', 'high')),
  trigger_hint text,
  created_by uuid not null references auth.users(id) on delete cascade,
  verified_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organization_members_user_idx on public.organization_members (user_id);
create index if not exists org_knowledge_items_org_status_idx on public.org_knowledge_items (org_id, status);
create index if not exists org_knowledge_items_org_kind_idx on public.org_knowledge_items (org_id, kind);

-- ============================================================================
-- SECURITY DEFINER helper functions (see lesson 1 above)
-- ============================================================================

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.org_id = target_org_id
      and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.is_org_member(uuid) from anon;
grant execute on function public.is_org_member(uuid) to authenticated;

create or replace function public.is_org_admin(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.org_id = target_org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;

revoke all on function public.is_org_admin(uuid) from public;
revoke all on function public.is_org_admin(uuid) from anon;
grant execute on function public.is_org_admin(uuid) to authenticated;

-- ============================================================================
-- create_organization — atomic org + creator's own 'owner' membership row (see lesson 2 above)
-- ============================================================================

create or replace function public.create_organization(org_name text)
returns public.organizations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  trimmed_name text := trim(org_name);
  new_org public.organizations;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  if char_length(trimmed_name) < 1 or char_length(trimmed_name) > 80 then
    raise exception 'Organization name must be between 1 and 80 characters.' using errcode = '22023';
  end if;

  insert into public.organizations (name, owner_id)
  values (trimmed_name, auth.uid())
  returning * into new_org;

  insert into public.organization_members (org_id, user_id, role)
  values (new_org.id, auth.uid(), 'owner');

  return new_org;
end;
$$;

revoke all on function public.create_organization(text) from public;
revoke all on function public.create_organization(text) from anon;
grant execute on function public.create_organization(text) to authenticated;

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.org_knowledge_items enable row level security;

-- organizations: members can read; direct insert policy kept (safe standalone — owner_id must
-- equal auth.uid(), same reasoning as work_rooms' own insert policy) even though the app uses
-- create_organization() for the atomic two-insert bootstrap; owner or admin can update; no
-- delete policy — archive via archived_at instead of a hard delete.
drop policy if exists "members can read their organizations" on public.organizations;
create policy "members can read their organizations"
  on public.organizations for select
  using (public.is_org_member(id));

drop policy if exists "signed-in users can create an organization (become its owner)" on public.organizations;
create policy "signed-in users can create an organization (become its owner)"
  on public.organizations for insert
  with check (auth.uid() = owner_id);

drop policy if exists "owner or admin can update their organization" on public.organizations;
create policy "owner or admin can update their organization"
  on public.organizations for update
  using (public.is_org_admin(id))
  with check (public.is_org_admin(id));

-- organization_members: members can see the roster; only an existing admin/owner can add or
-- change a member's role (the creator's own bootstrap row comes from create_organization's
-- SECURITY DEFINER insert, not this policy); a member can remove themselves, an admin/owner can
-- remove anyone.
drop policy if exists "members can see their organization's roster" on public.organization_members;
create policy "members can see their organization's roster"
  on public.organization_members for select
  using (public.is_org_member(org_id));

drop policy if exists "admin or owner can add members" on public.organization_members;
create policy "admin or owner can add members"
  on public.organization_members for insert
  with check (public.is_org_admin(org_id));

drop policy if exists "admin or owner can change a member's role" on public.organization_members;
create policy "admin or owner can change a member's role"
  on public.organization_members for update
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));

drop policy if exists "member can leave, admin or owner can remove anyone" on public.organization_members;
create policy "member can leave, admin or owner can remove anyone"
  on public.organization_members for delete
  using (
    auth.uid() = user_id
    or public.is_org_admin(org_id)
  );

-- org_knowledge_items: any member can read verified/critical_rule items (this is the live
-- company context); a draft is only visible to its own author and admins/owners until reviewed.
-- Only an admin/owner can create an item, and only ever as 'draft' — the WITH CHECK's
-- `status = 'draft'` makes "never auto-published" a database guarantee, not just an app
-- convention. Only an admin/owner can update (including the draft -> verified / critical_rule
-- promotion) or delete.
drop policy if exists "members can read verified knowledge, authors and admins can read drafts" on public.org_knowledge_items;
create policy "members can read verified knowledge, authors and admins can read drafts"
  on public.org_knowledge_items for select
  using (
    public.is_org_member(org_id)
    and (
      status in ('verified', 'critical_rule')
      or created_by = auth.uid()
      or public.is_org_admin(org_id)
    )
  );

drop policy if exists "admin or owner can propose knowledge as a draft" on public.org_knowledge_items;
create policy "admin or owner can propose knowledge as a draft"
  on public.org_knowledge_items for insert
  with check (
    public.is_org_admin(org_id)
    and created_by = auth.uid()
    and status = 'draft'
  );

drop policy if exists "admin or owner can edit or verify knowledge" on public.org_knowledge_items;
create policy "admin or owner can edit or verify knowledge"
  on public.org_knowledge_items for update
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));

drop policy if exists "admin or owner can delete knowledge" on public.org_knowledge_items;
create policy "admin or owner can delete knowledge"
  on public.org_knowledge_items for delete
  using (public.is_org_admin(org_id));

-- ============================================================================
-- insights.source_ref — additive, nullable. Which org_knowledge_item (if any) this Insight was
-- based on, for spec's source-transparency requirement ("Based on: Motor Delivery Procedure").
-- No existing column, index, or policy touched — row-level policies from 0006 already cover
-- every column on this table, including this new one.
-- ============================================================================

alter table public.insights add column if not exists source_ref jsonb;
comment on column public.insights.source_ref is
  'Optional {orgKnowledgeItemId, title} pointer to the verified company-knowledge item (if any) this Insight was based on — informational/display only, never a foreign key (the referenced org_knowledge_item may later be edited or deleted; this is a point-in-time citation snapshot, not a live join).';
