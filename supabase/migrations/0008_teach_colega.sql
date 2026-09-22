-- Colega for Teams — Phase F: Teach Colega (document learning + workflow training), foundation
-- only. Run this against the same Supabase project that already has 0001-0007 applied (SQL
-- Editor -> paste -> Run inside begin/commit, or `supabase db push`). Additive only — does not
-- touch any existing table's data, only adds two new tables and one new nullable column on
-- org_knowledge_items. Safe to re-run (every statement is idempotent).
--
-- ============================================================================
-- WHY NO "candidates" TABLE
-- ============================================================================
-- AI-extracted knowledge candidates (from a document or a training session) are never persisted
-- as their own row — they live only in the renderer's in-memory review-queue state until the
-- admin explicitly keeps one, at which point it is written straight into the EXISTING
-- org_knowledge_items table as an ordinary 'draft' row (via the same createKnowledge path Phase E
-- already uses), just carrying a `provenance` value. This is deliberate: Teach Colega is an INPUT
-- system into the existing Company Knowledge model, not a second, parallel one — a discarded or
-- edited-before-keeping candidate never touches the database at all.
--
-- ============================================================================
-- WHY NO RAW-OBSERVATION TABLE FOR TRAINING
-- ============================================================================
-- Workflow training's screenshots are transient, in-memory only (see the app's capture code) —
-- never written to disk or Supabase, discarded the moment the session finishes or is cancelled.
-- workflow_training_sessions therefore only ever gets a row at Finish time (already carrying the
-- outcome), never an earlier "observing" row — cancelling a session is then trivially "no ghost
-- process": nothing was ever written for it to begin with.
--
-- ============================================================================
-- RLS SHAPE — reusing the exact is_org_admin() helper from 0007, no new recursion risk
-- ============================================================================
-- Documents and training sessions may contain confidential company material, so both tables are
-- admin/owner-only end to end (see spec's role model: only Owner/Admin upload/train; members only
-- ever consume the resulting VERIFIED org_knowledge_items, unchanged from Phase E). An ordinary
-- member's "Based on: X / Source: Y.pdf" citation reads the new `provenance` snapshot column
-- directly off org_knowledge_items (already readable once verified) — it never needs to query
-- organization_documents or workflow_training_sessions at all.

create table if not exists public.organization_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  filename text not null check (char_length(trim(filename)) between 1 and 255),
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 15728640), -- 15 MB cap
  storage_path text not null,
  status text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  -- Calm, pre-written failure description only (e.g. "This document doesn't contain readable
  -- text yet.") — NEVER the document body, NEVER a raw parser/AI error string.
  error_message text,
  candidate_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_training_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  status text not null default 'finalizing' check (status in ('finalizing', 'ready', 'failed')),
  error_message text,
  step_count integer,
  started_at timestamptz not null,
  finished_at timestamptz not null default now()
);

create index if not exists organization_documents_org_idx on public.organization_documents (org_id, created_at desc);
create index if not exists workflow_training_sessions_org_idx on public.workflow_training_sessions (org_id, finished_at desc);

-- ============================================================================
-- org_knowledge_items.provenance — additive, nullable. Deliberately NOT named "source_ref" (that
-- name is already used elsewhere in this codebase for "which knowledge item did an AI answer
-- cite" — see insights.source_ref from 0007). This is the opposite direction: where THIS
-- knowledge item itself came from. A point-in-time snapshot, same convention as
-- insights.source_ref — never a live join, so it keeps working (as a historical label) even after
-- the source document/training session is later deleted.
-- Shape: {"type": "manual" | "document" | "training", "documentId"?, "documentFilename"?,
--         "trainingSessionId"?, "trainingSessionTitle"?, "locator"?}
-- ============================================================================

alter table public.org_knowledge_items add column if not exists provenance jsonb;
comment on column public.org_knowledge_items.provenance is
  'Optional snapshot of where this item came from (manual entry, an uploaded document, or a taught workflow) — informational/display only, never a live join; the referenced document/session may later be deleted without invalidating this label.';

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.organization_documents enable row level security;
alter table public.workflow_training_sessions enable row level security;

drop policy if exists "admins can read their org's documents" on public.organization_documents;
create policy "admins can read their org's documents"
  on public.organization_documents for select
  using (public.is_org_admin(org_id));

drop policy if exists "admins can upload documents as themselves" on public.organization_documents;
create policy "admins can upload documents as themselves"
  on public.organization_documents for insert
  with check (public.is_org_admin(org_id) and uploaded_by = auth.uid());

drop policy if exists "admins can update their org's documents" on public.organization_documents;
create policy "admins can update their org's documents"
  on public.organization_documents for update
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));

drop policy if exists "admins can delete their org's documents" on public.organization_documents;
create policy "admins can delete their org's documents"
  on public.organization_documents for delete
  using (public.is_org_admin(org_id));

drop policy if exists "admins can read their org's training sessions" on public.workflow_training_sessions;
create policy "admins can read their org's training sessions"
  on public.workflow_training_sessions for select
  using (public.is_org_admin(org_id));

drop policy if exists "admins can create training sessions as themselves" on public.workflow_training_sessions;
create policy "admins can create training sessions as themselves"
  on public.workflow_training_sessions for insert
  with check (public.is_org_admin(org_id) and created_by = auth.uid());

drop policy if exists "admins can update their org's training sessions" on public.workflow_training_sessions;
create policy "admins can update their org's training sessions"
  on public.workflow_training_sessions for update
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));

drop policy if exists "admins can delete their org's training sessions" on public.workflow_training_sessions;
create policy "admins can delete their org's training sessions"
  on public.workflow_training_sessions for delete
  using (public.is_org_admin(org_id));

-- ============================================================================
-- Storage — a single private bucket for uploaded company documents, isolated per-organization by
-- path convention ('{org_id}/{document_id}/{sanitized_filename}') and enforced by policy (not
-- just convention): storage.foldername(name) reads the first path segment as the org id and
-- checks it against the SAME is_org_admin() helper everything else uses. No public access, no
-- anon access, no cross-org access — an admin of org A can never read/write/delete a path whose
-- first segment isn't an org they administer.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('organization-documents', 'organization-documents', false, 15728640)
on conflict (id) do nothing;

drop policy if exists "org admins can upload their org's documents" on storage.objects;
create policy "org admins can upload their org's documents"
  on storage.objects for insert
  with check (
    bucket_id = 'organization-documents'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "org admins can read their org's documents" on storage.objects;
create policy "org admins can read their org's documents"
  on storage.objects for select
  using (
    bucket_id = 'organization-documents'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "org admins can delete their org's documents" on storage.objects;
create policy "org admins can delete their org's documents"
  on storage.objects for delete
  using (
    bucket_id = 'organization-documents'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );
