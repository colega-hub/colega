import { cn } from "@/lib/utils";

/**
 * The real Colega mark (public/brand/colega-logo.png) — an icon only, no wordmark baked in, so
 * every usage site keeps rendering the "Colega" text next to it exactly as before. Replaces the
 * old placeholder gradient-square-with-"C" badge; that badge's background/shadow/rounded
 * styling doesn't apply here (the PNG has its own transparent background and shape), so only
 * sizing is carried over from each call site, matching AGENTS: "preserve the existing logo
 * sizing relationship, alignment, spacing."
 */
export function Logo({ className }: { className?: string }) {
  return (
    <img
      src="/brand/colega-logo.png"
      alt="Colega"
      className={cn("object-contain", className)}
    />
  );
}
