import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Toaster } from "@/components/admin/toast";
import { requireAdmin } from "@/lib/admin/auth";
import "./admin.css";

/* ─────────────────────────────────────────────────────────────
   The admin ("Studio"). Without ADMIN_SESSION_SECRET and at least
   one valid studio user (ADMIN_<n>_… blocks, or the older single
   ADMIN_PASSWORD) it doesn't exist: every URL is the site's
   ordinary 404. Never indexed, never cached, never linked.
   ───────────────────────────────────────────────────────────── */

export const metadata: Metadata = {
  // `absolute`: the public site's title template never applies inside the studio.
  title: { absolute: "Studio", template: "%s · Studio" },
  description: null,
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  referrer: "no-referrer",
  openGraph: null,
  twitter: null,
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Decided per request: a build without the env must not bake in a 404.
  await requireAdmin();

  return (
    <div className="admin-root relative min-h-svh bg-bg text-ink antialiased">
      {children}
      <Toaster />
    </div>
  );
}
