"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Mic, PhoneOff, Video } from "lucide-react";

// Meeting demo for the "Why Colega" section: a video call and Colega's real Hear Mode in the Mini
// Panel (colega/src/mini-panel: coral listening orb, "Listening · 0:05", level meter + stop button,
// "Meeting audio + your mic" strip with "Ask for Advice", the Advice card with "You could say",
// and the "Listening ended" card whose "Save summary as note" writes a meeting note). The app does
// not show a bulleted summary inside the panel — the summary lives in the saved note, so the scene
// shows that note sliding in after saving. Same scaling/visibility approach as HeroDemo.

const W = 560;
const H = 440;

const BRAND = "linear-gradient(135deg, #4f7bff 0%, #7c5cff 55%, #42d4ff 100%)";
const GLASS =
  "radial-gradient(120% 90% at 0% 0%, rgba(124,92,255,0.16) 0%, rgba(124,92,255,0) 55%), radial-gradient(90% 80% at 100% 0%, rgba(66,212,255,0.1) 0%, rgba(66,212,255,0) 50%), linear-gradient(165deg, rgba(38,36,58,0.96) 0%, rgba(20,20,31,0.97) 60%, rgba(16,17,26,0.98) 100%)";

type Phase =
  | "idle"
  | "toHear"
  | "clickHear"
  | "hearing"
  | "question"
  | "toAdvice"
  | "clickAdvice"
  | "adviceLoading"
  | "advice"
  | "callEnded"
  | "toStop"
  | "clickStop"
  | "ended"
  | "toSave"
  | "clickSave"
  | "saved"
  | "reset";

const TIMELINE: [Phase, number][] = [
  ["idle", 0],
  ["toHear", 700],
  ["clickHear", 1550],
  ["hearing", 1700],
  ["question", 2700],
  ["toAdvice", 5600],
  ["clickAdvice", 6450],
  ["adviceLoading", 6600],
  ["advice", 7700],
  ["callEnded", 12400],
  ["toStop", 12900],
  ["clickStop", 13750],
  ["ended", 13900],
  ["toSave", 14900],
  ["clickSave", 15750],
  ["saved", 15900],
  ["reset", 19600],
];
const LOOP_MS = 20800;
const ORDER = TIMELINE.map(([p]) => p);

type Target = "rest" | "hear" | "advice" | "stop" | "save";
const REST = { x: 470, y: 60 };

