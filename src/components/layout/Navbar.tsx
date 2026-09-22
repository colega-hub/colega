"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { logout } from "@/lib/auth/actions";
import { navItems } from "@/lib/data";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { useSupabaseUser } from "@/hooks/useSupabaseUser";
import { cn } from "@/lib/utils";

export function Navbar() {
  const t = useTranslations("nav");
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { user, loading } = useSupabaseUser();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled
          ? "border-b border-border bg-background/70 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      )}
    >
      <Container className="flex h-16 items-center justify-between sm:h-18">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent-strong to-accent-2 text-sm font-bold text-white shadow-[0_0_20px_-4px_rgba(91,124,250,0.8)]">
            C
          </span>
          <span className="text-lg font-semibold tracking-tight text-foreground">
            Colega
          </span>
        </Link>

        <nav className="hidden items-center gap-8 lg:flex">
          {navItems.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="text-sm font-medium text-muted transition-colors hover:text-foreground"
            >
              {t(item.id)}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <LanguageSwitcher />
          {user && !loading ? (
            <AccountMenu user={user} />
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-muted transition-colors hover:text-foreground"
              >
                {t("login")}
              </Link>
              <Button href="/signup" size="sm">
                {t("getStarted")}
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <LanguageSwitcher />
          <button
            className="flex h-10 w-10 items-center justify-center rounded-full text-foreground"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </Container>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden border-t border-border bg-background/95 backdrop-blur-xl lg:hidden"
          >
            <Container className="flex flex-col gap-1 py-4">
              {navItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-2 py-3 text-base font-medium text-muted transition-colors hover:bg-white/[0.04] hover:text-foreground"
                >
                  {t(item.id)}
                </Link>
              ))}
              <div className="mt-3 flex flex-col gap-3 border-t border-border pt-4">
                {user && !loading ? (
                  <MobileAccountLinks onNavigate={() => setOpen(false)} />
                ) : (
                  <>
                    <Link
                      href="/login"
                      onClick={() => setOpen(false)}
                      className="text-center text-sm font-medium text-muted hover:text-foreground"
                    >
                      {t("login")}
                    </Link>
                    <Button href="/signup" className="w-full" onClick={() => setOpen(false)}>
                      {t("getStarted")}
                    </Button>
                  </>
                )}
              </div>
            </Container>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function MobileAccountLinks({ onNavigate }: { onNavigate: () => void }) {
  const t = useTranslations("accountMenu");
  const locale = useLocale();

  return (
    <>
      <Link
        href="/account"
        onClick={onNavigate}
        className="rounded-lg px-2 py-3 text-base font-medium text-muted transition-colors hover:bg-white/[0.04] hover:text-foreground"
      >
        {t("account")}
      </Link>
      <Link
        href="/account#plan"
        onClick={onNavigate}
        className="rounded-lg px-2 py-3 text-base font-medium text-muted transition-colors hover:bg-white/[0.04] hover:text-foreground"
      >
        {t("subscription")}
      </Link>
      <Link
        href="/download"
        onClick={onNavigate}
        className="rounded-lg px-2 py-3 text-base font-medium text-muted transition-colors hover:bg-white/[0.04] hover:text-foreground"
      >
        {t("download")}
      </Link>
      <form action={logout} onSubmit={onNavigate}>
        <input type="hidden" name="locale" value={locale} />
        <button
          type="submit"
          className="flex w-full items-center gap-2 rounded-lg px-2 py-3 text-left text-base font-medium text-muted transition-colors hover:bg-white/[0.04] hover:text-foreground"
        >
          <LogOut size={16} />
          {t("logout")}
        </button>
      </form>
    </>
  );
}
