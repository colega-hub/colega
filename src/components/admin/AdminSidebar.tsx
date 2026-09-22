"use client";

import {
  LayoutDashboard,
  Users,
  Building2,
  CreditCard,
  Activity,
  LifeBuoy,
  ScrollText,
  Server,
  ArrowLeft,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "Users", icon: Users, exact: false },
  { href: "/admin/organizations", label: "Organizations", icon: Building2, exact: false },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard, exact: false },
  { href: "/admin/usage", label: "Usage", icon: Activity, exact: false },
  { href: "/admin/support", label: "Support / Demo", icon: LifeBuoy, exact: false },
  { href: "/admin/audit-log", label: "Audit Log", icon: ScrollText, exact: false },
  { href: "/admin/system", label: "System", icon: Server, exact: false },
] as const;

export function AdminSidebar() {
  // next/navigation's pathname is locale-prefixed (e.g. /en/admin/users); strip the leading
  // /xx segment so comparisons below match the locale-free hrefs above, the same convention
  // next-intl's own <Link> uses internally.
  const rawPathname = usePathname();
  const pathname = rawPathname.replace(/^\/[a-z]{2}(?=\/|$)/, "") || "/";

  return (
    <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-border bg-background-alt/60 px-3 py-6 lg:flex">
      <Link
        href="/"
        className="mb-6 flex items-center gap-2 px-2 text-sm text-muted-dim transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} />
        Back to site
      </Link>

      {ADMIN_NAV_ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-accent/10 text-accent-strong"
                : "text-muted hover:bg-white/[0.04] hover:text-foreground"
            )}
          >
            <Icon size={16} />
            {item.label}
          </Link>
        );
      })}
    </aside>
  );
}
