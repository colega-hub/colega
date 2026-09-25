"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Paperclip } from "lucide-react";

// Hero product demo: an email draft that says "attached" with nothing attached, and Colega's real
// Mini Panel (look, colours, icons and copy mirror colega/src/mini-panel) catching it. The whole
// scene is laid out at a fixed design size and scaled to the column, so the pointer's coordinates
// stay exact at every width. The timeline only runs while the scene is on screen and the tab is
// visible; reduced-motion visitors get one static frame with the finding shown.

const W = 560;
const H = 440;

// Mini Panel design tokens (colega/src/mini-panel.css).
const BRAND = "linear-gradient(135deg, #4f7bff 0%, #7c5cff 55%, #42d4ff 100%)";
const GLASS =
  "radial-gradient(120% 90% at 0% 0%, rgba(124,92,255,0.16) 0%, rgba(124,92,255,0) 55%), radial-gradient(90% 80% at 100% 0%, rgba(66,212,255,0.1) 0%, rgba(66,212,255,0) 50%), linear-gradient(165deg, rgba(38,36,58,0.96) 0%, rgba(20,20,31,0.97) 60%, rgba(16,17,26,0.98) 100%)";

type Phase =
  | "idle"
  | "toShare"
  | "clickShare"
  | "shared"
  | "toMic"
  | "clickMic"
  | "listening"
  | "transcribing"
  | "toSend"
  | "clickSend"
  | "checking"
  | "result"
  | "toTask"
  | "clickTask"
  | "saved"
  | "reset";

const TIMELINE: [Phase, number][] = [
  ["idle", 0],
  ["toShare", 800],
  ["clickShare", 1750],
  ["shared", 1950],
  ["toMic", 2900],
  ["clickMic", 3750],
  ["listening", 3900],
  ["transcribing", 4400],
  ["toSend", 6900],
  ["clickSend", 7550],
  ["checking", 7700],
  ["result", 9200],
  ["toTask", 10500],
  ["clickTask", 11350],
  ["saved", 11500],
  ["reset", 13100],
];
const LOOP_MS = 14300;
const ORDER = TIMELINE.map(([p]) => p);

type Target = "rest" | "share" | "mic" | "send" | "task";
const REST = { x: 470, y: 118 };

