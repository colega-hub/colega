"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Download, RotateCcw, X } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";
import { WINDOWS_DOWNLOAD_URL } from "@/lib/download";

// Pre-download explainer for Windows SmartScreen ("Windows protected your PC"), shown because the
// installer isn't code-signed yet. Mounted once in the locale layout: it intercepts plain clicks on
// ANY link to WINDOWS_DOWNLOAD_URL, so none of the existing download buttons/links change. Non-
// Windows visitors, modified clicks (new tab) and no-JS visitors download exactly as before.

const SEEN_KEY = "colega.smartscreenGuideSeen";

function readSeen() {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Private mode / blocked storage — the guide simply shows in full again next time.
  }
}

function isWindows() {
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  if (uaData?.platform) return uaData.platform === "Windows";
  return /Windows/i.test(navigator.userAgent);
}

// Animation timeline (ms after the dialog opens).
type Phase = "intro" | "toMore" | "pressMore" | "expanded" | "toRun" | "pressRun" | "success" | "done";
const TIMELINE: [Phase, number][] = [
  ["toMore", 700],
  ["pressMore", 1700],
  ["expanded", 2050],
  ["toRun", 2850],
  ["pressRun", 3850],
  ["success", 4250],
  ["done", 5300],
];
const ORDER: Phase[] = ["intro", "toMore", "pressMore", "expanded", "toRun", "pressRun", "success", "done"];
const reached = (phase: Phase, target: Phase) => ORDER.indexOf(phase) >= ORDER.indexOf(target);

