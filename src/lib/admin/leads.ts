import "server-only";
import { createHash } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { LEADS_FILE, withLeadsLock } from "@/lib/leads/store";
import { leadStatusSchema } from "@/lib/schemas/lead";
import { AdminError } from "./store";
import type { LeadRow, LeadStatus } from "./types";

/* ─────────────────────────────────────────────────────────────
   The Leads screen: every contact-form enquiry, newest first,
   with a status to track it, deletion (privacy requests) and a
   CSV export. Reads the same store the contact form writes to
   (lib/leads/store.ts): MongoDB when MONGODB_URI is set, else
   .data/leads.ndjson.

   • File store: rewrites are atomic (temp file + rename) and share
     a lock with the form's appends. Lines that can't be read are
     kept exactly as they are.
   • Enquiries saved before ids existed get a stable one from
     their content.
   ───────────────────────────────────────────────────────────── */

type Raw = Record<string, unknown>;

/** More than a studio inbox needs; keeps the screen's payload bounded. */
const MAX_LEADS = 5000;

const isRecord = (value: unknown): value is Raw => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : typeof value === "string" ? value : "");

const inMongo = () => !!process.env.MONGODB_URI;

const notFound = () => new AdminError("This enquiry no longer exists. It may have been deleted in another tab.", { conflict: true });

