"use client";

import { useActionState, useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { login, type AuthActionState } from "@/lib/auth/actions";
import { useSupabaseUser } from "@/hooks/useSupabaseUser";
import { Button } from "@/components/ui/Button";
import { FormField } from "./FormField";
import { GoogleButton } from "./GoogleButton";

const initialState: AuthActionState = { status: "idle" };

export function LoginForm({ showConfirmedBanner }: { showConfirmedBanner?: boolean }) {
  const t = useTranslations("auth.login");
  const tErrors = useTranslations("auth.errors");
  const locale = useLocale();
  const router = useRouter();
  const { user } = useSupabaseUser();
  const [state, formAction, pending] = useActionState(login, initialState);

  // A visitor who is already signed in (including one who just landed here via a Supabase
  // email-confirmation link — see useSupabaseUser's doc comment on hash-fragment detection)
  // shouldn't sit on the login form.
  useEffect(() => {
    if (user) router.replace("/account");
  }, [user, router]);

  return (
    <>
      {showConfirmedBanner && user && (
        <p className="mb-6 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-center text-sm text-accent-strong">
          {t("confirmedBanner")}
        </p>
      )}

      <form action={formAction} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="locale" value={locale} />

        <FormField
          label={t("emailLabel")}
          type="email"
          name="email"
          placeholder="you@company.com"
          autoComplete="email"
          required
          disabled={pending}
        />
        <FormField
          label={t("passwordLabel")}
          type="password"
          name="password"
          placeholder="••••••••"
          autoComplete="current-password"
          minLength={6}
          required
          disabled={pending}
        />

        <div className="flex items-center justify-end">
          <Link
            href="/forgot-password"
            className="text-xs font-medium text-muted-dim hover:text-foreground"
          >
            {t("forgotPassword")}
          </Link>
        </div>

        {state.status === "error" && (
          <p role="alert" className="text-sm text-red-400">
            {tErrors(state.code ?? "unknown")}
          </p>
        )}

        <Button
          type="submit"
          className="w-full"
          icon={<ArrowRight size={16} />}
          disabled={pending}
        >
          {pending ? t("submitLoading") : t("submit")}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-dim">{t("or")}</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <GoogleButton label={t("google")} />
    </>
  );
}
