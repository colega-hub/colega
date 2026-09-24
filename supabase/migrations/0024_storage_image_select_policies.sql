-- Fix: avatar and company-logo uploads fail with "You do not have permission to do this."
-- Run against the same project that already has 0001-0023 applied (0020-0023 live in the
-- colega-web repo; this number deliberately continues after them so the shared project's
-- migration history never has two different files claiming the same number).
--
-- ROOT CAUSE
-- 0019 created INSERT / UPDATE / DELETE policies on storage.objects for the `avatars` and
-- `company-logos` buckets, but NO SELECT policy. The desktop uploads with `upsert: true`
-- (src/storage/imageUpload.ts — one fixed `<owner>/photo.<ext>` path, replaced in place), and
-- Supabase Storage documents that overwriting requires SELECT and UPDATE in addition to INSERT
-- (the upsert is an INSERT ... ON CONFLICT DO UPDATE whose conflicting row must be visible, and
-- the written row is read back). With no SELECT policy every upload is rejected by RLS — for the
-- account owner and for a company owner/admin alike — and surfaces as `permission_denied`.
-- The same gap made `list()` (used to clean up a previous photo.<ext> and on company deletion)
-- silently return nothing, and delete-by-path read nothing back.
--
-- `public: true` on these buckets only makes objects downloadable via the public URL endpoint;
-- it does not grant any Storage API operation, which is why the bucket being public didn't help.
--
-- FIX — least privilege, mirroring the existing write policies exactly:
--   avatars:        a user can see objects only under their OWN `<auth.uid()>/` folder
--   company-logos:  only an owner/admin of THAT organization (public.is_org_admin, 0007) can see
--                   objects under `<org_id>/`
-- Nothing becomes readable through the Storage API that wasn't already writable by the same
-- caller; public image URLs (what <img> tags use) are unaffected. No existing policy is dropped
-- or widened, RLS stays enabled, no service-role path is introduced.
--
-- Robustness: the folder segment is compared as TEXT for avatars and regex-guarded inside a
-- CASE before the ::uuid cast for company-logos, so a malformed object name elsewhere in
-- storage.objects can never make these policies raise "invalid input syntax for type uuid".

drop policy if exists "users can read their own avatar objects" on storage.objects;
create policy "users can read their own avatar objects"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "org admins can read their org's logo objects" on storage.objects;
create policy "org admins can read their org's logo objects"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'company-logos'
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_org_admin(((storage.foldername(name))[1])::uuid)
      else false
    end
  );
