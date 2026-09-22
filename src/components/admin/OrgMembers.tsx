"use client";

import { useState, useTransition } from "react";
import { UserMinus, UserPlus } from "lucide-react";
import { setOrganizationMembership } from "@/lib/admin/actions";
import { friendlyAdminError } from "@/lib/admin/errors";
import { Pill } from "./primitives";
import { Link } from "@/i18n/navigation";

type Member = {
  user_id: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
  display_name: string | null;
  username: string | null;
  email: string | null;
};

export function OrgMembersList({ orgId, members }: { orgId: string; members: Member[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState<"member" | "admin">("member");
  const [feedback, setFeedback] = useState<string | null>(null);

  function remove(userId: string) {
    setPendingId(userId);
    startTransition(async () => {
      await setOrganizationMembership({ orgId, userId, action: "remove" });
      setPendingId(null);
    });
  }

  function add() {
    if (!addUserId.trim()) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await setOrganizationMembership({
        orgId,
        userId: addUserId.trim(),
        action: "add",
        role: addRole,
      });
      setFeedback(result.ok ? "Member added." : friendlyAdminError(result.error));
      if (result.ok) setAddUserId("");
    });
  }

  return (
    <div>
      <ul className="flex flex-col gap-2">
        {members.map((m) => (
          <li
            key={m.user_id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white/[0.02] px-4 py-2.5 text-sm"
          >
            <div>
              <Link href={`/admin/users/${m.user_id}`} className="font-medium text-foreground hover:text-accent-strong">
                {m.display_name || m.username || m.email || m.user_id}
              </Link>
              <div className="text-xs text-muted-dim">{m.email}</div>
            </div>
            <div className="flex items-center gap-2">
              <Pill>{m.role}</Pill>
              {m.role !== "owner" && (
                <button
                  type="button"
                  onClick={() => remove(m.user_id)}
                  disabled={pendingId === m.user_id}
                  className="flex items-center gap-1 rounded-lg border border-border-strong px-2 py-1 text-xs text-muted transition-colors hover:border-red-500/40 hover:text-red-300 disabled:opacity-50"
                >
                  <UserMinus size={12} /> Remove
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border-strong p-3">
        <input
          type="text"
          placeholder="User ID to add"
          value={addUserId}
          onChange={(e) => setAddUserId(e.target.value)}
          className="h-8 flex-1 min-w-[160px] rounded-lg border border-border bg-white/[0.03] px-2.5 text-xs text-foreground outline-none focus:border-accent/60"
        />
        <select
          value={addRole}
          onChange={(e) => setAddRole(e.target.value as "member" | "admin")}
          className="h-8 rounded-lg border border-border bg-white/[0.03] px-2 text-xs text-foreground outline-none"
        >
          <option value="member">member</option>
          <option value="admin">admin</option>
        </select>
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1 rounded-lg bg-accent-strong px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
          <UserPlus size={12} /> Add
        </button>
      </div>
      {feedback && <p className="mt-2 text-xs text-muted-dim">{feedback}</p>}
      <p className="mt-2 text-[11px] text-muted-dim">
        Find a user&apos;s ID from the Users list or their detail page URL.
      </p>
    </div>
  );
}
