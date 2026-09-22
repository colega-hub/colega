"use server";

import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { siteUrl } from "@/lib/supabase/site-url";
import { ensureProfile } from "./profile";
import { mapAuthErrorToCode, type AuthErrorCode } from "./errors";

export type AuthActionState = {
  status: "idle" | "error" | "success";
  code?: AuthErrorCode | "missing_fields" | "password_mismatch" | "not_configured";
};

function readLocale(formData: FormData): string {
  const locale = formData.get("locale");
  return typeof locale === "string" && locale ? locale : "en";
}

export async function login(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const locale = readLocale(formData);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) return { status: "error", code: "missing_fields" };
  if (!isSupabaseConfigured) return { status: "error", code: "not_configured" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { status: "error", code: mapAuthErrorToCode(error.message) };
  if (!data.user) return { status: "error", code: "unknown" };

  // Lazily repairs a missing `profiles` row — see ensureProfile's doc comment. Never blocks
  // sign-in: a website account without a profile row yet is still a fully authenticated
  // account, exactly like the desktop app's own `profileIncomplete` recovery path.
  await ensureProfile(supabase, data.user);

  return redirect({ href: "/account", locale });
}

export async function signup(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState & { needsEmailConfirmation?: boolean }> {
  const locale = readLocale(formData);
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (!name || !email || !password || !confirmPassword) {
    return { status: "error", code: "missing_fields" };
  }
  if (password !== confirmPassword) {
    return { status: "error", code: "password_mismatch" };
  }
  if (!isSupabaseConfigured) return { status: "error", code: "not_configured" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      emailRedirectTo: `${siteUrl}/${locale}/login?confirmed=1`,
    },
  });

  if (error) return { status: "error", code: mapAuthErrorToCode(error.message) };
  if (!data.user) return { status: "error", code: "unknown" };

  // A null session means Supabase's "confirm your email" setting is enabled on this project —
  // the auth.users row is REAL, but there's no session to act on yet. Never report this as a
  // completed sign-in (see AGENTS step 9: "do not pretend email is verified if it is not").
  const needsEmailConfirmation = !data.session;

  if (data.session) {
    // Session exists now -> RLS (auth.uid() = id) allows the profile insert immediately. If
    // confirmation is required instead, this repairs itself lazily on first login (see
    // ensureProfile's doc comment) — mirrors the desktop app's own signUp flow exactly.
    await ensureProfile(supabase, data.user, name);
  }

  if (needsEmailConfirmation) {
    return { status: "success", needsEmailConfirmation: true };
  }

  return redirect({ href: "/account", locale });
}

export async function logout(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect({ href: "/login", locale });
}

export type ForgotPasswordState = {
  status: "idle" | "error" | "success";
  code?: AuthErrorCode | "missing_fields" | "not_configured";
};

export async function forgotPassword(
  _prevState: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const locale = readLocale(formData);
  const email = String(formData.get("email") || "").trim();

  if (!email) return { status: "error", code: "missing_fields" };
  if (!isSupabaseConfigured) return { status: "error", code: "not_configured" };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/${locale}/reset-password`,
  });

  // Deliberately the same response whether or not the email is registered — distinguishing
  // the two would let this form enumerate real accounts. Supabase's own API behaves the same
  // way for this call.
  if (error) return { status: "error", code: mapAuthErrorToCode(error.message) };
  return { status: "success" };
}
