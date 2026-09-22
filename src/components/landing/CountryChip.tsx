"use client";

import type { CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export function CountryChip({
  flag,
  name,
  className,
  style,
  delay = 0,
  float = true,
}: {
  flag: string;
  name: string;
  className?: string;
  style?: CSSProperties;
  delay?: number;
  float?: boolean;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className="inline-block"
      style={style}
      initial={{ opacity: 0, y: 14, scale: 0.94 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.6, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
    >
      <motion.div
        className={cn(
          "card-surface inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium text-foreground/90 shadow-[0_10px_30px_-14px_rgba(0,0,0,0.7)]",
          className
        )}
        animate={
          !reduceMotion && float
            ? { y: [0, -5, 0] }
            : undefined
        }
        transition={{
          duration: 5 + delay,
          repeat: Infinity,
          ease: "easeInOut",
          delay,
        }}
      >
        <span className="text-sm leading-none">{flag}</span>
        <span>{name}</span>
      </motion.div>
    </motion.div>
  );
}
