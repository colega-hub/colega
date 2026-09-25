"use client";

import { useTranslations } from "next-intl";
import { AudioLines, BrainCircuit, Check, GraduationCap, ListChecks, ScanSearch, ScreenShare, ShieldCheck, type LucideIcon } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { MeetingDemo } from "@/components/landing/MeetingDemo";

// "Why Colega": six equal benefit cards (every claim maps to a shipped desktop feature — screen
// check on demand, check findings, personal rules, tasks/notes, Teach Colega, share-only privacy)
// plus a wide meeting spotlight with the Hear Mode demo.
const items: { id: string; icon: LucideIcon }[] = [
  { id: "sees", icon: ScreenShare },
  { id: "flags", icon: ScanSearch },
  { id: "remembers", icon: BrainCircuit },
  { id: "tasks", icon: ListChecks },
  { id: "learns", icon: GraduationCap },
  { id: "privacy", icon: ShieldCheck },
];

export function Features() {
  const t = useTranslations("features");
  const points = t.raw("meeting.points") as string[];

  return (
    <section id="features" className="relative py-24 sm:py-32">
      <Container>
        <SectionHeading eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />

        <RevealGroup className="mt-16 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <RevealItem key={item.id} className="h-full">
              <div className="card-surface group relative flex h-full flex-col overflow-hidden rounded-2xl p-6 transition-colors hover:border-white/[0.16]">
                <div
                  className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
                  style={{ background: "rgba(91,124,250,0.35)" }}
                />
                <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.06] text-accent-strong">
                  <item.icon size={20} strokeWidth={1.75} />
                </div>
                <h3 className="relative mt-5 text-base font-semibold text-foreground">{t(`items.${item.id}.title`)}</h3>
                <p className="relative mt-2 text-sm leading-relaxed text-muted">{t(`items.${item.id}.description`)}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>

        <Reveal className="mt-5">
          <div className="card-surface grid grid-cols-1 items-center gap-10 overflow-hidden rounded-3xl p-6 sm:p-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent-strong">
                <AudioLines size={14} />
                {t("meeting.kicker")}
              </span>
              <h3 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{t("meeting.title")}</h3>
              <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">{t("meeting.description")}</p>
              <ul className="mt-6 flex flex-col gap-3">
                {points.map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-sm text-muted">
                    <Check size={16} className="mt-0.5 shrink-0 text-accent-strong" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mx-auto w-full max-w-[560px]">
              <MeetingDemo />
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
