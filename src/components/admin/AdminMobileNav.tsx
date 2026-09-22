"use client";

import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { ADMIN_NAV_ITEMS } from "./AdminSidebar";

/** Horizontal scrollable pill nav for small screens — the sidebar (AdminSidebar) is
 * `lg:flex`/hidden below that, this is its `lg:hidden` counterpart (Section 24: responsive). */
export function AdminMobileNav() {
  const rawPathname = usePathname();
  const pathname = rawPathname.replace(/^\/[a-z]{2}(?=\/|$)/, "") || "/";

  return (
    <nav className="flex gap-2 overflow-x-auto border-b border-border bg-background-alt/60 px-4 py-3 lg:hidden">
      {ADMIN_NAV_ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-accent/10 text-accent-strong"
                : "border border-border-strong text-muted hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