export function SmartScreenGuide() {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a");
      if (!link || link.getAttribute("href") !== WINDOWS_DOWNLOAD_URL) return;
      if (!isWindows()) return;
      e.preventDefault();
      triggerRef.current = link;
      setSeen(readSeen());
      setOpen(true);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  const close = useCallback(() => {
    writeSeen();
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const download = useCallback(() => {
    writeSeen();
    setOpen(false);
    window.location.assign(WINDOWS_DOWNLOAD_URL);
  }, []);

  return (
    <AnimatePresence>
      {open && <GuideDialog key="smartscreen" initiallySeen={seen} onClose={close} onDownload={download} />}
    </AnimatePresence>
  );
}

function GuideDialog({
  initiallySeen,
  onClose,
  onDownload,
}: {
  initiallySeen: boolean;
  onClose: () => void;
  onDownload: () => void;
}) {
  const t = useTranslations("smartscreen");
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(reduceMotion ? "expanded" : "intro");
  const [run, setRun] = useState(0);
  // Once the animation has finished, the download stays unlocked (also across replays).
  const [unlocked, setUnlocked] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Drive the timeline (skipped entirely for reduced motion: static expanded state).
  useEffect(() => {
    if (reduceMotion) return;
    const timers = TIMELINE.map(([p, at]) =>
      window.setTimeout(() => {
        setPhase(p);
        if (p === "done") {
          writeSeen();
          setUnlocked(true);
        }
      }, at)
    );
    return () => timers.forEach(clearTimeout);
  }, [run, reduceMotion]);


  // Scroll lock, initial focus, Escape, focus trap.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const canDownload = initiallySeen || !!reduceMotion || unlocked;

  let caption: string;
  if (reduceMotion) caption = t("captions.reduced");
  else if (reached(phase, "success")) caption = t("captions.done");
  else if (reached(phase, "toRun")) caption = t("captions.run");
  else if (reached(phase, "toMore")) caption = t("captions.more");
  else caption = t("captions.appear");

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="smartscreen-title"
        aria-describedby="smartscreen-body"
        className="card-surface relative max-h-[100dvh] w-full overflow-y-auto rounded-t-3xl bg-background p-5 sm:max-h-[92vh] sm:max-w-lg sm:rounded-3xl sm:p-7"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <X size={18} />
        </button>

        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-strong">{t("eyebrow")}</p>
        <h2 id="smartscreen-title" className="mt-2 pr-10 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {t("title")}
        </h2>

        <SmartScreenIllustration phase={phase} run={run} reduceMotion={!!reduceMotion} />

        <div className="mt-3 flex min-h-[1.5rem] items-center justify-between gap-3">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={caption}
              aria-live="polite"
              className="text-sm font-medium text-foreground"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
            >
              {caption}
            </motion.p>
          </AnimatePresence>
          {!reduceMotion && phase === "done" && (
            <button
              type="button"
              onClick={() => {
                setPhase("intro");
                setRun((n) => n + 1);
              }}
              className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-dim transition-colors hover:text-foreground"
            >
              <RotateCcw size={13} />
              {t("replay")}
            </button>
          )}
        </div>

        <div id="smartscreen-body" className="mt-4 flex flex-col gap-2 text-sm leading-relaxed text-muted">
          <p>{t("body")}</p>
          <p className="text-muted-dim">
            {t.rich("support", {
              email: (chunks) => (
                <a href="mailto:support@colegapro.com" className="text-accent-strong hover:text-accent">
                  {chunks}
                </a>
              ),
            })}
          </p>
        </div>

        <button
          type="button"
          onClick={onDownload}
          disabled={!canDownload}
          className="relative mt-6 flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-b from-accent-strong to-accent text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(91,124,250,0.55)] transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed"
        >
          {/* While the animation plays, the button fills up like a progress bar. */}
          {!canDownload && (
            <>
              <span className="absolute inset-0 bg-background/70" />
              <motion.span
                key={run}
                className="absolute inset-y-0 left-0 bg-accent/30"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 5.3, ease: "linear" }}
              />
            </>
          )}
          <span className={cn("relative flex items-center gap-2", !canDownload && "text-white/70")}>
            <Download size={16} />
            {t("download")}
          </span>
        </button>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------------------------
// The illustration: a simplified, recognisable SmartScreen window plus an animated mouse pointer
// that clicks "More info" and then "Run anyway". Pointer targets are MEASURED from the rendered
// elements, so it lands correctly at any width and in any language.
// ---------------------------------------------------------------------------------------------

type Point = { x: number; y: number };

function SmartScreenIllustration({ phase, run, reduceMotion }: { phase: Phase; run: number; reduceMotion: boolean }) {
  const t = useTranslations("smartscreen.window");
  const stageRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLSpanElement>(null);
  const runRef = useRef<HTMLSpanElement>(null);
  const [start, setStart] = useState<Point | null>(null);
  const [morePoint, setMorePoint] = useState<Point | null>(null);
  const [runPoint, setRunPoint] = useState<Point | null>(null);

  const expanded = reduceMotion || reached(phase, "expanded");
  const success = !reduceMotion && reached(phase, "success");

  const measure = useCallback(() => {
    const stage = stageRef.current?.getBoundingClientRect();
    if (!stage) return;
    const centre = (el: HTMLElement | null, fx: number, fy: number): Point | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left - stage.left + r.width * fx, y: r.top - stage.top + r.height * fy };
    };
    setStart({ x: stage.width - 28, y: stage.height - 20 });
    setMorePoint(centre(moreRef.current, 0.55, 0.6));
    setRunPoint(centre(runRef.current, 0.5, 0.6));
  }, []);

  // Re-measure whenever the layout can have changed: phase changes (expansion), replays, resize.
  useLayoutEffect(() => {
    measure();
  }, [measure, phase, run]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  let target: Point | null = start;
  if (reduceMotion) target = runPoint;
  else if (reached(phase, "toRun")) target = runPoint ?? start;
  else if (reached(phase, "toMore")) target = morePoint ?? start;

  const pressingMore = !reduceMotion && phase === "pressMore";
  const pressingRun = !reduceMotion && phase === "pressRun";
  const showPointer = reduceMotion || (reached(phase, "toMore") && !success);

  return (
    <div ref={stageRef} className="relative mt-5 select-none px-1 pb-6 pt-1 sm:px-3" aria-hidden="true">
      {/* Simplified Windows window */}
      <motion.div
        key={run}
        className="overflow-hidden rounded-xl border border-white/10 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)]"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        <div className="flex h-6 items-center justify-end gap-3 bg-[#083f7a] px-3 text-[10px] text-white/70">
          <span>—</span>
          <span>▢</span>
          <span>✕</span>
        </div>

        <div className="relative bg-[#0b5aa8] px-4 pb-4 pt-4 text-white sm:px-6 sm:pt-5">
          <p className="text-[17px] font-light leading-snug sm:text-[21px]">{t("title")}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-white/85 sm:text-xs">{t("body")}</p>

          <p className="mt-2">
            <motion.span
              ref={moreRef}
              className="inline-block text-[11px] font-medium underline underline-offset-2 sm:text-xs"
              animate={{ opacity: pressingMore ? 0.6 : 1 }}
            >
              {t("moreInfo")}
            </motion.span>
          </p>

          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] text-white/85 sm:text-xs">
                  <dt>{t("app")}</dt>
                  <dd className="font-medium text-white">ColegaSetup.exe</dd>
                  <dt>{t("publisher")}</dt>
                  <dd className="font-medium text-white">{t("unknownPublisher")}</dd>
                </dl>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-5 flex justify-end gap-2">
            {expanded && (
              <motion.span
                ref={runRef}
                className="rounded-sm border border-white/70 px-3 py-1.5 text-[11px] sm:text-xs"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1, scale: pressingRun ? 0.94 : 1, backgroundColor: pressingRun ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0)" }}
                transition={{ duration: 0.15 }}
              >
                {t("runAnyway")}
              </motion.span>
            )}
            <span className="rounded-sm bg-white/15 px-3 py-1.5 text-[11px] sm:text-xs">{t("dontRun")}</span>
          </div>

          {/* Success state after "Run anyway" */}
          <AnimatePresence>
            {success && (
              <motion.div
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="relative">
                  <Logo className="h-12 w-12" />
                  <motion.span
                    className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 400, damping: 18 }}
                  >
                    <Check size={12} strokeWidth={3} />
                  </motion.span>
                </div>
                <p className="text-sm font-medium text-foreground">{t("installing")}</p>
                <div className="h-1 w-32 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="h-full rounded-full bg-accent-strong"
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 0.9, ease: "easeInOut" }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Click ripples */}
      <AnimatePresence>
        {(pressingMore || pressingRun) && (pressingMore ? morePoint : runPoint) && (
          <motion.span
            key={phase + run}
            className="pointer-events-none absolute h-8 w-8 rounded-full border-2 border-white/80"
            style={{
              left: (pressingMore ? morePoint! : runPoint!).x - 16,
              top: (pressingMore ? morePoint! : runPoint!).y - 16,
            }}
            initial={{ scale: 0.3, opacity: 0.9 }}
            animate={{ scale: 1.4, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      {/* Mouse pointer — tip of the arrow sits exactly on (x, y). */}
      {target && (
        <motion.div
          className="pointer-events-none absolute left-0 top-0 z-10"
          initial={false}
          animate={{
            x: target.x,
            y: target.y,
            opacity: showPointer ? 1 : 0,
            scale: pressingMore || pressingRun ? 0.85 : 1,
          }}
          transition={{
            x: { duration: reduceMotion ? 0 : 0.9, ease: [0.45, 0, 0.2, 1] },
            y: { duration: reduceMotion ? 0 : 0.9, ease: [0.45, 0, 0.2, 1] },
            opacity: { duration: 0.2 },
            scale: { duration: 0.12 },
          }}
          style={{ transformOrigin: "0 0" }}
        >
          <svg width="22" height="28" viewBox="0 0 22 28" className="drop-shadow-[0_2px_3px_rgba(0,0,0,0.5)]">
            <path
              d="M1.5 1.5v21.2l5.1-4.9 3.4 8.1 3.6-1.5-3.4-8h7.1z"
              fill="#fff"
              stroke="#0a0d18"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </motion.div>
      )}
    </div>
  );
}
