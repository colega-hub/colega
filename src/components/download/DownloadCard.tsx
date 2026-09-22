"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { ReactNode } from "react";

export function DownloadCard({
  icon,
  platform,
  requirement,
  version,
  size,
  badgeLabel,
  versionLabel,
  ctaLabel,
  freeNote,
}: {
  icon: ReactNode;
  platform: string;
  requirement: string;
  version: string;
  size: string;
  badgeLabel: string;
  versionLabel: string;
  ctaLabel: string;
  freeNote: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="card-surface flex flex-col gap-6 rounded-3xl p-8"
    >
      <div className="flex items-center justify-between">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06] text-foreground">
          {icon}
        </div>
        <Badge variant="accent">{badgeLabel}</Badge>
      </div>

      <div>
        <h3 className="text-xl font-semibold text-foreground">{platform}</h3>
        <p className="mt-1.5 text-sm text-muted">{requirement}</p>
      </div>

      <div className="flex items-center gap-4 border-y border-border py-4 text-xs text-muted-dim">
        <span>
          {versionLabel} {version}
        </span>
        <span className="h-1 w-1 rounded-full bg-muted-dim/50" />
        <span>{size}</span>
      </div>

      <Button className="w-full" icon={<ArrowRight size={16} />}>
        {ctaLabel}
      </Button>
      <p className="text-center text-xs text-muted-dim">{freeNote}</p>
    </motion.div>
  );
}
