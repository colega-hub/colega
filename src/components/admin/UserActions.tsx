"use client";

import { useState, useTransition } from "react";
import { Ban, CheckCircle2, Mail, ShieldOff, X } from "lucide-react";
import {
  grantTemporaryEntitlement,
  resendVerificationEmail,
  revokeTemporaryEntitlement,
  setUserSuspended,
} from "@/lib/admin/actions";
import { friendlyAdminError } from "@/lib/admin/errors";
import { formatDateTime } from "./primitives";
import type { EntitlementGrantRow } from "@/lib/admin/types";

const DURATION_PRESETS = [1, 3, 7, 14, 30] as const;

function ActionFeedback({ message, tone }: { message: string; tone: "error" | "success" }) {
  return (
    <p className={`mt-2 text-xs ${tone === "error" ? "text-red-400" : "text-emerald-400"}`}>{message}</p>
  );
}

export function GrantEntitlementForm({ userId }: { userId: string }) {
  const [plan, setPlan] = useState<"pro" | "teams">("pro");
  const [days, setDays] = useState<number>(7);
  const [customDays, setCustomDays] = useState("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; message: string } | null>(null);

  function submit() {
    const effectiveDays = customDays ? Number(customDays) : days;
    setFeedback(null);
    startTransition(async () => {
      const result = await grantTemporaryEntitlement({ userId, plan, days: effectiveDays, reason });
      if (result.ok) {
        setFeedback({ tone: "success", message: "Access granted." });
        setReason("");
        setCustomDays("");
      } else {
        setFeedback({ tone: "error", message: friendlyAdminError(result.error) });
      }
    });
  }

  return (
    <div className="rounded-xl border border-border-strong bg-white/[0.02] p-4">
      <p className="mb-3 text-sm font-medium text-foreground">Grant temporary access</p>
      <div className="flex flex-wrap items-center gap-2">
        {(["pro", "teams"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPlan(p)}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
              plan === p
                ? "border-accent/40 bg-accent/10 text-accent-strong"
                : "border-border-strong text-muted hover:text-foreground"
            }`}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {DURATION_PRESETS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => {
              setDays(d);
              setCustomDays("");
            }}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              !customDays && days === d
                ? "border-accent/40 bg-accent/10 text-accent-strong"
                : "border-border-strong text-muted hover:text-foreground"
            }`}
          >
            {d} day{d === 1 ? "" : "s"}
          </button>
        ))}
        <input
          type="number"
          min={1}
          max={30}
          placeholder="Custom days"
          value={customDays}
          onChange={(e) => setCustomDays(e.target.value)}
          className="h-7 w-28 rounded-full border border-border-strong bg-transparent px-3 text-xs text-foreground outline-none focus:border-accent/60"
        />
      </div>
      <input
        type="text"
        placeholder="Reason (optional — shown in audit log)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="mt-3 h-9 w-full rounded-lg border border-border bg-white/[0.03] px-3 text-sm text-foreground outline-none focus:border-accent/60"
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="mt-3 h-9 rounded-lg bg-accent-strong px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Granting…" : "Grant access"}
      </button>
      {feedback && <ActionFeedback tone={feedback.tone} message={feedback.message} />}
    </div>
  );
}

export function GrantsList({ userId, grants }: { userId: string; grants: EntitlementGrantRow[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (grants.length === 0) {
    return <p className="text-sm text-muted-dim">No admin-granted access on record.</p>;
  }

  function revoke(grantId: string) {
    setPendingId(grantId);
    startTransition(async () => {
      await revokeTemporaryEntitlement({ grantId, userId });
      setPendingId(null);
    });
  }

  return (
    <ul className="flex flex-col gap-2">
      {grants.map((g) => {
        const active = !g.revoked_at && new Date(g.expires_at) > new Date();
        return (
          <li
            key={g.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white/[0.02] px-4 py-2.5 text-sm"
          >
            <div>
              <span className="font-medium capitalize text-foreground">{g.plan}</span>{" "}
              <span className="text-muted-dim">
                {active ? "active until" : g.revoked_at ? "revoked, was until" : "expired"}{" "}
                {formatDateTime(g.expires_at)}
              </span>
              {g.reason && <div className="text-xs text-muted-dim">“{g.reason}”</div>}
            </div>
            {active && (
              <button
                type="button"
                onClick={() => revoke(g.id)}
                disabled={pendingId === g.id}
                className="flex items-center gap-1 rounded-lg border border-border-strong px-2.5 py-1 text-xs text-muted transition-colors hover:border-red-500/40 hover:text-red-300 disabled:opacity-50"
              >
                <X size={12} /> Revoke
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function SuspendToggleButton({
  userId,
  suspended,
}: {
  userId: string;
  suspended: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; message: string } | null>(null);

  function run() {
    setConfirming(false);
    startTransition(async () => {
      const result = await setUserSuspended({ userId, suspended: !suspended });
      setFeedback(
        result.ok
          ? { tone: "success", message: suspended ? "Account reactivated." : "Account suspended." }
          : { tone: "error", message: friendlyAdminError(result.error) }
      );
    });
  }

  return (
    <div>
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            suspended
              ? "border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
              : "border-red-500/30 text-red-300 hover:bg-red-500/10"
          }`}
        >
          {suspended ? <CheckCircle2 size={16} /> : <Ban size={16} />}
          {suspended ? "Reactivate account" : "Suspend account"}
        </button>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm">
          <span className="text-red-200">
            {suspended ? "Reactivate this account?" : "Suspend this account? They will be signed out and unable to log in."}
          </span>
          <button
            type="button"
            onClick={run}
            disabled={pending}
            className="rounded-md bg-red-500/20 px-2.5 py-1 text-xs font-semibold text-red-200 hover:bg-red-500/30 disabled:opacity-50"
          >
            {pending ? "Working…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-xs text-muted-dim hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}
      {feedback && <ActionFeedback tone={feedback.tone} message={feedback.message} />}
    </div>
  );
}

export function ResendVerificationButton({ userId, email }: { userId: string; email: string }) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; message: string } | null>(null);

  function run() {
    startTransition(async () => {
      const result = await resendVerificationEmail({ userId, email });
      setFeedback(
        result.ok
          ? { tone: "success", message: "Verification email sent." }
          : { tone: "error", message: friendlyAdminError(result.error) }
      );
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="flex items-center gap-2 rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-white/[0.06] disabled:opacity-50"
      >
        {pending ? <ShieldOff size={16} className="animate-pulse" /> : <Mail size={16} />}
        Resend verification email
      </button>
      {feedback && <ActionFeedback tone={feedback.tone} message={feedback.message} />}
    </div>
  );
}
