import { useTranslations } from "next-intl";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import { TestimonialCard, type Testimonial } from "@/components/landing/TestimonialCard";

export function TestimonialsSection() {
  const t = useTranslations("testimonials");
  const items = t.raw("items") as Testimonial[];
  const track = [...items, ...items];

  return (
    <section id="testimonials" className="relative py-24 sm:py-32">
      <Container>
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />
      </Container>

      <Reveal delay={0.1} className="mt-14">
        <div className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
          <div className="marquee-track flex w-max gap-5 px-6 group-hover:[animation-play-state:paused]">
            {track.map((item, i) => (
              <TestimonialCard key={`${item.name}-${i}`} {...item} />
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
