"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown, Globe } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations("languageSwitcher");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function switchTo(next: string) {
    setOpen(false);
    if (next !== locale) {
      router.replace(pathname, { locale: next });
    }
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t("label")}
        aria-expanded={open}
        className="flex h-9 items-center gap-1.5 rounded-full border border-border-strong bg-white/[0.03] px-3 text-xs font-semibold uppercase tracking-wide text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground"
      >
        <Globe size={13} />
        {locale}
        <ChevronDown
          size={13}
          className={cn("transition-transform", open && "rotate-180")}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="card-surface absolute right-0 top-11 z-50 w-40 overflow-hidden rounded-xl p-1"
          >
            {routing.locales.map((code) => (
              <button
                key={code}
                onClick={() => switchTo(code)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground"
              >
                {t(code)}
                {code === locale && (
                  <Check size={14} className="text-accent-strong" />
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
