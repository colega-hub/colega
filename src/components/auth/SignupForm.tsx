"use client";

import { useActionState, useEffect } from "react";
import { ArrowRight, MailCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { signup, type AuthActionState } from "@/lib/auth/actions";
import { useSupabaseUser } from "@/hooks/useSupabaseUser";
import { Button } from "@/components/ui/Button";
import { FormField } from "./FormField";
import { GoogleButton } from "./GoogleButton";
import type { ReactNode } from "react";

type SignupState = AuthActionState & { needsEmailConfirmation?: boolean };
const initialState: SignupState = { status: "idle" };

export function SignupForm({ agreement }: { agreement: ReactNode }) {
  const t = useTranslations("auth.signup");
  const tErrors = useTranslations("auth.errors");
  const locale = useLocale();
  const router = useRouter();
  const { user } = useSupabaseUser();
  const [state, formAction, pending] = useActionState(signup, initialState);

  useEffect(() => {
    if (user) router.replace("/account");
  }, [user, router]);

  if (state.status === "success" && state.needsEmailConfirmation) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent-strong">
          <MailCheck size={22} />
        </span>
        <h2 className="text-lg font-semibold text-foreground">{t("checkEmailTitle")}</h2>
        <p className="max-w-sm text-sm text-muted">{t("checkEmailBody")}</p>
      </div>
    );
  }

  return (
    <>
      <form action={formAction} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="locale" value={locale} />

        <FormField
          label={t("nameLabel")}
          type="text"
          name="name"
          placeholder="Jane Doe"
          autoComplete="name"
          required
          disabled={pending}
        />
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
          autoComplete="new-password"
          minLength={6}
          required
          disabled={pending}
        />
        <FormField
          label={t("confirmPasswordLabel")}
          type="password"
          name="confirmPassword"
          placeholder="••••••••"
          autoComplete="new-password"
          minLength={6}
          required
          disabled={pending}
        />

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

        <p className="text-center text-xs leading-relaxed text-muted-dim">{agreement}</p>
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
