import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/shell";
import { requireSession } from "@/lib/admin/auth";
import { emptySnapshot, PAGE_KEYS } from "@/lib/admin/backend/shared";
import { countNewLeads } from "@/lib/admin/leads";
import { collectionStats } from "@/lib/admin/overview";
import { can } from "@/lib/admin/roles";
import { readSnapshot } from "@/lib/admin/store";
import { brandMark, resolveBrand } from "@/lib/brand";
import type { ContentSnapshot } from "@/lib/content/validate";
import { mongoConfigProblem, usesMongoContent } from "@/lib/db/uri";

/** The Leads badge never holds up a screen: a slow or unreachable store just shows none. */
function newLeadCount(): Promise<number> {
  const timeout = new Promise<number>((resolve) => setTimeout(resolve, 2500, 0));
  return Promise.race([countNewLeads().catch(() => 0), timeout]);
}

/**
 * The content, and anything about its store the owner should fix. With
 * MongoDB the frame still renders when the database is unreachable or
 * half-empty, so Sync (in the sidebar) stays within reach.
 */
async function loadContent(): Promise<{ snapshot: ContentSnapshot; notice: string | null }> {
  const mongo = usesMongoContent();
  const problem = mongo ? mongoConfigProblem() : null;
  if (problem) return { snapshot: emptySnapshot(), notice: `CONTENT_SOURCE=mongo, but ${problem}` };
  try {
    const snapshot = await readSnapshot();
    if (!mongo) return { snapshot, notice: null };
    const missing = [
      ...(snapshot.settings === undefined ? ["settings"] : []),
      ...PAGE_KEYS.filter((key) => snapshot.pages[key] === undefined).map((key) => `pages/${key}`),
    ];
    const notice = missing.length
      ? `MongoDB is missing ${missing.join(", ")}. An owner can use Sync content (sidebar) to create the missing documents from the bundled content.`
      : null;
    return { snapshot, notice };
  } catch (error) {
    if (!mongo) throw error;
    return { snapshot: emptySnapshot(), notice: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Every studio screen except the login. Pages check the session too
 * (layouts and pages render in parallel, so a layout alone can't guard them).
 */
export default async function PanelLayout({ children }: { children: ReactNode }) {
  const { config, user } = await requireSession();
  const [{ snapshot, notice }, newLeads] = await Promise.all([loadContent(), can(user.role, "leads") ? newLeadCount() : 0]);
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
      mongo={usesMongoContent()}
      notice={notice}
      user={user}
    >
      {children}
    </AdminShell>
  );
}
