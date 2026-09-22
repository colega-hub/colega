"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { useRouter } from "@/i18n/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { mapAuthErrorToCode, type AuthErrorCode } from "@/lib/auth/errors";
import { Button } from "@/components/ui/Button";
import { FormField } from "./FormField";

type Stage = "checking" | "invalid" | "ready" | "success";

/**
 * The password-reset email link (Supabase's default GoTrue "verify" redirect) lands the
 * browser back on this page with #access_token=...&type=recovery in the URL hash. The
 * Supabase browser client (see src/lib/supabase/client.ts) auto-detects that hash on
 * instantiation and establishes a real, if short-lived, session from it — this component just
 * waits for that (or for the explicit PASSWORD_RECOVERY auth event) before showing the form,
 * and otherwise treats "no session shows up" as an invalid/expired link.
 */
export function ResetPasswordForm() {
  const t = useTranslations("auth.resetPassword");
  const tErrors = useTranslations("auth.errors");
  const router = useRouter();

  const [stage, setStage] = useState<Stage>(isSupabaseConfigured ? "checking" : "invalid");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorCode, setErrorCode] = useState<AuthErrorCode | "password_mismatch" | "missing_fields" | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = createClient();
    let settled = false;

    const settleFromSession = (hasSession: boolean) => {
      if (settled) return;
      settled = true;
      setStage(hasSession ? "ready" : "invalid");
    };

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        if (event === "PASSWORD_RECOVERY") settleFromSession(true);
        else if (event === "SIGNED_IN" && session) settleFromSession(true);
      }
    );

    // Fallback: if the hash was already parsed before this component mounted, or no
    // PASSWORD_RECOVERY event fires, fall back to checking for any active session.
    const timeout = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      settleFromSession(!!data.session);
    }, 1200);

    return () => {
      clearTimeout(timeout);
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorCode(null);

    if (!password || !confirmPassword) {
      setErrorCode("missing_fields");
      return;
    }
    if (password !== confirmPassword) {
      setErrorCode("password_mismatch");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      setErrorCode(mapAuthErrorToCode(error.message));
      return;
    }

    setStage("success");
    setTimeout(() => router.replace("/account"), 1500);
  }

  if (stage === "checking") {
    return <p className="py-6 text-center text-sm text-muted">{t("subtitle")}</p>;
  }

  if (stage === "invalid") {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <h2 className="text-lg font-semibold text-foreground">{t("invalidLink")}</h2>
        <p className="max-w-sm text-sm text-muted">{t("invalidLinkBody")}</p>
        <Button href="/forgot-password" className="mt-2">
          {t("requestNewLink")}
        </Button>
      </div>
    );
  }

  if (stage === "success") {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent-strong">
          <CheckCircle2 size={22} />
        </span>
        <h2 className="text-lg font-semibold text-foreground">{t("success")}</h2>
        <p className="max-w-sm text-sm text-muted">{t("successBody")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <FormField
        label={t("passwordLabel")}
        type="password"
        name="password"
        placeholder="••••••••"
        autoComplete="new-password"
        minLength={6}
        required
        disabled={submitting}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <FormField
        label={t("confirmPasswordLabel")}
        type="password"
        name="confirmPassword"
        placeholder="••••••••"
        autoComplete="new-password"
        minLength={6}
        required
        disabled={submitting}
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
      />

      {errorCode && (
        <p role="alert" className="text-sm text-red-400">
          {tErrors(errorCode)}
        </p>
      )}

      <Button type="submit" className="w-full" icon={<ArrowRight size={16} />} disabled={submitting}>
        {submitting ? t("submitLoading") : t("submit")}
      </Button>
    </form>
  );
}
