"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Bell } from "lucide-react";

export function NudgeDemo() {
  const t = useTranslations("features.items.nudge.demo");

  return (
    <div className="mt-4 rounded-xl border border-border bg-white/[0.03] p-3">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-dim">
        <span>{t("before")}</span>
        <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-lg bg-white/[0.04] px-2.5 py-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
        <span className="text-[11px] text-foreground/80">{t("issue")}</span>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="mt-2 flex items-center gap-2 rounded-lg border border-accent/25 bg-accent/10 px-2.5 py-2"
      >
        <Bell size={12} className="shrink-0 text-accent-strong" />
        <span className="text-[11px] text-accent-strong">{t("notification")}</span>
      </motion.div>
    </div>
  );
}

export function MemoryDemo() {
  const t = useTranslations("features.items.memory.demo");

  return (
    <div className="mt-4 flex flex-col gap-1.5 rounded-xl border border-border bg-white/[0.03] p-3">
      <div className="flex justify-end">
        <span className="max-w-[88%] rounded-lg rounded-br-sm bg-white/[0.08] px-2.5 py-1.5 text-[11px] text-foreground/85">
          {t("line1")}
        </span>
      </div>
      <div className="flex justify-start">
        <span className="max-w-[88%] rounded-lg rounded-bl-sm bg-accent/15 px-2.5 py-1.5 text-[11px] text-accent-strong">
          {t("reply1")}
        </span>
      </div>
      <div className="my-1 h-px w-full bg-border" />
      <div className="flex justify-end">
        <span className="max-w-[88%] rounded-lg rounded-br-sm bg-white/[0.08] px-2.5 py-1.5 text-[11px] text-foreground/85">
          {t("line2")}
        </span>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="flex justify-start"
      >
        <span className="max-w-[88%] rounded-lg rounded-bl-sm bg-accent/15 px-2.5 py-1.5 text-[11px] text-accent-strong">
          {t("reply2")}
        </span>
      </motion.div>
    </div>
  );
}

export function TeachDemo() {
  const t = useTranslations("features.items.teach.demo");
  const rows = [
    { item: t("item1"), badge: t("badge1") },
    { item: t("item2"), badge: t("badge2") },
    { item: t("item3"), badge: t("badge3") },
  ];

  return (
    <div className="mt-4 flex flex-col gap-1.5 rounded-xl border border-border bg-white/[0.03] p-3">
      {rows.map((row) => (
        <div
          key={row.item}
          className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-1.5"
        >
          <span className="text-[11px] text-foreground/80">{row.item}</span>
          <span className="shrink-0 rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-300">
            {row.badge}
          </span>
        </div>
      ))}
    </div>
  );
}
