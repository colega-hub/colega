import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Container } from "@/components/ui/Container";
import { GlowBackground } from "@/components/ui/GlowBackground";
import { Reveal } from "@/components/ui/Reveal";
import type { ReactNode } from "react";

export function SimplePage({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <section className="relative overflow-hidden pt-36 pb-24 sm:pt-44">
          <GlowBackground grid />
          <Container className="relative max-w-2xl">
            <Reveal>
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-strong">
                {eyebrow}
              </span>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-gradient sm:text-5xl">
                {title}
              </h1>
            </Reveal>
            <Reveal delay={0.1} className="mt-8 flex flex-col gap-4 text-sm leading-relaxed text-muted sm:text-base">
              {children}
            </Reveal>
          </Container>
        </section>
      </main>
      <Footer />
    </>
  );
}
