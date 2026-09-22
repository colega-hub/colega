import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Badge({
  children,
  className,
  variant = "default",
}: {
  children: ReactNode;
  className?: string;
  variant?: "default" | "accent";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium tracking-wide",
        variant === "default" &&
          "border-border-strong bg-white/[0.04] text-muted",
        variant === "accent" &&
          "border-accent/30 bg-accent/10 text-accent-strong",
        className
      )}
    >
      {children}
    </span>
  );
}
