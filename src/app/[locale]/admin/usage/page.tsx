import { AdminPageHeader, AdminSection } from "@/components/admin/primitives";

export const metadata = { title: "Usage — Colega Admin" };

export default function AdminUsagePage() {
  return (
    <div className="max-w-2xl">
      <AdminPageHeader
        title="Usage"
        description="How long/how much each user has used Colega — not tracked yet."
      />

      <AdminSection title="Why this is empty">
        <p className="text-sm leading-relaxed text-muted">
          Neither the desktop app nor this website currently records session activity or product
          events anywhere in the shared Supabase project. There is no table this page could
          honestly read from, so rather than estimate or fabricate numbers, it shows nothing.
        </p>
      </AdminSection>

      <div className="mt-5">
        <AdminSection title="What would be required — desktop telemetry (not built here)">
          <p className="text-sm leading-relaxed text-muted">
            A privacy-conscious design, per Section 10/11 of this build&apos;s instructions —
            aggregate counters only, never screen content, never a detailed activity timeline:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-border bg-white/[0.03] p-4 text-xs text-muted-dim">
{`create table public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  platform text,       -- 'windows' | 'mac'
  app_version text
);

-- Aggregate product-event counters (Section 11), metadata/counts only — never prompt or
-- screen content:
create table public.product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,  -- 'colega_opened' | 'check_screen' | 'ask_colega' | ...
  created_at timestamptz not null default now()
);`}
          </pre>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Desktop (colega/src/) would need to open/heartbeat a user_sessions row on launch and
            increment product_events counters at the relevant call sites — genuine desktop
            changes, deliberately not made in this pass (this session is scoped to colega-web
            only). Once that data exists, this page would show total active time, session
            counts, and last-active date per Section 10 — aggregates only, never a timeline of
            what a user did.
          </p>
        </AdminSection>
      </div>
    </div>
  );
}
