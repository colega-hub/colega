import type { LucideIcon } from "lucide-react";
import {
  Eye,
  Bell,
  BrainCircuit,
  ListChecks,
  GraduationCap,
  Monitor,
  Zap,
  ShieldCheck,
  Download,
  Share2,
  Rocket,
  PenTool,
  Code2,
  Megaphone,
  Workflow,
  Users,
} from "lucide-react";

export const navItems = [
  { id: "features", href: "/#features" },
  { id: "howItWorks", href: "/#how-it-works" },
  { id: "useCases", href: "/#use-cases" },
  { id: "pricing", href: "/pricing" },
  { id: "download", href: "/download" },
  { id: "faq", href: "/#faq" },
] as const;

export type FeatureKind = "plain" | "nudge" | "memory" | "teach";

export type FeatureItem = {
  id: string;
  icon: LucideIcon;
  kind: FeatureKind;
};

export const featureItems: FeatureItem[] = [
  { id: "sees", icon: Eye, kind: "plain" },
  { id: "nudge", icon: Bell, kind: "nudge" },
  { id: "memory", icon: BrainCircuit, kind: "memory" },
  { id: "tasks", icon: ListChecks, kind: "plain" },
  { id: "teach", icon: GraduationCap, kind: "teach" },
  { id: "desktop", icon: Monitor, kind: "plain" },
  { id: "miniPanel", icon: Zap, kind: "plain" },
  { id: "private", icon: ShieldCheck, kind: "plain" },
];

export const stepItems = [
  { id: "install", icon: Download },
  { id: "share", icon: Share2 },
  { id: "keepUp", icon: Rocket },
] as const;

export const useCaseItems = [
  { id: "founders", icon: Rocket },
  { id: "designers", icon: PenTool },
  { id: "developers", icon: Code2 },
  { id: "marketing", icon: Megaphone },
  { id: "operations", icon: Workflow },
  { id: "teams", icon: Users },
] as const;

export type PlanId = "starter" | "pro" | "team" | "enterprise";

export type Plan = {
  id: PlanId;
  priceMonthly: number | "Free" | "Custom";
  priceAnnual: number | "Free" | "Custom";
  unit: string;
  popular?: boolean;
  hasSeatSelector?: boolean;
};

export const plans: Plan[] = [
  { id: "starter", priceMonthly: "Free", priceAnnual: "Free", unit: "" },
  { id: "pro", priceMonthly: 19, priceAnnual: 15, unit: "/mo", popular: true },
  { id: "team", priceMonthly: 39, priceAnnual: 31, unit: "/mo", hasSeatSelector: true },
  { id: "enterprise", priceMonthly: "Custom", priceAnnual: "Custom", unit: "" },
];

export type ComparisonRow = {
  id: string;
  starter: boolean;
  pro: boolean;
  team: boolean;
};

export const comparisonRows: ComparisonRow[] = [
  { id: "desktop", starter: true, pro: true, team: true },
  { id: "basicMemory", starter: true, pro: true, team: true },
  { id: "advancedMemory", starter: false, pro: true, team: true },
  { id: "proactive", starter: false, pro: true, team: true },
  { id: "tasks", starter: true, pro: true, team: true },
  { id: "miniPanel", starter: false, pro: true, team: true },
  { id: "teach", starter: false, pro: false, team: true },
  { id: "sharedWorkspace", starter: false, pro: false, team: true },
  { id: "admin", starter: false, pro: false, team: true },
  { id: "support", starter: false, pro: true, team: true },
];

export const trustedLogos = [
  "Northwind",
  "Vertex Labs",
  "Lumen",
  "Orbit",
  "Nimbus",
  "Fieldnote",
];

export const footerGroups = [
  {
    id: "product",
    links: [
      { id: "features", href: "/#features" },
      { id: "howItWorks", href: "/#how-it-works" },
      { id: "useCases", href: "/#use-cases" },
    ],
  },
  {
    id: "pricing",
    links: [
      { id: "plans", href: "/pricing" },
      { id: "comparePlans", href: "/pricing#compare" },
      { id: "faq", href: "/#faq" },
    ],
  },
  {
    id: "download",
    links: [
      { id: "downloadWindows", href: "/download" },
      { id: "downloadMac", href: "/download" },
      { id: "releaseNotes", href: "/download#release-notes" },
    ],
  },
  {
    id: "company",
    links: [
      { id: "privacy", href: "/privacy" },
      { id: "terms", href: "/terms" },
      { id: "contact", href: "/contact" },
    ],
  },
] as const;

// Coordinates are percentages within a 2:1 equirectangular map (x = longitude, y = latitude),
// so they line up with WorldMap's viewBox regardless of rendered size.
export type PresenceCountry = {
  id: string;
  flag: string;
  /** Marker position on the map. */
  x: number;
  y: number;
  /** Floating chip anchor. Defaults near the marker; a few are nudged apart to avoid
   * overlapping in dense regions (e.g. Western Europe), which is when a connector line is drawn. */
  chipX?: number;
  chipY?: number;
};

export const presenceCountries: PresenceCountry[] = [
  { id: "us", flag: "🇺🇸", x: 22.7, y: 28.1 },
  { id: "ca", flag: "🇨🇦", x: 29.0, y: 24.8 },
  { id: "br", flag: "🇧🇷", x: 36.7, y: 58.8 },
  { id: "gb", flag: "🇬🇧", x: 50.0, y: 21.4, chipX: 40, chipY: 9 },
  { id: "fr", flag: "🇫🇷", x: 50.7, y: 22.9, chipX: 48, chipY: 5 },
  { id: "nl", flag: "🇳🇱", x: 51.4, y: 20.9, chipX: 62.5, chipY: 12 },
  { id: "de", flag: "🇩🇪", x: 53.7, y: 20.8, chipX: 56, chipY: 7.5 },
  { id: "tr", flag: "🇹🇷", x: 59.1, y: 27.8 },
  { id: "za", flag: "🇿🇦", x: 57.8, y: 64.3 },
  { id: "ae", flag: "🇦🇪", x: 65.4, y: 36.0 },
  { id: "in", flag: "🇮🇳", x: 71.4, y: 34.1 },
  { id: "sg", flag: "🇸🇬", x: 78.8, y: 49.3 },
  { id: "jp", flag: "🇯🇵", x: 88.8, y: 30.2 },
  { id: "au", flag: "🇦🇺", x: 87.2, y: 63.9 },
];
