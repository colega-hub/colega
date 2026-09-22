-- Company Management, User Identity & Workspace Visual System phase.
-- Run against the same project that already has 0001-0018 applied.
--
-- Adds: organizations.logo_url (owner/admin-editable, same UPDATE policy as name already uses —
-- see 0007_organizations.sql's "owner or admin can update their organization"), a per-membership
-- job_title a member can edit on their OWN row without needing admin rights, and an owner-only
-- delete_organization() RPC. No existing column, policy, or table is dropped or narrowed.

-- ============================================================================
-- organizations.logo_url — reuses the EXISTING "owner or admin can update their organization"
-- UPDATE policy (0007) verbatim; it already covers every column on this row, so no new policy is
-- needed for rename or logo changes. Consistent with the spec's own instruction to inspect
-- existing permission architecture before deciding — this codebase already grants admins company-
-- metadata rights, not owner-only, so logo/name follow that established rule.
-- ============================================================================

alter table public.organizations add column if not exists logo_url text;

-- ============================================================================
-- organization_members.job_title — a lightweight, membership-scoped label (spec: "Designer",
-- "Founder"), deliberately NOT an authorization concept. A member may hold a different title in
-- every organization they belong to because this lives on the per-membership row, not profiles.
-- ============================================================================

alter table public.organization_members add column if not exists job_title text;
alter table public.organization_members
  drop constraint if exists organization_members_job_title_length;
alter table public.organization_members
  add constraint organization_members_job_title_length check (job_title is null or char_length(trim(job_title)) between 1 and 100);

-- A member may update their OWN row (previously only admins could update ANY row's role via
-- 0007's "admin or owner can change a member's role" policy — members had no self-service update
-- path at all). Postgres combines multiple USING policies for the same command with OR, so this
-- ADDS a self-service path without removing the existing admin one.
drop policy if exists "member can update their own membership row" on public.organization_members;
create policy "member can update their own membership row"
  on public.organization_members for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- SECURITY: the policy above, by itself, would let a member UPDATE ANY column on their own row —
-- including `role`, which would be a real privilege-escalation bug (a member setting their own
-- role to 'owner'). This trigger is the actual enforcement: a non-admin caller updating their own
-- row may change job_title only; role/org_id/user_id/joined_at must stay byte-for-byte identical.
-- An admin/owner updating any row (including their own) is unaffected — their existing broader
-- rights via the 0007 policy already require is_org_admin() and are not narrowed here.
create or replace function public.enforce_org_member_self_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_org_admin(new.org_id) then
    if new.role is distinct from old.role
      or new.org_id is distinct from old.org_id
      or new.user_id is distinct from old.user_id
      or new.joined_at is distinct from old.joined_at
    then
      raise exception 'Members may only edit their own job title.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists organization_members_enforce_self_update on public.organization_members;
create trigger organization_members_enforce_self_update
  before update on public.organization_members
  for each row execute function public.enforce_org_member_self_update();

-- ============================================================================
-- delete_organization — OWNER ONLY, deliberately stricter than is_org_admin() (spec §6: "Admins
-- cannot delete the company... Teams subscription alone does NOT grant permission to delete
-- companies owned by someone else"). Every organization-linked table already has
-- `references public.organizations(id) on delete cascade` (organization_members,
-- org_knowledge_items, organization_documents, workflow_training_sessions,
-- organization_invitations — verified by reading every migration's FK definitions, not guessed),
-- so a single DELETE here is genuinely atomic: either the whole cascade commits or none of it
-- does, inside Postgres's own transaction. Storage objects (company-logos/<org_id>/...,
-- organization-documents/<org_id>/...) are NOT part of this transaction — Postgres cannot delete
-- Storage objects — and are cleaned up by the caller as a best-effort step AFTER this RPC
-- succeeds (see src/organization/OrganizationService.ts's deleteOrganization). A failure in that
-- best-effort cleanup leaves at most an orphaned, inert file under a path whose org_id no longer
-- exists — never a security issue, never blocks the (already-committed) deletion itself.
create or replace function public.delete_organization(target_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  real_owner_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  select owner_id into real_owner_id from public.organizations where id = target_org_id;

  if real_owner_id is null then
    raise exception 'ORGANIZATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if real_owner_id is distinct from auth.uid() then
    raise exception 'OWNER_ONLY' using errcode = '42501';
  end if;

  delete from public.organizations where id = target_org_id;
end;
$$;

revoke all on function public.delete_organization(uuid) from public;
revoke all on function public.delete_organization(uuid) from anon;
grant execute on function public.delete_organization(uuid) to authenticated;

-- ============================================================================
-- Storage — company-logos (public read, like organization-documents' path-scoping but public
-- since a logo needs to render in <img> tags without an authenticated fetch; org-admin-only
-- write, same is_org_admin()-over-storage.foldername pattern as 0008's organization-documents
-- bucket) and avatars (public read, write restricted to the uploader's own auth.uid() path
-- segment — never a client-supplied user id).
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('company-logos', 'company-logos', true, 5242880)
on conflict (id) do nothing;

drop policy if exists "org admins can upload their org's logo" on storage.objects;
create policy "org admins can upload their org's logo"
  on storage.objects for insert
  with check (bucket_id = 'company-logos' and public.is_org_admin(((storage.foldername(name))[1])::uuid));

drop policy if exists "org admins can replace their org's logo" on storage.objects;
create policy "org admins can replace their org's logo"
  on storage.objects for update
  using (bucket_id = 'company-logos' and public.is_org_admin(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'company-logos' and public.is_org_admin(((storage.foldername(name))[1])::uuid));

drop policy if exists "org admins can delete their org's logo" on storage.objects;
create policy "org admins can delete their org's logo"
  on storage.objects for delete
  using (bucket_id = 'company-logos' and public.is_org_admin(((storage.foldername(name))[1])::uuid));

insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', true, 5242880)
on conflict (id) do nothing;

drop policy if exists "users can upload their own avatar" on storage.objects;
create policy "users can upload their own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and ((storage.foldername(name))[1])::uuid = auth.uid());

drop policy if exists "users can replace their own avatar" on storage.objects;
create policy "users can replace their own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1])::uuid = auth.uid())
  with check (bucket_id = 'avatars' and ((storage.foldername(name))[1])::uuid = auth.uid());

drop policy if exists "users can delete their own avatar" on storage.objects;
create policy "users can delete their own avatar"
  on storage.objects for delete
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1])::uuid = auth.uid());
