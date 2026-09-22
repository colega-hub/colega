import type { ReactNode } from "react";
import { redirect } from "@/i18n/navigation";
import { checkAdmin } from "@/lib/admin/guard";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminMobileNav } from "@/components/admin/AdminMobileNav";

export const metadata = {
  title: "Admin — Colega",
  robots: { index: false, follow: false },
};

/**
 * THE server-side gate for every /admin/* route (Section 2). Layouts run for their entire
 * subtree on every request that isn't served from the client-side router cache, so this check
 * executes on every /admin navigation — but per Next's own guidance (and AGENTS step 19), each
 * individual Server Action under /admin ALSO calls requireAdminForAction() independently; this
 * layout is the UX-friendly redirect, not the only enforcement point.
 *
 *   unauthenticated -> /login (Section 2)
 *   authenticated, not in admin_users -> /account ("safe page" alternative to a raw 403,
 *     Section 2 explicitly allows either)
 *   authenticated admin -> render the panel
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const result = await checkAdmin();

  if (result.status === "unauthenticated") redirect({ href: "/login", locale });
  if (result.status === "forbidden") redirect({ href: "/account", locale });

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminMobileNav />
        <main className="flex-1 px-4 py-8 sm:px-8 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
