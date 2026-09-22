"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

export function BillingToggle({
  annual,
  onChange,
}: {
  annual: boolean;
  onChange: (value: boolean) => void;
}) {
  const t = useTranslations("pricing.billing");

  return (
    <div className="flex items-center justify-center gap-3">
      <span
        className={cn(
          "text-sm font-medium transition-colors",
          !annual ? "text-foreground" : "text-muted-dim"
        )}
      >
        {t("monthly")}
      </span>
      <button
        onClick={() => onChange(!annual)}
        className="relative h-6 w-12 rounded-full border border-border-strong bg-white/[0.05] p-0.5"
        aria-label="Toggle annual billing"
      >
        <motion.span
          className="block h-5 w-5 rounded-full bg-gradient-to-b from-accent-strong to-accent"
          animate={{ x: annual ? 24 : 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
        />
      </button>
      <span
        className={cn(
          "flex items-center gap-2 text-sm font-medium transition-colors",
          annual ? "text-foreground" : "text-muted-dim"
        )}
      >
        {t("annual")}
        <Badge variant="accent" className="py-0.5 text-[10px]">
          {t("save")}
        </Badge>
      </span>
    </div>
  );
}
