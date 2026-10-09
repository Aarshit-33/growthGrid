import { humanize } from "@/components/admin/form/schema-utils";

/* ─────────────────────────────────────────────────────────────
   Before/after comparison for History: which fields changed,
   and word-level highlights inside changed text. Pure functions,
   so the server renders them and anything can test them.
   ───────────────────────────────────────────────────────────── */

type Raw = Record<string, unknown>;

const isRecord = (value: unknown): value is Raw => !!value && typeof value === "object" && !Array.isArray(value);
const isPlain = (value: unknown) => value === null || typeof value !== "object";

/** Same JSON value (missing and null count as the same). */
export const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Every leaf value by path ("seo.title", "body[2].text"). A list of plain values (tags, scopes) is one leaf. */
export function flatten(value: unknown, path = "", out = new Map<string, unknown>()): Map<string, unknown> {
  if (Array.isArray(value)) {
    if (value.every(isPlain)) out.set(path, value);
    else value.forEach((child, i) => flatten(child, `${path}[${i}]`, out));
  } else if (isRecord(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0 && path) out.set(path, value);
    for (const key of keys) flatten(value[key], path ? `${path}.${key}` : key, out);
  } else if (value !== undefined) {
    out.set(path, value);
  }
  return out;
}

/** "seo.title" → "SEO › Title", "body[2].text" → "Body › #3 › Text". */
export function labelOf(path: string): string {
  const parts: string[] = [];
  for (const piece of path.split(".")) {
    const name = piece.replace(/\[\d+\]/g, "");
    if (name) parts.push(humanize(name));
    for (const match of piece.matchAll(/\[(\d+)\]/g)) parts.push(`#${Number(match[1]) + 1}`);
  }
  return parts.join(" › ") || "Value";
}

export interface FieldChange {
  path: string;
  label: string;
  /** undefined: the field wasn't there. */
  before?: unknown;
  after?: unknown;
}

/** The fields that differ, in the order the newer version lists them (removed fields last). */
export function fieldChanges(before: unknown, after: unknown): FieldChange[] {
  const a = before == null ? new Map<string, unknown>() : flatten(before);
  const b = after == null ? new Map<string, unknown>() : flatten(after);
  const paths = [...b.keys(), ...[...a.keys()].filter((path) => !b.has(path))];
  return paths
    .filter((path) => !sameValue(a.get(path), b.get(path)))
    .map((path) => ({ path, label: labelOf(path), before: a.get(path), after: b.get(path) }));
}

export const changedPaths = (before: unknown, after: unknown) => fieldChanges(before, after).map((change) => change.path);

/** "a, b and c". */
export function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** One line for a list: "Changed Title and Summary", "Changed SEO, Body and 3 more". */
export function summarizeChanges(paths: string[]): string {
  const fields = [...new Set(paths.map((path) => path.split(/[.[]/)[0]).filter(Boolean))].map(humanize);
  if (fields.length === 0) return "No visible changes";
  return `Changed ${fields.length <= 3 ? joinWords(fields) : `${fields.slice(0, 2).join(", ")} and ${fields.length - 2} more`}`;
}

/* ── Word-level highlights ────────────────────────────────── */

export interface DiffPart {
  kind: "same" | "add" | "del";
  text: string;
}

const tokenize = (text: string) => text.match(/\s+|[^\s]+/g) ?? [];

/** Beyond this many word pairs, a changed text is shown as replaced (keeps big pastes cheap). */
const MAX_CELLS = 160_000;

/** The difference between two texts, word by word (whitespace kept). */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const parts: DiffPart[] = [];
  const push = (kind: DiffPart["kind"], text: string) => {
    if (!text) return;
    const last = parts[parts.length - 1];
    if (last && last.kind === kind) last.text += text;
    else parts.push({ kind, text });
  };

  // Most edits touch a few words in the middle: match the common start and end first.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  push("same", a.slice(0, start).join(""));

  const x = a.slice(start, endA);
  const y = b.slice(start, endB);
  const n = x.length;
  const m = y.length;
  if (n * m > MAX_CELLS) {
    push("del", x.join(""));
    push("add", y.join(""));
  } else {
    // Longest common subsequence, then walk it.
    const width = m + 1;
    const table = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i * width + j] =
          x[i] === y[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (x[i] === y[j]) {
        push("same", x[i]);
        i++;
        j++;
      } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
        push("del", x[i++]);
      } else {
        push("add", y[j++]);
      }
    }
    while (i < n) push("del", x[i++]);
    while (j < m) push("add", y[j++]);
  }

  push("same", a.slice(endA).join(""));
  return parts;
}

/** A path to an image file ("/images/work/cover.jpg"), shown as a thumbnail. */
export const isImagePath = (value: unknown): value is string =>
  typeof value === "string" && /^(\/|https?:\/\/)\S+\.(png|jpe?g|webp|avif|gif|svg)(\?\S*)?$/i.test(value);
