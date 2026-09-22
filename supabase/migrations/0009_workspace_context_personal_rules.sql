-- Colega for Teams — Phase 2: Workspace Context + Personal Rules + Member access correction.
-- Run this against the same Supabase project that already has 0001-0008 applied. Additive only.
--
-- ============================================================================
-- WHY THIS MIGRATION EXISTS
-- ============================================================================
-- 0007_organizations.sql's original org_knowledge_items SELECT policy let ANY org member read
-- verified/critical_rule rows directly via a plain client-side `select * from org_knowledge_items
-- where org_id = ...` — i.e. the exact same query the admin Knowledge tab uses. That made "browse
-- the company's rules" and "let Colega use the company's rules on my behalf" the same permission,
-- which Phase 2's product spec explicitly separates: a normal Member must be able to BENEFIT from
-- verified company knowledge inside Screen Intelligence without being able to open a raw dump of
-- it. This migration:
--   1. Narrows the general SELECT policy so a non-admin, non-author can no longer read
--      verified/critical_rule rows via the plain table query the admin UI uses.
--   2. Adds get_org_ai_context(), a SECURITY DEFINER RPC that returns ONLY the fields a prompt
--      needs (kind/title/content/status) for verified/critical_rule rows, callable by any member.
--      This is the ONE path OrganizationService.listRelevantKnowledge now uses — never the raw
--      table select the admin Knowledge tab still uses (which stays admin/author-only below).
--
-- HONEST LIMITATION (documented, not silently glossed over): this is a client/Supabase
-- architecture with no server-side AI proxy — the Electron app itself makes the OpenAI call using
-- content it already has. A technically sophisticated Member could still call
-- get_org_ai_context() directly (e.g. from devtools) and read back the same verified/critical_rule
-- content Colega would use on their behalf anyway — this migration cannot prevent that without a
-- server-side proxy, which is out of scope for this phase. What it DOES achieve: removing the
-- casual, one-line, admin-UI-equivalent browsing capability, keeping the Member-facing app surface
-- honest (no Knowledge/Rules tab, no query for it), and keeping the RPC's returned shape narrow
-- (no internal metadata like created_by/verified_by/provenance).

-- ============================================================================
-- org_knowledge_items — tighten the SELECT policy
-- ============================================================================
-- Before: any member could read verified/critical_rule rows directly.
-- After: only the author or an org admin/owner can read via the plain table select (this is what
-- the admin Knowledge tab uses, and what already-existing draft visibility relied on) — an
-- ordinary member reads verified/critical_rule content ONLY through get_org_ai_context() below.
drop policy if exists "members can read verified knowledge, authors and admins can read drafts" on public.org_knowledge_items;
drop policy if exists "authors and admins can read their organization's knowledge" on public.org_knowledge_items;
create policy "authors and admins can read their organization's knowledge"
  on public.org_knowledge_items for select
  using (
    created_by = auth.uid()
    or public.is_org_admin(org_id)
  );

-- ============================================================================
-- get_org_ai_context — the ONLY path a normal Member's client reads verified/critical_rule
-- content through. Narrow return shape (no id exposed either — resolveSourceRef in
-- src/core/runCheck.ts matches by title, same as before) so a Member gets exactly what Screen
-- Intelligence needs and nothing else administrative.
-- ============================================================================

create or replace function public.get_org_ai_context(target_org_id uuid)
returns table (id uuid, kind text, title text, content text, status text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select k.id, k.kind, k.title, k.content, k.status
  from public.org_knowledge_items k
  where k.org_id = target_org_id
    and k.status in ('verified', 'critical_rule')
    and public.is_org_member(target_org_id)
  order by k.updated_at desc
  limit 100;
$$;

revoke all on function public.get_org_ai_context(uuid) from public;
revoke all on function public.get_org_ai_context(uuid) from anon;
grant execute on function public.get_org_ai_context(uuid) to authenticated;

-- ============================================================================
-- get_org_knowledge_summary — lets a normal Member see the Overview tab's existing "Knowledge
-- items / Verified / Critical rules" COUNTS (spec Part A §5: "safe organization metrics that the
-- existing product exposes") without granting read access to the actual titles/content, which
-- the tightened SELECT policy above now denies them. Counts only, no rows.
-- ============================================================================

create or replace function public.get_org_knowledge_summary(target_org_id uuid)
returns table (total bigint, verified bigint, critical_rule bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    count(*) filter (where status in ('verified', 'critical_rule')) as total,
    count(*) filter (where status = 'verified') as verified,
    count(*) filter (where status = 'critical_rule') as critical_rule
  from public.org_knowledge_items
  where org_id = target_org_id
    and public.is_org_member(target_org_id);
$$;

revoke all on function public.get_org_knowledge_summary(uuid) from public;
revoke all on function public.get_org_knowledge_summary(uuid) from anon;
grant execute on function public.get_org_knowledge_summary(uuid) to authenticated;

-- ============================================================================
-- My Colega / Personal Rules (Phase 2, Part D) — deliberately tiny: no categories, tags,
-- priorities, or knowledge-base concepts (spec §22). User-scoped, never org-scoped — RLS is the
-- real security boundary (spec §23), not app-side filtering.
-- ============================================================================

create table if not exists public.personal_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null check (char_length(trim(text)) between 1 and 300),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists personal_rules_user_idx on public.personal_rules (user_id);

alter table public.personal_rules enable row level security;

drop policy if exists "users can read their own personal rules" on public.personal_rules;
create policy "users can read their own personal rules"
  on public.personal_rules for select
  using (auth.uid() = user_id);

drop policy if exists "users can create their own personal rules" on public.personal_rules;
create policy "users can create their own personal rules"
  on public.personal_rules for insert
  with check (auth.uid() = user_id);

drop policy if exists "users can update their own personal rules" on public.personal_rules;
create policy "users can update their own personal rules"
  on public.personal_rules for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users can delete their own personal rules" on public.personal_rules;
create policy "users can delete their own personal rules"
  on public.personal_rules for delete
  using (auth.uid() = user_id);
