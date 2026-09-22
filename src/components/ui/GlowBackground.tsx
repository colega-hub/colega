"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Blob = {
  className: string;
  color: string;
  size: number;
  duration: number;
  moveX: number[];
  moveY: number[];
};

const heroBlobs: Blob[] = [
  {
    className: "left-[8%] top-[-10%]",
    color: "rgba(91,124,250,0.35)",
    size: 560,
    duration: 22,
    moveX: [0, 40, -20, 0],
    moveY: [0, 30, -10, 0],
  },
  {
    className: "right-[2%] top-[5%]",
    color: "rgba(139,92,246,0.28)",
    size: 480,
    duration: 26,
    moveX: [0, -30, 20, 0],
    moveY: [0, 20, -30, 0],
  },
  {
    className: "left-[35%] top-[30%]",
    color: "rgba(69,209,224,0.16)",
    size: 420,
    duration: 30,
    moveX: [0, 25, -25, 0],
    moveY: [0, -20, 20, 0],
  },
];

const softBlobs: Blob[] = [
  {
    className: "left-[10%] top-[10%]",
    color: "rgba(91,124,250,0.22)",
    size: 420,
    duration: 24,
    moveX: [0, 30, -20, 0],
    moveY: [0, 20, -20, 0],
  },
  {
    className: "right-[5%] bottom-[0%]",
    color: "rgba(139,92,246,0.2)",
    size: 460,
    duration: 28,
    moveX: [0, -25, 15, 0],
    moveY: [0, 15, -25, 0],
  },
];

export function GlowBackground({
  variant = "default",
  className,
  grid = false,
  noise = false,
}: {
  variant?: "hero" | "default";
  className?: string;
  grid?: boolean;
  noise?: boolean;
}) {
  const blobs = variant === "hero" ? heroBlobs : softBlobs;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className
      )}
      aria-hidden
    >
      {grid && <div className="grid-overlay" />}
      {blobs.map((blob, i) => (
        <motion.div
          key={i}
          className={cn("absolute rounded-full blur-[100px]", blob.className)}
          style={{
            width: blob.size,
            height: blob.size,
            background: blob.color,
          }}
          animate={{ x: blob.moveX, y: blob.moveY }}
          transition={{
            duration: blob.duration,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
      {noise && <div className="noise-overlay" />}
    </div>
  );
}
