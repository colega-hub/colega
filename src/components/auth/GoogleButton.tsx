"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { signInWithGoogle, type OAuthActionState } from "@/lib/auth/actions";

const initialState: OAuthActionState = { status: "idle" };

// Google OAuth is now configured (Google Cloud Web Application + Supabase provider + redirect
// URLs, all set up outside this codebase — see docs/AGENTS comments in
// src/lib/auth/actions.ts and src/app/auth/callback/route.ts for the code half). Real
// supabase.auth.signInWithOAuth() call, no manual OAuth implementation.
export function GoogleButton({ label }: { label: string }) {
  const t = useTranslations("auth");
  const tErrors = useTranslations("auth.errors");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(signInWithGoogle, initialState);

  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name="locale" value={locale} />
        <button
          type="submit"
          disabled={pending}
          className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-border-strong bg-white/[0.03] text-sm font-medium text-foreground transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
            <path
              fill="#FFC107"
              d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.5 5.1 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.4-.4-3.5z"
            />
            <path
              fill="#FF3D00"
              d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34.5 5.1 29.5 3 24 3 16.3 3 9.6 7.3 6.3 14.7z"
            />
            <path
              fill="#4CAF50"
              d="M24 45c5.4 0 10.3-2 13.9-5.4l-6.4-5.4C29.5 35.9 26.9 37 24 37c-5.3 0-9.7-3.1-11.3-7.6l-6.6 5.1C9.5 40.6 16.2 45 24 45z"
            />
            <path
              fill="#1976D2"
              d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.4 5.4C41.4 36 44 30.8 44 24c0-1.2-.1-2.4-.4-3.5z"
            />
          </svg>
          {pending ? t("googleLoading") : label}
        </button>
      </form>
      {state.status === "error" && (
        <p role="alert" className="mt-2 text-center text-sm text-red-400">
          {tErrors(state.code ?? "unknown")}
        </p>
      )}
    </div>
  );
}
