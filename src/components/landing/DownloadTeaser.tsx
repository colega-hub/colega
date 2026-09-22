import { useTranslations } from "next-intl";
import { MonitorDown, Apple, ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import { GlowBackground } from "@/components/ui/GlowBackground";

export function DownloadTeaser() {
  const t = useTranslations("downloadTeaser");

  return (
    <section className="relative py-24 sm:py-32">
      <GlowBackground />
      <Container className="relative">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        <Reveal delay={0.1}>
          <div className="mx-auto mt-14 grid max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="card-surface flex flex-col gap-5 rounded-2xl p-7">
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.06] text-foreground">
                  <MonitorDown size={22} strokeWidth={1.75} />
                </div>
                <Badge>{t("betaBadge")}</Badge>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  {t("windows.title")}
                </h3>
                <p className="mt-1 text-sm text-muted">{t("windows.requirement")}</p>
              </div>
              <Button href="/download" className="w-full" icon={<ArrowRight size={16} />}>
                {t("windows.cta")}
              </Button>
            </div>

            <div className="card-surface flex flex-col gap-5 rounded-2xl p-7">
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.06] text-foreground">
                  <Apple size={22} strokeWidth={1.75} />
                </div>
                <Badge>{t("betaBadge")}</Badge>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  {t("mac.title")}
                </h3>
                <p className="mt-1 text-sm text-muted">{t("mac.requirement")}</p>
              </div>
              <Button
                href="/download"
                variant="outline"
                className="w-full"
                icon={<ArrowRight size={16} />}
              >
                {t("mac.cta")}
              </Button>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