function toRow(record: Raw, id: string): LeadRow {
  const status = leadStatusSchema.safeParse(record.status);
  const source = text(record.source, 300);
  const budget = text(record.budget, 80);
  const updatedAt = iso(record.updatedAt);
  return {
    id,
    name: text(record.name, 120) || "Unnamed",
    email: text(record.email, 254),
    company: text(record.company, 160),
    services: Array.isArray(record.services)
      ? record.services.filter((service): service is string => typeof service === "string").slice(0, 12)
      : [],
    timeline: text(record.timeline, 60),
    message: typeof record.message === "string" ? record.message.slice(0, 5000) : "",
    status: status.success ? status.data : "new",
    ...(source ? { source } : {}),
    ...(budget ? { budget } : {}),
    createdAt: iso(record.createdAt),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

const newestFirst = (a: LeadRow, b: LeadRow) => b.createdAt.localeCompare(a.createdAt);

/* ── File store (.data/leads.ndjson) ──────────────────────── */

interface Line {
  raw: string;
  record: Raw | null;
  id: string | null;
}

/** Enquiries saved before ids existed: an id from what they say, the same on every read. */
function legacyId(record: Raw): string {
  const basis = [record.createdAt, record.email, record.name, record.message].map((v) => (typeof v === "string" ? v : "")).join("\u0000");
  return `l-${createHash("sha256").update(basis).digest("hex").slice(0, 16)}`;
}

async function readLines(): Promise<Line[]> {
  let content: string;
  try {
    content = await readFile(LEADS_FILE, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const seen = new Map<string, number>();
  return content
    .split("\n")
    .filter((raw) => raw.trim() !== "")
    .map((raw) => {
      let record: Raw | null = null;
      try {
        const parsed: unknown = JSON.parse(raw);
        record = isRecord(parsed) ? parsed : null;
      } catch {
        record = null;
      }
      if (!record) return { raw, record: null, id: null };
      let id = typeof record.id === "string" && record.id ? record.id : legacyId(record);
      // Two identical old enquiries: the second gets a suffix (in file order, so it's stable too).
      const n = (seen.get(id) ?? 0) + 1;
      seen.set(id, n);
      if (n > 1) id = `${id}-${n}`;
      return { raw, record, id };
    });
}

async function writeLines(lines: Line[]): Promise<void> {
  const temp = `${LEADS_FILE}.${process.pid}-${Date.now()}.tmp`;
  const body = lines.map((line) => line.raw).join("\n");
  try {
    await writeFile(temp, body ? `${body}\n` : "", "utf8");
    await rename(temp, LEADS_FILE);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EROFS" || code === "EACCES" || code === "EPERM") {
      throw new AdminError("This server can't write to .data/leads.ndjson (read-only file system). Set MONGODB_URI to keep enquiries in MongoDB.");
    }
    throw error;
  }
}

/** Changes one enquiry in the file. `change` returns the new record, or null to delete it. */
function changeInFile(id: string, change: (record: Raw) => Raw | null): Promise<LeadRow | null> {
  return withLeadsLock(async () => {
    const lines = await readLines();
    const index = lines.findIndex((line) => line.id === id);
    const line = lines[index];
    if (!line?.record) throw notFound();
    const next = change(line.record);
    if (next === null) {
      lines.splice(index, 1);
      await writeLines(lines);
      return null;
    }
    lines[index] = { raw: JSON.stringify(next), record: next, id };
    await writeLines(lines);
    return toRow(next, id);
  });
}

/* ── MongoDB ──────────────────────────────────────────────── */

const OBJECT_ID = /^[a-f0-9]{24}$/i;

async function leadModel() {
  const [{ connectToDatabase }, { LeadModel }] = await Promise.all([import("@/lib/db/mongoose"), import("@/lib/models/lead")]);
  await connectToDatabase();
  return LeadModel;
}

/* ── API ──────────────────────────────────────────────────── */

/** Every enquiry, newest first. */
export async function listLeads(): Promise<LeadRow[]> {
  if (inMongo()) {
    const Lead = await leadModel();
    const docs = await Lead.find().sort({ createdAt: -1 }).limit(MAX_LEADS).lean();
    return docs.map((doc) => toRow(doc as unknown as Raw, String((doc as unknown as Raw)._id)));
  }
  const lines = await readLines();
  return lines
    .flatMap((line) => (line.record && line.id ? [toRow(line.record, line.id)] : []))
    .sort(newestFirst)
    .slice(0, MAX_LEADS);
}

/** Mongo filter for enquiries still new: saved before statuses existed counts too (as the screen shows them). */
const NEW_FILTER = { status: { $in: ["new", null] as Array<LeadStatus | null> } };

/** Enquiries still marked new (the sidebar badge). */
export async function countNewLeads(): Promise<number> {
  if (inMongo()) {
    const Lead = await leadModel();
    return Lead.countDocuments(NEW_FILTER);
  }
  const lines = await readLines();
  return lines.filter((line) => line.record && line.id && toRow(line.record, line.id).status === "new").length;
}

export interface LeadsSummary {
  total: number;
  /** Still marked new. */
  fresh: number;
  /** The newest few. */
  latest: LeadRow[];
}

/** The Overview card: how many enquiries, how many are new, and the latest few. */
export async function leadsSummary(limit = 3): Promise<LeadsSummary> {
  if (inMongo()) {
    const Lead = await leadModel();
    const [total, fresh, docs] = await Promise.all([
      Lead.estimatedDocumentCount(),
      Lead.countDocuments(NEW_FILTER),
      Lead.find().sort({ createdAt: -1 }).limit(limit).lean(),
    ]);
    return { total, fresh, latest: docs.map((doc) => toRow(doc as unknown as Raw, String((doc as unknown as Raw)._id))) };
  }
  const rows = await listLeads();
  return { total: rows.length, fresh: rows.filter((row) => row.status === "new").length, latest: rows.slice(0, limit) };
}

export async function setLeadStatus(id: string, status: LeadStatus): Promise<LeadRow> {
  if (inMongo()) {
    if (!OBJECT_ID.test(id)) throw notFound();
    const Lead = await leadModel();
    const doc = await Lead.findByIdAndUpdate(id, { status }, { new: true, runValidators: true }).lean();
    if (!doc) throw notFound();
    return toRow(doc as unknown as Raw, id);
  }
  const row = await changeInFile(id, (record) => ({ ...record, id, status, updatedAt: new Date().toISOString() }));
  if (!row) throw notFound();
  return row;
}

/** Removes an enquiry for good (privacy requests): it's deleted, not hidden. */
export async function deleteLead(id: string): Promise<void> {
  if (inMongo()) {
    if (!OBJECT_ID.test(id)) throw notFound();
    const Lead = await leadModel();
    const doc = await Lead.findByIdAndDelete(id).lean();
    if (!doc) throw notFound();
    return;
  }
  await changeInFile(id, () => null);
}

/* ── CSV export ───────────────────────────────────────────── */

/**
 * One cell. Text that a spreadsheet would run as a formula (=, +, -, @…)
 * gets a leading apostrophe: the messages come from the public form.
 */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** The enquiries as CSV (UTF-8 with a BOM, so Excel shows accents correctly). */
export function leadsCsv(rows: LeadRow[]): string {
  const header = ["Received", "Status", "Name", "Email", "Company", "Services", "Timeline", "Budget", "Message", "Sent from"];
  const lines = rows.map((row) =>
    [row.createdAt, row.status, row.name, row.email, row.company, row.services.join("; "), row.timeline, row.budget ?? "", row.message, row.source ?? ""]
      .map(cell)
      .join(","),
  );
  return `\uFEFF${[header.map(cell).join(","), ...lines].join("\r\n")}\r\n`;
}
