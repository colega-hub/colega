"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ScreenShare, ScreenShareOff, Bell, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

const PHASE_DURATIONS = {
  idle: 900,
  moving: 1100,
  hover: 500,
  click: 350,
  shared: 1000,
  notify: 2600,
  toast: 2000,
  reset: 700,
} as const;

type Phase = keyof typeof PHASE_DURATIONS;

const PHASE_ORDER: Phase[] = [
  "idle",
  "moving",
  "hover",
  "click",
  "shared",
  "notify",
  "toast",
  "reset",
];

export function ScreenShareDemo() {
  const t = useTranslations("hero.demo");
  const reduceMotion = useReducedMotion();
  const [phaseIndex, setPhaseIndex] = useState(0);
  const phase = PHASE_ORDER[phaseIndex];

  const buttonRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cursorTarget, setCursorTarget] = useState({ x: 120, y: 140 });
  const [idlePos, setIdlePos] = useState({ x: 260, y: 12 });

  useEffect(() => {
    function measure() {
      if (buttonRef.current && containerRef.current) {
        const btnRect = buttonRef.current.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        setCursorTarget({
          x: btnRect.left - containerRect.left + btnRect.width / 2,
          y: btnRect.top - containerRect.top + btnRect.height / 2,
        });
        setIdlePos({ x: containerRect.width - 24, y: 16 });
      }
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = setTimeout(() => {
      setPhaseIndex((i) => (i + 1) % PHASE_ORDER.length);
    }, PHASE_DURATIONS[phase]);
    return () => clearTimeout(timer);
  }, [phase, reduceMotion]);

  const isShared = reduceMotion
    ? true
    : phase === "shared" || phase === "notify" || phase === "toast" || phase === "reset";
  const isMovingToButton = phase === "moving" || phase === "hover" || phase === "click";
  const showCursor = !reduceMotion && isMovingToButton;
  const buttonHover = phase === "hover" || phase === "click";
  const clicking = phase === "click";
  const showNotification = reduceMotion ? true : phase === "notify";
  const showToast = !reduceMotion && phase === "toast";

  return (
    <div ref={containerRef} className="relative">
      <motion.div
        animate={reduceMotion ? undefined : { y: [0, -10, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        className="card-surface relative rounded-2xl p-3 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]"
      >
        <div className="flex items-center gap-2 px-2 pb-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          </div>
          <div className="ml-2 flex items-center gap-1.5 rounded-full bg-white/[0.04] px-3 py-1 text-[11px] text-muted-dim">
            <motion.span
              animate={{ opacity: isShared ? [1, 0.4, 1] : 1 }}
              transition={{ duration: 1.6, repeat: isShared ? Infinity : 0 }}
              className={`h-1.5 w-1.5 rounded-full ${
                isShared ? "bg-emerald-400" : "bg-white/25"
              }`}
            />
            Colega {isShared ? `— ${t("screenShared")}` : ""}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background/60 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white/[0.02] px-3 py-2.5">
            <span className="truncate text-xs text-muted-dim sm:text-sm">
              {t("inputPlaceholder")}
            </span>
            <span className="h-4 w-px shrink-0 bg-white/20" />
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <AnimatePresence mode="wait">
              {!isShared ? (
                <motion.button
                  key="share"
                  ref={buttonRef}
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: 1,
                    scale: clicking ? 0.94 : 1,
                    boxShadow: buttonHover
                      ? "0 0 0 1px rgba(91,124,250,0.5), 0 0 22px rgba(91,124,250,0.4)"
                      : "0 0 0 1px rgba(255,255,255,0.08)",
                  }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.25 }}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium sm:text-xs ${
                    buttonHover
                      ? "bg-accent/20 text-accent-strong"
                      : "bg-white/[0.05] text-muted"
                  }`}
                >
                  <ScreenShare size={13} />
                  {t("shareScreen")}
                </motion.button>
              ) : (
                <motion.div
                  key="shared-status"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1.5 text-[11px] font-medium text-emerald-300 sm:text-xs"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {t("screenShared")}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {isShared && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1.5 rounded-full bg-white/[0.05] px-3 py-1.5 text-[11px] font-medium text-muted sm:text-xs"
                >
                  <ScreenShareOff size={13} />
                  <span className="hidden sm:inline">{t("stopSharing")}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="relative mt-4 overflow-hidden rounded-lg border border-border bg-white/[0.02] p-4">
            <motion.div
              animate={
                isShared
                  ? {
                      boxShadow: [
                        "0 0 0 1px rgba(91,124,250,0.12)",
                        "0 0 0 1px rgba(91,124,250,0.5)",
                        "0 0 0 1px rgba(91,124,250,0.12)",
                      ],
                    }
                  : { boxShadow: "0 0 0 1px rgba(255,255,255,0)" }
              }
              transition={{ duration: 2.4, repeat: isShared ? Infinity : 0 }}
              className="space-y-2 rounded-md p-2"
            >
              <div className="h-3 w-2/3 rounded bg-white/15" />
              <div className="h-2 w-full rounded bg-white/[0.06]" />
              <div className="h-2 w-5/6 rounded bg-white/[0.06]" />
              <div className="mt-2 h-9 w-1/3 rounded bg-accent/20" />
            </motion.div>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {showNotification && (
          <motion.div
            initial={{ opacity: 0, x: 20, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 14, y: -6, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="card-surface absolute -right-3 -top-6 w-52 rounded-xl p-3 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.6)] sm:-right-8 sm:w-64"
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-strong to-accent-2 text-white">
                <Sparkles size={12} />
              </span>
              <div>
                <p className="text-xs font-semibold text-foreground">
                  {t("notification.title")}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  {t("notification.body")}
                </p>
                <span className="mt-2 inline-block text-[11px] font-medium text-accent-strong">
                  {t("notification.cta")} →
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, x: -14, y: 10 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className="card-surface absolute -bottom-4 -left-3 flex items-center gap-2 rounded-full px-3 py-2 text-[11px] text-muted shadow-[0_16px_40px_-15px_rgba(0,0,0,0.6)] sm:-left-6"
          >
            <Bell size={12} className="text-accent-strong" />
            {t("reminder.response")}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCursor && (
          <motion.div
            initial={{ opacity: 0, x: idlePos.x, y: idlePos.y }}
            animate={{
              opacity: 1,
              x: isMovingToButton ? cursorTarget.x : idlePos.x,
              y: isMovingToButton ? cursorTarget.y : idlePos.y,
              scale: clicking ? 0.7 : 1,
            }}
            exit={{ opacity: 0 }}
            transition={{
              x: { duration: 1, ease: [0.22, 1, 0.36, 1] },
              y: { duration: 1, ease: [0.22, 1, 0.36, 1] },
              scale: { duration: 0.15 },
              opacity: { duration: 0.2 },
            }}
            className="pointer-events-none absolute left-0 top-0 z-20"
          >
            <div className="relative -translate-x-1/2 -translate-y-1/2">
              {clicking && (
                <motion.span
                  initial={{ scale: 0.4, opacity: 0.6 }}
                  animate={{ scale: 2.4, opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0 -m-2 rounded-full border border-accent-strong"
                />
              )}
              <span className="block h-3.5 w-3.5 rounded-full border-2 border-white bg-accent-strong/80 shadow-[0_0_12px_rgba(91,124,250,0.8)]" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
