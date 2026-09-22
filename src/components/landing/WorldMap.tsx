"use client";

import { motion, useReducedMotion } from "framer-motion";
import { presenceCountries } from "@/lib/data";

// Stylised, low-detail continent silhouettes (not a geographically precise
// basemap) filled with a dot pattern so the map reads as data-driven rather
// than a stock illustration. Coordinates live in a 1000x500 viewBox, matching
// the 2:1 equirectangular percentages used for country markers.
const CONTINENTS = [
  // North America
  "M60,90 C110,55 190,50 250,65 C300,78 320,110 300,150 C330,175 320,215 290,230 C270,255 230,270 210,250 C180,260 150,250 140,225 C110,220 85,195 90,160 C70,145 45,120 60,90 Z",
  // South America
  "M270,300 C300,285 335,295 350,320 C370,350 365,390 350,420 C340,450 320,470 300,465 C285,440 275,410 280,380 C260,365 255,335 270,300 Z",
  // Europe
  "M470,80 C500,65 540,68 565,85 C580,95 575,115 560,125 C570,140 555,155 535,150 C520,165 495,160 490,140 C470,135 460,115 470,80 Z",
  // Africa
  "M475,175 C520,165 565,180 580,215 C595,250 585,290 570,325 C560,360 545,400 515,415 C495,420 480,400 480,375 C460,360 450,330 460,300 C445,270 450,235 465,210 C455,195 465,180 475,175 Z",
  // Asia
  "M590,60 C650,45 720,50 780,70 C840,85 900,95 920,130 C935,155 910,175 885,170 C870,190 840,195 815,180 C790,200 755,195 735,175 C700,190 660,180 645,155 C615,150 590,130 585,100 C575,85 580,70 590,60 Z",
  // Australia
  "M810,340 C850,325 900,330 925,355 C940,375 930,400 905,405 C880,415 845,410 825,390 C805,380 800,355 810,340 Z",
];

function polarPulseDelay(index: number) {
  return (index % 6) * 0.35;
}

export function WorldMap({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <svg
      viewBox="0 0 1000 500"
      className={className}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <defs>
        <pattern
          id="presence-dot-pattern"
          width="9"
          height="9"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1.4" cy="1.4" r="1.4" fill="rgba(148,168,235,0.55)" />
        </pattern>
        <radialGradient id="presence-marker-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(122,148,255,0.9)" />
          <stop offset="100%" stopColor="rgba(122,148,255,0)" />
        </radialGradient>
      </defs>

      <g opacity={0.55}>
        {CONTINENTS.map((d, i) => (
          <path key={i} d={d} fill="url(#presence-dot-pattern)" />
        ))}
      </g>

      {presenceCountries.map((country, i) => {
        const cx = (country.x / 100) * 1000;
        const cy = (country.y / 100) * 500;

        return (
          <g key={country.id}>
            <circle cx={cx} cy={cy} r={14} fill="url(#presence-marker-glow)" opacity={0.5} />
            {!reduceMotion && (
              <motion.circle
                cx={cx}
                cy={cy}
                r={3}
                fill="none"
                stroke="rgba(122,148,255,0.55)"
                strokeWidth={1}
                initial={{ opacity: 0.5, scale: 1 }}
                animate={{ opacity: [0.5, 0, 0.5], scale: [1, 3.2, 1] }}
                transition={{
                  duration: 3.4,
                  repeat: Infinity,
                  ease: "easeOut",
                  delay: polarPulseDelay(i),
                }}
                style={{ transformOrigin: `${cx}px ${cy}px` }}
              />
            )}
            <circle cx={cx} cy={cy} r={2.5} fill="var(--accent-strong)" />
          </g>
        );
      })}
    </svg>
  );
}
