import "server-only";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { LeadInput } from "@/lib/schemas/lead";

/* ─────────────────────────────────────────────────────────────
   Lead persistence.
   • MONGODB_URI set → `leads` collection via LeadModel.
   • Otherwise      → one JSON object per line in .data/leads.ndjson
     (git-ignored), so the form works locally with zero setup.
   Mongoose is imported lazily so the file fallback never loads it.
   The Studio's Leads screen reads and updates them (lib/admin/leads.ts).
   ───────────────────────────────────────────────────────────── */

export const LEADS_FILE = join(process.cwd(), ".data", "leads.ndjson");

export type NewLead = Omit<LeadInput, "website"> & {
  source?: string;
  userAgent?: string;
};

const lock = globalThis as typeof globalThis & { __ggLeadsLock?: Promise<unknown> };

/**
 * Runs file changes one at a time, so an enquiry appended while the Studio
 * rewrites the file (a status change, a deletion) is never lost. Kept on
 * globalThis: the contact route and the Studio's actions are bundled
 * separately but share this process.
 */
export function withLeadsLock<T>(task: () => Promise<T>): Promise<T> {
  const run = (lock.__ggLeadsLock ?? Promise.resolve()).then(task, task);
  lock.__ggLeadsLock = run.catch(() => undefined);
  return run;
}

export async function saveLead(lead: NewLead): Promise<void> {
  if (process.env.MONGODB_URI) {
    const [{ connectToDatabase }, { LeadModel }] = await Promise.all([
      import("@/lib/db/mongoose"),
      import("@/lib/models/lead"),
    ]);
    await connectToDatabase();
    await LeadModel.create({ ...lead, status: "new" });
    return;
  }

  const record = { id: randomUUID(), ...lead, status: "new", createdAt: new Date().toISOString() };
  await withLeadsLock(async () => {
    await mkdir(dirname(LEADS_FILE), { recursive: true });
    await appendFile(LEADS_FILE, `${JSON.stringify(record)}\n`, "utf8");
  });
}
