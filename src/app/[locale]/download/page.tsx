import { MonitorDown, Apple, Cpu, HardDrive, Wifi } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { GlowBackground } from "@/components/ui/GlowBackground";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { DownloadCard } from "@/components/download/DownloadCard";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return buildMetadata({ locale, namespace: "meta.download", path: "/download" });
}

type ReleaseEntry = {
  version: string;
  date: string;
  notes: string[];
};

export default async function DownloadPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "download" });
  const releaseNotes = t.raw("releaseNotes.entries") as ReleaseEntry[];

  const requirements = [
    { icon: Cpu, key: "cpu" },
    { icon: HardDrive, key: "storage" },
    { icon: Wifi, key: "connection" },
  ] as const;

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <section className="relative overflow-hidden pt-36 pb-8 sm:pt-44">
          <GlowBackground variant="hero" grid />
          <Container className="relative text-center">
            <Reveal>
              <Badge variant="accent">{t("badge")}</Badge>
            </Reveal>
            <Reveal delay={0.06}>
              <h1 className="mx-auto mt-6 max-w-2xl text-4xl font-semibold leading-[1.1] tracking-tight text-gradient sm:text-5xl md:text-6xl">
                {t("title")}
              </h1>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted">
                {t("description")}
              </p>
            </Reveal>
          </Container>
        </section>

        <section className="relative py-16 sm:py-20">
          <Container>
            <div className="mx-auto grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
              <Reveal>
                <DownloadCard
                  icon={<MonitorDown size={26} strokeWidth={1.75} />}
                  platform={t("windows.title")}
                  requirement={t("windows.requirement")}
                  version="0.9.2"
                  size="182 MB"
                  badgeLabel={t("badge")}
                  versionLabel={t("version")}
                  ctaLabel={t("downloadFor", { platform: t("windows.title") })}
                  freeNote={t("freeNote")}
                />
              </Reveal>
              <Reveal delay={0.08}>
                <DownloadCard
                  icon={<Apple size={26} strokeWidth={1.75} />}
                  platform={t("mac.title")}
                  requirement={t("mac.requirement")}
                  version="0.9.2"
                  size="164 MB"
                  badgeLabel={t("badge")}
                  versionLabel={t("version")}
                  ctaLabel={t("downloadFor", { platform: t("mac.title") })}
                  freeNote={t("freeNote")}
                />
              </Reveal>
            </div>
          </Container>
        </section>

        <section className="relative py-16 sm:py-20">
          <Container>
            <SectionHeading
              eyebrow={t("requirements.eyebrow")}
              title={t("requirements.title")}
              align="left"
            />
            <RevealGroup className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3">
              {requirements.map((req) => (
                <RevealItem key={req.key}>
                  <div className="card-surface flex h-full flex-col gap-3 rounded-2xl p-6">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06] text-accent-strong">
                      <req.icon size={18} strokeWidth={1.75} />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {t(`requirements.${req.key}.title`)}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted">
                      {t(`requirements.${req.key}.description`)}
                    </p>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>
          </Container>
        </section>

        <section id="release-notes" className="relative py-16 sm:py-20">
          <Container>
            <SectionHeading
              eyebrow={t("releaseNotes.eyebrow")}
              title={t("releaseNotes.title")}
              align="left"
            />
            <div className="mt-10 flex flex-col gap-5">
              {releaseNotes.map((release) => (
                <Reveal key={release.version}>
                  <div className="card-surface rounded-2xl p-6 sm:p-7">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-base font-semibold text-foreground">
                        {release.version}
                      </h3>
                      <span className="text-xs text-muted-dim">{release.date}</span>
                    </div>
                    <ul className="mt-4 flex flex-col gap-2">
                      {release.notes.map((note) => (
                        <li
                          key={note}
                          className="flex items-start gap-2.5 text-sm text-muted"
                        >
                          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent-strong" />
                          {note}
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              ))}
            </div>
          </Container>
        </section>
      </main>
      <Footer />
    </>
  );
}