export function HeroDemo() {
  const t = useTranslations("hero.demo");
  const reduceMotion = useReducedMotion();
  const outerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);

  // --- scale to the column width ---
  useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1.15, el.clientWidth / W));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // --- run only while visible (viewport + tab) ---
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

  // --- timeline driver: pauses in place, resumes from the same phase ---
  useEffect(() => {
    if (!active || reduceMotion) return;
    const now = TIMELINE[index][1];
    const next = index + 1 < TIMELINE.length ? TIMELINE[index + 1][1] : LOOP_MS;
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % TIMELINE.length), next - now);
    return () => window.clearTimeout(id);
  }, [index, active, reduceMotion]);

  const phase: Phase = reduceMotion ? "result" : ORDER[index];
  const at = (p: Phase) => ORDER.indexOf(phase) >= ORDER.indexOf(p) && phase !== "reset";

  const shared = at("shared");
  const micOn = phase === "clickMic" || phase === "listening" || phase === "transcribing";
  const showTranscript = at("transcribing");
  // Speech caption: the full sentence while the user is speaking, gone once it is sent.
  const speaking = !reduceMotion && (phase === "listening" || phase === "transcribing" || phase === "toSend" || phase === "clickSend");
  const checking = phase === "checking";
  const showResult = at("result");
  const saved = at("saved");
  const pressing: Target | null =
    phase === "clickShare" ? "share" : phase === "clickMic" ? "mic" : phase === "clickSend" ? "send" : phase === "clickTask" ? "task" : null;

  let target: Target = "rest";
  if (at("toTask")) target = "task";
  else if (at("toSend")) target = "send";
  else if (at("toMic")) target = "mic";
  else if (at("toShare")) target = "share";

  // --- pointer targets, measured in design units (independent of the current scale) ---
  const shareRef = useRef<HTMLSpanElement>(null);
  const micRef = useRef<HTMLSpanElement>(null);
  const sendRef = useRef<HTMLSpanElement>(null);
  const taskRef = useRef<HTMLSpanElement>(null);
  const [points, setPoints] = useState<Partial<Record<Target, { x: number; y: number }>>>({});
  const measure = useCallback(() => {
    const stage = stageRef.current?.getBoundingClientRect();
    if (!stage || stage.width === 0) return;
    const k = stage.width / W;
    setPoints((prev) => {
      const nextPoints = { ...prev };
      const elements = { share: shareRef.current, mic: micRef.current, send: sendRef.current, task: taskRef.current };
      for (const key of ["share", "mic", "send", "task"] as const) {
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

  const words = t("question").split(" ");

  return (
    <div
      ref={outerRef}
      className="relative w-full"
      style={{ height: H * scale }}
      role="img"
      aria-label={t("ariaLabel")}
    >
      <div
        ref={stageRef}
        aria-hidden="true"
        className="absolute left-0 top-0 origin-top-left select-none"
        style={{ width: W, height: H, transform: `scale(${scale})` }}
      >
        {/* ---------------- Email draft (the "screen") ---------------- */}
        <div
          className={`absolute left-0 top-0 h-[318px] w-[530px] overflow-hidden rounded-2xl border bg-[#10131c] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] transition-[border-color,box-shadow] duration-500 ${
            shared ? "border-[#35d07f]/50 shadow-[0_0_0_3px_rgba(53,208,127,0.12),0_30px_80px_-20px_rgba(0,0,0,0.6)]" : "border-white/10"
          }`}
        >
          <div className="flex h-9 items-center gap-2 border-b border-white/[0.06] px-4">
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="ml-3 text-[12px] text-white/50">{t("email.window")}</span>
          </div>

          <div className="flex items-center gap-3 px-5 pt-3">
            <span className="rounded-md bg-[#3b6cf0] px-3 py-1 text-[12px] font-medium text-white">{t("email.send")}</span>
            <Paperclip size={15} className="text-white/40" />
          </div>

          <div className="mt-3 px-5 text-[12.5px]">
            <div className="flex gap-3 border-b border-white/[0.06] py-2">
              <span className="w-12 text-white/40">{t("email.toLabel")}</span>
              <span className="text-white/80">{t("email.to")}</span>
            </div>
            <div className="flex gap-3 border-b border-white/[0.06] py-2">
              <span className="w-12 text-white/40">{t("email.subjectLabel")}</span>
              <span className="font-medium text-white/90">{t("email.subject")}</span>
            </div>
          </div>

          <div className="mt-4 flex w-[232px] flex-col gap-2 px-5 text-[13px] leading-relaxed text-white/80">
            <p>{t("email.greeting")}</p>
            <p>
              <span className="relative">
                <motion.span
                  className="absolute -inset-x-1 -inset-y-0.5 rounded bg-[#e8a444]/20"
                  initial={false}
                  animate={{ opacity: showResult ? 1 : 0 }}
                  transition={{ duration: 0.5 }}
                />
                <motion.span
                  className="absolute inset-x-0 -bottom-0.5 h-[2px] origin-left rounded-full bg-[#e8a444]"
                  initial={false}
                  animate={{ scaleX: showResult ? 1 : 0 }}
                  transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
                />
                <span className="relative">{t("email.highlight")}</span>
              </span>{" "}
              {t("email.after")}
            </p>
            <p>
              {t("email.closing")}
              <br />
              {t("email.signature")}
            </p>
          </div>

          {/* Scan line while Colega checks the screen */}
          <AnimatePresence>
            {checking && (
              <motion.div
                className="pointer-events-none absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-[#42d4ff]/15 to-transparent"
                initial={{ top: -64, opacity: 0 }}
                animate={{ top: 318, opacity: [0, 1, 1, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.4, ease: "easeInOut" }}
              />
            )}
          </AnimatePresence>
        </div>

        {/* ---------------- Speech caption ---------------- */}
        <AnimatePresence>
          {speaking && (
            <motion.div
              className="absolute left-[234px] top-[88px] z-[5] flex max-w-[300px] items-start gap-2 rounded-2xl rounded-bl-md border border-white/10 bg-[#1b1d2b]/95 px-3 py-2 text-[12.5px] leading-snug text-white shadow-[0_12px_30px_-10px_rgba(0,0,0,0.7)]"
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <motion.span
                className="mt-[5px] h-2 w-2 shrink-0 rounded-full bg-[#ff6b6b]"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              />
              <span>
                {showTranscript ? (
                  words.map((word, i) => (
                    <motion.span
                      key={i}
                      initial={{ opacity: 0, filter: "blur(3px)" }}
                      animate={{ opacity: 1, filter: "blur(0px)" }}
                      transition={{ delay: i * 0.24, duration: 0.25 }}
                    >
                      {word}{" "}
                    </motion.span>
                  ))
                ) : (
                  <span className="italic text-white/60">{t("panel.listening")}</span>
                )}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---------------- Mini Panel ---------------- */}
        <div
          className="absolute left-[220px] top-[142px] w-[334px] overflow-hidden rounded-[18px] border border-white/[0.11] text-[#eef0f6] shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_16px_36px_rgba(0,0,0,0.42),0_2px_8px_rgba(0,0,0,0.3)]"
          style={{ background: GLASS, fontFamily: "'Segoe UI Variable Text','Segoe UI',system-ui,sans-serif" }}
        >
          {/* header */}
          <div className="flex h-12 items-center justify-between gap-2 pl-[13px] pr-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <motion.span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: shared ? "linear-gradient(135deg,#35d07f,#42d4ff)" : BRAND }}
                animate={
                  shared
                    ? { opacity: [0.75, 1, 0.75], boxShadow: "0 0 8px rgba(53,208,127,0.45)" }
                    : { opacity: 0.55, boxShadow: "0 0 0 rgba(0,0,0,0)" }
                }
                transition={shared ? { opacity: { duration: 3.4, repeat: Infinity, ease: "easeInOut" } } : { duration: 0.3 }}
              />
              <div className="flex min-w-0 flex-col">
                <span className="flex items-center gap-1.5">
                  <span className="text-[12.5px] font-[650] tracking-[0.01em]">Colega</span>
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.06] px-[7px] text-[10.5px] font-[550] leading-[15px] text-[#a3a6b6]">
                    {t("panel.personal")}
                  </span>
                </span>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={checking ? "checking" : shared ? "shared" : "ready"}
                    className="text-[11px] text-[#a3a6b6]"
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    transition={{ duration: 0.18 }}
                  >
                    {checking ? t("panel.checking") : shared ? t("panel.shared") : t("panel.ready")}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {!shared ? (
                <motion.span
                  ref={shareRef}
                  className="flex h-[26px] items-center rounded-full px-[11px] text-[11.5px] font-semibold text-white"
                  style={{ background: BRAND }}
                  animate={{ scale: pressing === "share" ? 0.95 : 1 }}
                  transition={{ duration: 0.12 }}
                >
                  {t("panel.shareScreen")}
                </motion.span>
              ) : (
                <motion.span
                  className="flex items-center gap-1 text-[#a3a6b6]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.25 }}
                >
                  <ToolBtn>
                    <Svg size={14}>
                      <path d="M12 5v14M5 12h14" />
                    </Svg>
                  </ToolBtn>
                  <ToolBtn>
                    <Svg size={14}>
                      <path d="M9 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
                      <path d="M14 4h6v6" />
                      <path d="M10 14L20 4" />
                    </Svg>
                  </ToolBtn>
                  <ToolBtn>
                    <span className="text-[11px]">✕</span>
                  </ToolBtn>
                </motion.span>
              )}
            </div>
          </div>

          {/* dock */}
          <div className="mx-2 flex items-center gap-1 rounded-[13px] border border-white/[0.07] bg-white/[0.045] p-1">
            <motion.span
              ref={micRef}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
              animate={
                micOn
                  ? { backgroundColor: "rgba(255,107,107,0.85)", color: "#ffffff", boxShadow: "0 0 0 3px rgba(255,107,107,0.18)", opacity: [0.8, 1, 0.8] }
                  : { backgroundColor: "rgba(255,255,255,0)", color: "#a3a6b6", boxShadow: "0 0 0 0 rgba(255,107,107,0)", opacity: shared ? 1 : 0.55 }
              }
              transition={micOn ? { opacity: { duration: 1.6, repeat: Infinity, ease: "easeInOut" }, default: { duration: 0.2 } } : { duration: 0.2 }}
            >
              <Svg size={15}>
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0" />
                <path d="M12 18v3" />
                <path d="M9 21h6" />
              </Svg>
            </motion.span>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[#a3a6b6] ${shared ? "" : "opacity-55"}`}>
              <Svg size={16}>
                <path d="M4 8V6a2 2 0 0 1 2-2h2" />
                <path d="M16 4h2a2 2 0 0 1 2 2v2" />
                <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
                <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
                <path d="M7.5 12h9" />
              </Svg>
            </span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[#a3a6b6]">
              <Svg size={16}>
                <path d="M6 10v4" />
                <path d="M10 6.5v11" />
                <path d="M14 8.5v7" />
                <path d="M18 10.5v3" />
              </Svg>
            </span>

            {shared ? (
              <motion.div
                className="ml-0.5 flex min-w-0 flex-1 items-center gap-1 border-l border-white/[0.07] pl-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25 }}
              >
                <div className="flex h-8 min-w-0 flex-1 items-center overflow-hidden px-1.5 text-[12.5px]">
                  {showTranscript ? (
                    <span className="truncate text-[#eef0f6]">
                      {words.map((word, i) => (
                        <motion.span
                          key={i}
                          initial={reduceMotion ? false : { opacity: 0, filter: "blur(3px)" }}
                          animate={{ opacity: 1, filter: "blur(0px)" }}
                          transition={{ delay: i * 0.24, duration: 0.25 }}
                        >
                          {word}{" "}
                        </motion.span>
                      ))}
                    </span>
                  ) : micOn ? (
                    <span className="flex items-center gap-2 italic text-[#a3a6b6]">
                      {t("panel.listening")}
                      <LevelBars />
                    </span>
                  ) : (
                    <span className="truncate text-[#72758a]">{t("panel.askPlaceholder")}</span>
                  )}
                </div>
                <motion.span
                  ref={sendRef}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
                  style={{ background: BRAND }}
                  animate={{ scale: pressing === "send" ? 0.9 : 1 }}
                  transition={{ duration: 0.12 }}
                >
                  <Svg size={13}>
                    <path d="M12 19V5" />
                    <path d="M6 11l6-6 6 6" />
                  </Svg>
                </motion.span>
              </motion.div>
            ) : (
              <span className="flex-1" />
            )}
          </div>

          {/* check card area */}
          <AnimatePresence initial={false}>
            {checking && (
              <motion.div
                key="loading"
                className="mx-2 mt-2 flex items-center gap-2 rounded-[13px] border border-white/[0.07] bg-white/[0.045] px-3 py-2.5 text-[12px] text-[#a3a6b6]"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <motion.span
                  className="h-1.5 w-1.5 rounded-full bg-[#42d4ff]"
                  animate={{ opacity: [0.35, 1, 0.35], scale: [0.85, 1.1, 0.85] }}
                  transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
                />
                {t("panel.thinking")}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {showResult && (
              <motion.div
                key="result"
                className="overflow-hidden"
                initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
              >
                <div className="mx-2 mt-2 flex flex-col gap-1.5 rounded-[13px] border border-white/[0.07] bg-white/[0.045] px-3 py-2.5 shadow-[inset_2px_0_0_#f0b45a]">
                  <div className="flex items-center gap-[7px] text-[11.5px] font-[650] text-[#e8a444]">
                    <Svg size={14}>
                      <path d="M10.3 3.8L2.5 18a1.5 1.5 0 0 0 1.3 2.2h16.4a1.5 1.5 0 0 0 1.3-2.2L13.7 3.8a1.5 1.5 0 0 0-2.6 0z" />
                      <path d="M12 9v4" />
                      <path d="M12 17h.01" />
                    </Svg>
                    <span>{t("result.title")}</span>
                  </div>
                  <p className="text-[12.5px] leading-[1.45]">{t("result.body")}</p>
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
                          {t("panel.savedAsTask")}
                        </motion.span>
                      ) : (
                        <motion.span key="save" className="flex gap-1.5" exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                          <CheckBtn innerRef={taskRef} pressed={pressing === "task"}>
                            {t("panel.saveAsTask")}
                          </CheckBtn>
                          <CheckBtn>{t("panel.saveAsNote")}</CheckBtn>
                        </motion.span>
                      )}
                    </AnimatePresence>
                    <CheckBtn primary>{t("panel.openInColega")}</CheckBtn>
                    <CheckBtn>{t("panel.dismiss")}</CheckBtn>
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

function ToolBtn({ children }: { children: ReactNode }) {
  return <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg">{children}</span>;
}

function CheckBtn({
  children,
  primary,
  pressed,
  innerRef,
}: {
  children: ReactNode;
  primary?: boolean;
  pressed?: boolean;
  innerRef?: React.Ref<HTMLSpanElement>;
}) {
  return (
    <motion.span
      ref={innerRef}
      className={`flex h-[26px] items-center whitespace-nowrap rounded-lg border px-2.5 text-[11.5px] font-[550] ${
        primary
          ? "border-transparent text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
          : "border-white/[0.07] bg-white/[0.045] text-[#a3a6b6]"
      }`}
      style={primary ? { background: BRAND } : undefined}
      animate={primary ? { scale: pressed ? 0.94 : 1 } : { scale: pressed ? 0.94 : 1, backgroundColor: pressed ? "rgba(255,255,255,0.13)" : "rgba(255,255,255,0.045)" }}
      transition={{ duration: 0.12 }}
    >
      {children}
    </motion.span>
  );
}

/** Small live input-level bars shown while the microphone is listening. */
function LevelBars() {
  return (
    <span className="flex h-3 items-end gap-[2px]">
      {[0, 1, 2, 3].map((i) => (
        <motion.span
          key={i}
          className="w-[2px] rounded-full bg-[#ff6b6b]"
          animate={{ height: ["30%", "100%", "45%", "80%", "30%"] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}
