"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowRight, Apple, MonitorDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Container } from "@/components/ui/Container";
import { GlowBackground } from "@/components/ui/GlowBackground";
import { ScreenShareDemo } from "@/components/landing/ScreenShareDemo";
import { WINDOWS_DOWNLOAD_URL } from "@/lib/download";

export function Hero() {
  const t = useTranslations("hero");
  const headlineLines = t("headline").split("\n");

  return (
    <section className="relative overflow-hidden pt-36 pb-20 sm:pt-44 sm:pb-28">
      <GlowBackground variant="hero" grid noise />

      <Container className="relative">
        <div className="grid items-center gap-16 lg:grid-cols-[1.05fr_1fr]">
          <div className="flex flex-col items-start gap-7">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <Badge variant="accent">
                <Sparkles size={12} /> {t("badge")}
              </Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.05 }}
              className="text-4xl font-semibold leading-[1.08] tracking-tight text-gradient sm:text-5xl md:text-6xl lg:text-[4.2rem]"
            >
              {headlineLines.map((line, i) => (
                <span key={i} className="block">
                  {line}
                </span>
              ))}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.12 }}
              className="max-w-lg text-lg leading-relaxed text-muted"
            >
              {t("subtext")}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="flex flex-wrap items-center gap-3 pt-1"
            >
              <Button href="/signup" size="lg" icon={<ArrowRight size={16} />}>
                {t("ctaPrimary")}
              </Button>
              <Button
                href={WINDOWS_DOWNLOAD_URL}
                variant="outline"
                size="lg"
                icon={<MonitorDown size={16} />}
              >
                {t("ctaWindows")}
              </Button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.28 }}
            >
              <Button variant="ghost" size="sm" icon={<Apple size={14} />} disabled>
                {t("ctaMac")}
              </Button>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="relative mx-auto w-full max-w-md lg:max-w-none"
          >
            <ScreenShareDemo />
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
