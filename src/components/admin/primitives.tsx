import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        {description && <p className="mt-1.5 text-sm text-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="card-surface rounded-2xl p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-dim">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-dim">{hint}</p>}
    </div>
  );
}

export function NotTrackedStat({ label }: { label: string }) {
  return (
    <div className="card-surface rounded-2xl border-dashed p-5 opacity-70">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-dim">{label}</p>
      <p className="mt-2 text-sm font-medium text-muted-dim">Not tracked yet</p>
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "warning" | "danger" | "success";
}) {
  const toneClasses: Record<string, string> = {
    neutral: "border-border-strong bg-white/[0.04] text-muted",
    accent: "border-accent/30 bg-accent/10 text-accent-strong",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    danger: "border-red-500/30 bg-red-500/10 text-red-300",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        toneClasses[tone]
      )}
    >
      {children}
    </span>
  );
}

export function PlanPill({ plan }: { plan: string }) {
  if (plan === "teams") return <Pill tone="accent">Teams</Pill>;
  if (plan === "pro") return <Pill tone="accent">Pro</Pill>;
  return <Pill tone="neutral">Free</Pill>;
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="card-surface flex flex-col items-center gap-1 rounded-2xl px-6 py-14 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {body && <p className="max-w-sm text-xs text-muted-dim">{body}</p>}
    </div>
  );
}

export function AdminSection({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card-surface rounded-2xl p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-dim">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function DataRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-muted-dim">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
