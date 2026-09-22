import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/landing/Hero";
import { TrustedBy } from "@/components/landing/TrustedBy";
import { Features } from "@/components/landing/Features";
import { ProductShowcase } from "@/components/landing/ProductShowcase";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { UseCases } from "@/components/landing/UseCases";
import { DownloadTeaser } from "@/components/landing/DownloadTeaser";
import { GlobalPresenceSection } from "@/components/landing/GlobalPresenceSection";
import { TestimonialsSection } from "@/components/landing/TestimonialsSection";
import { PricingSection } from "@/components/pricing/PricingSection";
import { FAQ } from "@/components/landing/FAQ";
import { FinalCTA } from "@/components/landing/FinalCTA";

export default function Home() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <Hero />
        <TrustedBy />
        <Features />
        <ProductShowcase />
        <HowItWorks />
        <UseCases />
        <DownloadTeaser />
        <GlobalPresenceSection />
        <TestimonialsSection />
        <PricingSection />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
