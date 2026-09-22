import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { Reveal } from "@/components/ui/Reveal";
import { GlowBackground } from "@/components/ui/GlowBackground";

export function AuthCard({
  title,
  subtitle,
  children,
  footerText,
  footerLinkLabel,
  footerLinkHref,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footerText?: string;
  footerLinkLabel: string;
  footerLinkHref: string;
}) {
  return (
    <main className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden px-6 py-28">
      <GlowBackground variant="hero" grid />
      <Reveal className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-accent-strong to-accent-2 text-sm font-bold text-white shadow-[0_0_20px_-4px_rgba(91,124,250,0.8)]">
              C
            </span>
            <span className="text-lg font-semibold tracking-tight text-foreground">
              Colega
            </span>
          </Link>
        </div>

        <div className="card-surface rounded-3xl p-8 sm:p-10">
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mt-2 text-sm text-muted">{subtitle}</p>
          </div>

          <div className="mt-8">{children}</div>
        </div>

        <p className="mt-6 text-center text-sm text-muted-dim">
          {footerText ? `${footerText} ` : null}
          <Link
            href={footerLinkHref}
            className="font-medium text-accent-strong hover:text-foreground"
          >
            {footerLinkLabel}
          </Link>
        </p>
      </Reveal>
    </main>
  );
}