export function MeetingDemo() {
  const t = useTranslations("features.meeting.demo");
  const reduceMotion = useReducedMotion();
  const outerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [seconds, setSeconds] = useState(0);

  useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1.15, el.clientWidth / W));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    let inView = false;
    const sync = () => setActive(inView && document.visibilityState === "visible");
    const io = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    }, { threshold: 0.2 });
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  useEffect(() => {
    if (!active || reduceMotion) return;
    const now = TIMELINE[index][1];
    const next = index + 1 < TIMELINE.length ? TIMELINE[index + 1][1] : LOOP_MS;
    const id = window.setTimeout(() => {
      const nextIndex = (index + 1) % TIMELINE.length;
      if (ORDER[nextIndex] === "hearing") setSeconds(0);
      setIndex(nextIndex);
    }, next - now);
    return () => window.clearTimeout(id);
  }, [index, active, reduceMotion]);

  const phase: Phase = reduceMotion ? "advice" : ORDER[index];
  const at = (p: Phase) => ORDER.indexOf(phase) >= ORDER.indexOf(p) && phase !== "reset";

  const hearing = at("hearing") && !at("ended");
  const speaking = phase === "question" || phase === "toAdvice";
  const showCaption = at("question") && !at("callEnded");
  const adviceOpen = at("adviceLoading") && !at("ended");
  const adviceReady = at("advice");
  const callEnded = at("callEnded");
  const ended = at("ended");
  const saved = at("saved");

  // Listening timer ("Listening · 0:05") — ticks once a second while listening and visible.
  useEffect(() => {
    if (!hearing || !active || reduceMotion) return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [hearing, active, reduceMotion]);
  const shownSeconds = reduceMotion ? 42 : seconds;
  const timer = `${Math.floor(shownSeconds / 60)}:${String(shownSeconds % 60).padStart(2, "0")}`;

  const pressing: Target | null =
    phase === "clickHear" ? "hear" : phase === "clickAdvice" ? "advice" : phase === "clickStop" ? "stop" : phase === "clickSave" ? "save" : null;

  let target: Target = "rest";
  if (at("toSave")) target = "save";
  else if (at("toStop")) target = "stop";
  else if (at("toAdvice")) target = "advice";
  else if (at("toHear")) target = "hear";
  if (phase === "callEnded") target = "advice";

  const hearRef = useRef<HTMLSpanElement>(null);
  const adviceRef = useRef<HTMLSpanElement>(null);
  const stopRef = useRef<HTMLSpanElement>(null);
  const saveRef = useRef<HTMLSpanElement>(null);
  const [points, setPoints] = useState<Partial<Record<Target, { x: number; y: number }>>>({});
  const measure = useCallback(() => {
    const stage = stageRef.current?.getBoundingClientRect();
    if (!stage || stage.width === 0) return;
    const k = stage.width / W;
    setPoints((prev) => {
      const nextPoints = { ...prev };
      const elements = { hear: hearRef.current, advice: adviceRef.current, stop: stopRef.current, save: saveRef.current };
      for (const key of ["hear", "advice", "stop", "save"] as const) {
        const el = elements[key];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        nextPoints[key] = { x: (r.left - stage.left + r.width * 0.55) / k, y: (r.top - stage.top + r.height * 0.6) / k };
      }
      return nextPoints;
    });
  }, []);
  useLayoutEffect(() => {
    measure();
  }, [measure, phase, scale]);

  const pointer = target === "rest" ? REST : (points[target] ?? REST);
  const ripplePoint = pressing ? points[pressing] : undefined;
  const words = t("caption.text").split(" ");

  return (
    <div ref={outerRef} className="relative w-full" style={{ height: H * scale }} role="img" aria-label={t("ariaLabel")}>
      <div
        ref={stageRef}
        aria-hidden="true"
        className="absolute left-0 top-0 origin-top-left select-none"
        style={{ width: W, height: H, transform: `scale(${scale})` }}
      >
        {/* ---------------- Video call ---------------- */}
        <div className="absolute left-0 top-0 h-[330px] w-[440px] overflow-hidden rounded-2xl border border-white/10 bg-[#0e1119] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
          <div className="flex h-9 items-center gap-2 border-b border-white/[0.06] px-4">
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="ml-3 truncate text-[12px] text-white/50">{t("call.title")}</span>
          </div>

          {/* main participant */}
          <div className="relative mx-3 mt-3 h-[222px] overflow-hidden rounded-xl bg-[radial-gradient(120%_100%_at_30%_20%,#2a3350_0%,#161b2b_60%,#10131c_100%)]">
            <div className="absolute left-[108px] top-[30%] -translate-x-1/2 -translate-y-1/2">
              <motion.div
                className="flex h-16 w-16 items-center justify-center rounded-full bg-[#c46b52] text-xl font-semibold text-white"
                animate={speaking ? { boxShadow: ["0 0 0 0px rgba(53,208,127,0.55)", "0 0 0 6px rgba(53,208,127,0)"] } : { boxShadow: "0 0 0 0px rgba(53,208,127,0)" }}
                transition={speaking ? { duration: 1.1, repeat: Infinity, ease: "easeOut" } : { duration: 0.2 }}
              >
                ED
              </motion.div>
            </div>
            <span className="absolute bottom-2 left-2 rounded-md bg-black/45 px-2 py-0.5 text-[11px] text-white/85">{t("call.client")}</span>

            {/* self view */}
            <div className="absolute right-2 top-2 flex h-14 w-20 items-center justify-center rounded-lg border border-white/10 bg-[#1d2233]">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4f7bff] text-[11px] font-semibold text-white">{t("call.selfInitials")}</span>
            </div>

            {/* live captions */}
            <AnimatePresence>
              {showCaption && (
                <motion.div
                  className="absolute bottom-9 left-3 w-[196px] rounded-lg bg-black/70 px-3 py-2 text-[12.5px] leading-snug text-white"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <span className="mr-1.5 font-semibold text-[#9fb4ff]">{t("caption.speaker")}:</span>
                  {words.map((word, i) => (
                    <motion.span
                      key={i}
                      initial={reduceMotion ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.2 + i * 0.2, duration: 0.2 }}
                    >
                      {word}{" "}
                    </motion.span>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* call ended overlay */}
            <AnimatePresence>
              {callEnded && (
                <motion.div
                  className="absolute inset-0 flex items-center bg-[#0e1119]/85 pl-[40px] text-[13px] font-medium text-white/80"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  {t("call.ended")}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* call controls */}
          <div className="mt-3 flex items-center gap-3 pl-[52px]">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.08] text-white/70">
              <Mic size={14} />
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.08] text-white/70">
              <Video size={14} />
            </span>
            <span className="flex h-8 w-11 items-center justify-center rounded-full bg-[#e5484d] text-white">
              <PhoneOff size={14} />
            </span>
          </div>
        </div>

        {/* ---------------- Saved meeting note ---------------- */}
        <AnimatePresence>
          {saved && (
            <motion.div
              className="absolute left-[12px] top-[150px] z-[5] w-[200px] rounded-xl border border-white/10 bg-[#171a26] p-3 text-[11.5px] text-[#eef0f6] shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)]"
              initial={{ opacity: 0, x: -14, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: reduceMotion ? 0 : 0.35, duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#72758a]">{t("note.app")}</p>
              <p className="mt-1 text-[12.5px] font-semibold">{t("note.title")}</p>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.05em] text-[#72758a]">{t("note.summaryLabel")}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[#a3a6b6]">
                <li>{t("note.summary1")}</li>
                <li>{t("note.summary2")}</li>
              </ul>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.05em] text-[#72758a]">{t("note.tasksLabel")}</p>
              <p className="mt-1 flex items-start gap-1.5 text-[#a3a6b6]">
                <span className="mt-[2px] h-3 w-3 shrink-0 rounded-[3px] border border-white/30" />
                {t("note.task")}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---------------- Mini Panel (Hear Mode) ---------------- */}
        <div
          className="absolute left-[222px] top-[112px] w-[334px] overflow-hidden rounded-[18px] border border-white/[0.11] text-[#eef0f6] shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_16px_36px_rgba(0,0,0,0.42),0_2px_8px_rgba(0,0,0,0.3)]"
          style={{ background: GLASS, fontFamily: "'Segoe UI Variable Text','Segoe UI',system-ui,sans-serif" }}
        >
          {/* header */}
          <div className="flex h-12 items-center justify-between gap-2 pl-[13px] pr-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <motion.span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: hearing ? "#ff6b6b" : BRAND }}
                animate={
                  hearing
                    ? { opacity: 1, boxShadow: ["0 0 0 0px rgba(255,107,107,0.55)", "0 0 0 7px rgba(255,107,107,0)"] }
                    : { opacity: 0.55, boxShadow: "0 0 0 0px rgba(255,107,107,0)" }
                }
                transition={hearing ? { boxShadow: { duration: 1.8, repeat: Infinity, ease: "easeOut" }, opacity: { duration: 0.2 } } : { duration: 0.3 }}
              />
              <div className="flex min-w-0 flex-col">
                <span className="flex items-center gap-1.5">
                  <span className="text-[12.5px] font-[650] tracking-[0.01em]">Colega</span>
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.06] px-[7px] text-[10.5px] font-[550] leading-[15px] text-[#a3a6b6]">
                    {t("panel.personal")}
                  </span>
                </span>
                <span className="text-[11px] tabular-nums text-[#a3a6b6]">
                  {hearing ? `${t("panel.listening")} · ${timer}` : t("panel.ready")}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {hearing ? (
                <motion.span className="flex items-center gap-1.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                  <MeterBars />
                  <motion.span
                    ref={stopRef}
                    className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-[#ff6b6b]/[0.12] text-[#ff6b6b]"
                    animate={{ scale: pressing === "stop" ? 0.9 : 1 }}
                    transition={{ duration: 0.12 }}
                  >
                    <Svg size={12}>
                      <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor" stroke="none" />
                    </Svg>
                  </motion.span>
                </motion.span>
              ) : (
                <span className="flex h-[26px] items-center rounded-full px-[11px] text-[11.5px] font-semibold text-white" style={{ background: BRAND }}>
                  {t("panel.shareScreen")}
                </span>
              )}
            </div>
          </div>

          {/* dock */}
          <div className="mx-2 flex items-center gap-1 rounded-[13px] border border-white/[0.07] bg-white/[0.045] p-1 text-[#a3a6b6]">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] opacity-55">
              <Svg size={15}>
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0" />
                <path d="M12 18v3" />
                <path d="M9 21h6" />
              </Svg>
            </span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] opacity-55">
              <Svg size={16}>
                <path d="M4 8V6a2 2 0 0 1 2-2h2" />
                <path d="M16 4h2a2 2 0 0 1 2 2v2" />
                <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
                <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
                <path d="M7.5 12h9" />
              </Svg>
            </span>
            <motion.span
              ref={hearRef}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
              style={{ background: hearing ? "linear-gradient(135deg, rgba(79,123,255,0.9), rgba(124,92,255,0.9))" : "transparent" }}
              animate={{
                color: hearing ? "#ffffff" : "#a3a6b6",
                boxShadow: hearing ? "0 0 0 1px rgba(66,212,255,0.45), 0 4px 14px rgba(79,123,255,0.35)" : "0 0 0 0px rgba(66,212,255,0)",
                scale: pressing === "hear" ? 0.92 : 1,
              }}
              transition={{ duration: 0.2 }}
            >
              <HearIcon active={hearing && !reduceMotion} />
            </motion.span>
            <span className="flex-1 truncate pl-2 text-[11.5px] text-[#72758a]">{hearing ? "" : t("panel.hint")}</span>
          </div>

          {/* hear strip: sources + Ask for Advice */}
          <AnimatePresence initial={false}>
            {hearing && (
              <motion.div
                className="overflow-hidden"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.2, 0.7, 0.2, 1] }}
              >
                <div className="mx-2 mt-1.5 flex items-center justify-between gap-2 pl-1.5">
                  <span className="truncate text-[10.5px] text-[#72758a]">{t("panel.sources")}</span>
                  <motion.span
                    ref={adviceRef}
                    className="flex h-[30px] shrink-0 items-center gap-1.5 rounded-full pl-2.5 pr-3 text-[12px] font-semibold text-white shadow-[0_4px_14px_rgba(124,92,255,0.32),inset_0_1px_0_rgba(255,255,255,0.25)]"
                    style={{ background: BRAND }}
                    animate={{ scale: pressing === "advice" ? 0.95 : 1, opacity: adviceOpen && !adviceReady ? 0.55 : 1 }}
                    transition={{ duration: 0.12 }}
                  >
                    <AdviceIcon size={14} />
                    {t("panel.askAdvice")}
                  </motion.span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* advice card */}
          <AnimatePresence initial={false}>
            {adviceOpen && (
              <motion.div
                className="overflow-hidden"
                initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
              >
                <div className="mx-2 mt-2 flex flex-col gap-1.5 rounded-[13px] border border-[#7c5cff]/[0.22] bg-[linear-gradient(160deg,rgba(79,123,255,0.1),rgba(124,92,255,0.06)_60%,rgba(255,255,255,0.03))] px-3 py-2.5">
                  <div className="flex items-center gap-[7px] text-[11.5px] font-[650] text-[#9fb4ff]">
                    <AdviceIcon size={13} />
                    <span>{t("panel.adviceHeader")}</span>
                  </div>
                  {!adviceReady ? (
                    <div className="flex items-center gap-2 text-[12px] text-[#a3a6b6]">
                      <motion.span
                        className="h-1.5 w-1.5 rounded-full bg-[#42d4ff]"
                        animate={{ opacity: [0.35, 1, 0.35], scale: [0.85, 1.1, 0.85] }}
                        transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
                      />
                      {t("panel.thinking")}
                    </div>
                  ) : (
                    <motion.div className="flex flex-col gap-1.5" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                      <p className="text-[13px] font-[650] leading-[1.4]">{t("advice.headline")}</p>
                      <div className="rounded-[9px] border border-[#42d4ff]/[0.16] bg-[#42d4ff]/[0.07] px-[9px] py-[7px]">
                        <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-[#72758a]">{t("panel.youCouldSay")}</span>
                        <p className="mt-[3px] text-[12.5px] leading-[1.45] text-[#d9f5ff]">&ldquo;{t("advice.line")}&rdquo;</p>
                      </div>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* listening ended card */}
          <AnimatePresence initial={false}>
            {ended && (
              <motion.div
                className="overflow-hidden"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
              >
                <div className="mx-2 mt-2 flex flex-col gap-1.5 rounded-[13px] border border-white/[0.07] bg-white/[0.045] px-3 py-2.5">
                  <div className="flex items-center gap-[7px] text-[11.5px] font-[650] text-[#a3a6b6]">
                    <Svg size={13}>
                      <path d="M6 10v4" />
                      <path d="M10 6.5v11" />
                      <path d="M14 8.5v7" />
                      <path d="M18 10.5v3" />
                    </Svg>
                    <span>{t("panel.endedTitle")}</span>
                  </div>
                  <p className="text-[12px] leading-[1.45] text-[#a3a6b6]">{t("panel.endedBody")}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <AnimatePresence mode="wait" initial={false}>
                      {saved ? (
                        <motion.span
                          key="saved"
                          className="flex h-[26px] items-center gap-1 text-[11.5px] font-semibold text-[#35d07f]"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ type: "spring", stiffness: 400, damping: 22 }}
                        >
                          <Svg size={13}>
                            <path d="M5 12.5l4.5 4.5L19 7.5" />
                          </Svg>
                          {t("panel.summarySaved")}
                        </motion.span>
                      ) : (
                        <motion.span key="actions" className="flex gap-1.5" exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                          <motion.span
                            ref={saveRef}
                            className="flex h-[26px] items-center whitespace-nowrap rounded-lg px-2.5 text-[11.5px] font-[550] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
                            style={{ background: BRAND }}
                            animate={{ scale: pressing === "save" ? 0.94 : 1 }}
                            transition={{ duration: 0.12 }}
                          >
                            {t("panel.saveSummary")}
                          </motion.span>
                          <span className="flex h-[26px] items-center rounded-lg border border-white/[0.07] bg-white/[0.045] px-2.5 text-[11.5px] font-[550] text-[#a3a6b6]">
                            {t("panel.discard")}
                          </span>
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="h-2" />
        </div>

        {/* ---------------- Pointer ---------------- */}
        <AnimatePresence>
          {ripplePoint && (
            <motion.span
              key={phase}
              className="pointer-events-none absolute h-8 w-8 rounded-full border-2 border-white/80"
              style={{ left: ripplePoint.x - 16, top: ripplePoint.y - 16 }}
              initial={{ scale: 0.3, opacity: 0.9 }}
              animate={{ scale: 1.4, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>
        {!reduceMotion && (
          <motion.div
            className="pointer-events-none absolute left-0 top-0 z-10"
            style={{ transformOrigin: "0 0" }}
            initial={false}
            animate={{ x: pointer.x, y: pointer.y, scale: pressing ? 0.85 : 1 }}
            transition={{
              x: { duration: 0.85, ease: [0.45, 0, 0.2, 1] },
              y: { duration: 0.85, ease: [0.45, 0, 0.2, 1] },
              scale: { duration: 0.12 },
            }}
          >
            <svg width="22" height="28" viewBox="0 0 22 28" className="drop-shadow-[0_2px_3px_rgba(0,0,0,0.5)]">
              <path d="M1.5 1.5v21.2l5.1-4.9 3.4 8.1 3.6-1.5-3.4-8h7.1z" fill="#fff" stroke="#0a0d18" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function Svg({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function AdviceIcon({ size }: { size: number }) {
  return (
    <Svg size={size}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M8.5 14.5A5.5 5.5 0 1 1 15.5 14.5c-.8.7-1.3 1.6-1.4 2.5H9.9c-.1-.9-.6-1.8-1.4-2.5Z" />
    </Svg>
  );
}

/** The dock's Hear (sound-wave) icon; its bars move while Hear Mode is listening. */
function HearIcon({ active }: { active: boolean }) {
  const bars: [number, number, number][] = [
    [6, 10, 14],
    [10, 6.5, 17.5],
    [14, 8.5, 15.5],
    [18, 10.5, 13.5],
  ];
  return (
    <Svg size={16}>
      {bars.map(([x, y1, y2], i) =>
        active ? (
          <motion.line
            key={i}
            x1={x}
            x2={x}
            initial={false}
            animate={{ y1: [y1, y1 - 2, y1 + 1.5, y1], y2: [y2, y2 + 2, y2 - 1.5, y2] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
          />
        ) : (
          <line key={i} x1={x} x2={x} y1={y1} y2={y2} />
        )
      )}
    </Svg>
  );
}

/** Header level meter (three bars, lit cyan by the input level) shown while listening. */
function MeterBars() {
  return (
    <span className="flex items-end gap-[2px]">
      {[6, 10, 14].map((h, i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-[2px]"
          style={{ height: h }}
          animate={{ backgroundColor: ["rgba(255,255,255,0.18)", "#42d4ff", "#42d4ff", "rgba(255,255,255,0.18)"] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}
