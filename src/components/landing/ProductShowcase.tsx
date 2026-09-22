"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useTranslations } from "next-intl";
import { MessageSquare, ListChecks, StickyNote, BellRing, ArrowUpRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { GlowBackground } from "@/components/ui/GlowBackground";
import { Reveal } from "@/components/ui/Reveal";

const blocks = [
  { id: "chat", icon: MessageSquare },
  { id: "tasks", icon: ListChecks },
  { id: "notes", icon: StickyNote },
  { id: "reminders", icon: BellRing },
] as const;

export function ProductShowcase() {
  const t = useTranslations("showcase");
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [40, -40]);

  return (
    <section className="relative py-24 sm:py-32">
      <GlowBackground />
      <Container className="relative">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        <Reveal delay={0.1} className="mt-16">
          <div
            ref={ref}
            className="card-surface relative overflow-hidden rounded-3xl p-4 sm:p-8"
          >
            <div className="flex items-center justify-between border-b border-border pb-5">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent-strong to-accent-2 text-xs font-bold text-white">
                  C
                </span>
                <span className="text-sm font-medium text-foreground">
                  {t("workspaceLabel")}
                </span>
              </div>
              <div className="hidden items-center gap-1.5 text-xs text-muted-dim sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {t("syncedLabel")}
              </div>
            </div>

            <motion.div
              style={{ y }}
              className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              {blocks.map((block) => (
                <div
                  key={block.id}
                  className="group rounded-2xl border border-border bg-white/[0.02] p-5 transition-colors hover:border-white/[0.14] hover:bg-white/[0.04]"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] text-accent-strong">
                      <block.icon size={17} strokeWidth={1.75} />
                    </div>
                    <ArrowUpRight
                      size={15}
                      className="text-muted-dim opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </div>
                  <h4 className="mt-4 text-sm font-semibold text-foreground">
                    {t(`blocks.${block.id}.title`)}
                  </h4>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {t(`blocks.${block.id}.body`)}
                  </p>
                </div>
              ))}
            </motion.div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
