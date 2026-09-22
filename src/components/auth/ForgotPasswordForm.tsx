"use client";

import { useActionState } from "react";
import { ArrowRight, MailCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { forgotPassword, type ForgotPasswordState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";
import { FormField } from "./FormField";

const initialState: ForgotPasswordState = { status: "idle" };

export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgotPassword");
  const tErrors = useTranslations("auth.errors");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(forgotPassword, initialState);

  if (state.status === "success") {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent-strong">
          <MailCheck size={22} />
        </span>
        <h2 className="text-lg font-semibold text-foreground">{t("successTitle")}</h2>
        <p className="max-w-sm text-sm text-muted">{t("successBody")}</p>
      </div>
    );
  }

  return (
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

      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-400">
          {tErrors(state.code ?? "unknown")}
        </p>
      )}

      <Button type="submit" className="w-full" icon={<ArrowRight size={16} />} disabled={pending}>
        {pending ? t("submitLoading") : t("submit")}
      </Button>
    </form>
  );
}
