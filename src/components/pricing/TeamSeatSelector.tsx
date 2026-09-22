"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { TEAM_MAX_SEATS, TEAM_MIN_SEATS } from "@/lib/pricing";

export function TeamSeatSelector({
  seats,
  onChange,
}: {
  seats: number;
  onChange: (seats: number) => void;
}) {
  const t = useTranslations("pricing.team");
  const percent = ((seats - TEAM_MIN_SEATS) / (TEAM_MAX_SEATS - TEAM_MIN_SEATS)) * 100;
  const atMax = seats >= TEAM_MAX_SEATS;

  return (
    <div className="mt-6 rounded-2xl border border-border bg-white/[0.02] p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{t("seatsLabel")}</span>
        <span className="font-semibold text-accent-strong tabular-nums">{seats}</span>
      </div>

      <input
        type="range"
        min={TEAM_MIN_SEATS}
        max={TEAM_MAX_SEATS}
        step={1}
        value={seats}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={t("seatsLabel")}
        className={[
          "mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full",
          "[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none",
          "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gradient-to-b",
          "[&::-webkit-slider-thumb]:from-accent-strong [&::-webkit-slider-thumb]:to-accent",
          "[&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgba(91,124,250,0.18)] [&::-webkit-slider-thumb]:transition-transform",
          "[&::-webkit-slider-thumb]:hover:scale-110",
          "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:appearance-none",
          "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-gradient-to-b",
          "[&::-moz-range-thumb]:from-accent-strong [&::-moz-range-thumb]:to-accent",
        ].join(" ")}
        style={{
          background: `linear-gradient(to right, var(--accent-strong) ${percent}%, rgba(255,255,255,0.1) ${percent}%)`,
        }}
      />

      <p className="mt-3 text-xs text-muted-dim">{t("seatsIncluded")}</p>
      <p className="text-xs text-muted-dim">{t("extraSeatNote")}</p>

      <AnimatePresence>
        {atMax && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-accent/25 bg-accent/[0.06] px-3 py-2">
              <span className="text-xs text-muted">{t("needMoreSeats")}</span>
              <Link
                href="/contact"
                className="shrink-0 text-xs font-semibold text-accent-strong hover:text-accent"
              >
                {t("talkToSales")}
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
