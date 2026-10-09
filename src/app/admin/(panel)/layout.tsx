import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/shell";
import { requireSession } from "@/lib/admin/auth";
import { countNewLeads } from "@/lib/admin/leads";
import { collectionStats } from "@/lib/admin/overview";
import { can } from "@/lib/admin/roles";
import { readSnapshot } from "@/lib/admin/store";
import { brandMark, resolveBrand } from "@/lib/brand";

/** The Leads badge never holds up a screen: a slow or unreachable store just shows none. */
function newLeadCount(): Promise<number> {
  const timeout = new Promise<number>((resolve) => setTimeout(resolve, 2500, 0));
  return Promise.race([countNewLeads().catch(() => 0), timeout]);
}

/**
 * Every studio screen except the login. Pages check the session too
 * (layouts and pages render in parallel, so a layout alone can't guard them).
 */
export default async function PanelLayout({ children }: { children: ReactNode }) {
  const { config, user } = await requireSession();
  const [snapshot, newLeads] = await Promise.all([readSnapshot(), can(user.role, "leads") ? newLeadCount() : 0]);
  const stats = collectionStats(snapshot);
  const settings = snapshot.settings as { name?: unknown } | undefined;

  const counts = Object.fromEntries(
    Object.entries(stats).map(([name, s]) => [name, { total: s.total, hidden: s.hidden }]),
  ) as Record<keyof typeof stats, { total: number; hidden: number }>;

  return (
    <AdminShell
      base={config.base}
      siteName={typeof settings?.name === "string" ? settings.name : "Studio"}
      mark={brandMark(resolveBrand(snapshot.settings))}
      counts={counts}
      newLeads={newLeads}
      mongo={process.env.CONTENT_SOURCE === "mongo"}
      user={user}
    >
      {children}
    </AdminShell>
  );
}
