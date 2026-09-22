"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, CreditCard, Download, LogOut, ShieldCheck, User as UserIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { User } from "@supabase/supabase-js";
import { Link } from "@/i18n/navigation";
import { logout } from "@/lib/auth/actions";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export function AccountMenu({ user }: { user: User }) {
  const t = useTranslations("accountMenu");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Cosmetic only — showing/hiding this link is not the security boundary (that's
  // src/lib/admin/guard.ts, enforced server-side on every /admin request). `is_admin()` is
  // granted to `authenticated` specifically so this check is safe to run from the browser: it
  // can only ever answer "am I an admin", never reveal anything about other accounts.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    createClient()
      .rpc("is_admin")
      .then(({ data }: { data: boolean | null }) => {
        if (active) setIsAdmin(!!data);
      });
    return () => {
      active = false;
    };
  }, []);

  const label =
    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) ||
    user.email ||
    t("trigger");

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-border-strong bg-white/[0.03] py-1.5 pl-1.5 pr-3 text-sm font-medium text-foreground transition-colors hover:bg-white/[0.06]"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-accent-strong to-accent-2 text-xs font-bold text-white">
          <UserIcon size={14} />
        </span>
        <span className="max-w-[140px] truncate">{label}</span>
        <ChevronDown size={14} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-border-strong bg-background-alt/95 p-1.5 shadow-xl backdrop-blur-xl"
          >
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-white/[0.06]"
            >
              <UserIcon size={16} className="text-muted-dim" />
              {t("account")}
            </Link>
            <Link
              href="/account#plan"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-white/[0.06]"
            >
              <CreditCard size={16} className="text-muted-dim" />
              {t("subscription")}
            </Link>
            <Link
              href="/download"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-white/[0.06]"
            >
              <Download size={16} className="text-muted-dim" />
              {t("download")}
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-white/[0.06]"
              >
                <ShieldCheck size={16} className="text-accent-strong" />
                Admin
              </Link>
            )}
            <div className="my-1 h-px bg-border" />
            <form action={logout}>
              <input type="hidden" name="locale" value={locale} />
              <button
                type="submit"
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-white/[0.06]"
              >
                <LogOut size={16} className="text-muted-dim" />
                {t("logout")}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
