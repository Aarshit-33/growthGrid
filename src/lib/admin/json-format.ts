/* ─────────────────────────────────────────────────────────────
   JSON formatter for admin saves.

   The content files are hand-formatted (Prettier-style): short
   arrays of words sit on one line, small objects such as
   `{ "type": "heading", "level": 2, "text": "…" }` too, everything
   else is expanded. Plain JSON.stringify would rewrite whole files
   on the first save, so this formatter learns the style of the
   file's current text, per key, and keeps it:

   • Values that didn't change keep exactly the layout they had.
   • Keys whose objects/arrays were all one-line stay one-line.
   • Keys that mixed both styles go one-line when it fits (100 cols).
   • Keys that were always expanded stay expanded.
   • New keys: arrays of plain values one-line when they fit, and
     small flat list items (`{ "id": "faq", "enabled": true }`) too;
     other objects expanded.
   • The file's final newline (or its absence) is kept.
   ───────────────────────────────────────────────────────────── */

const WIDTH = 100;
const INDENT = "  ";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

interface Tally {
  inline: number;
  total: number;
}
/** How the current file writes objects and arrays, per key context. */
export interface JsonStyle {
  objects: Map<string, Tally>;
  arrays: Map<string, Tally>;
  /** Flat objects/arrays (only plain values inside), as `inline()` prints them. */
  oneLine: Set<string>;
  expanded: Set<string>;
}

const emptyStyle = (): JsonStyle => ({ objects: new Map(), arrays: new Map(), oneLine: new Set(), expanded: new Set() });

type Mode = "always" | "fit" | "never" | "unknown";

/** Key context of a value: its property name, or `parent[]` for array items. */
const childContext = (parent: string, key: string | number) =>
  typeof key === "number" ? `${parent}[]` : key;

const isPrimitive = (value: unknown): value is null | boolean | number | string =>
  value === null || typeof value !== "object";

const isFlatObject = (value: unknown): boolean =>
  typeof value === "object" && value !== null && !Array.isArray(value) && Object.values(value).every(isPrimitive);

/** Read which objects/arrays the text writes on one line (a tiny JSON scanner). */
export function learnStyle(text: string): JsonStyle {
  const style = emptyStyle();
  let i = 0;

  const count = (map: Map<string, Tally>, context: string, inline: boolean) => {
    const entry = map.get(context) ?? { inline: 0, total: 0 };
    entry.total++;
    if (inline) entry.inline++;
    map.set(context, entry);
  };
  const skipWs = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
  };
  const readString = () => {
    const start = i;
    i++;
    while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    i++;
    return JSON.parse(text.slice(start, i)) as string;
  };
  /** Scans one value; returns whether it was an object/array. */
  const value = (context: string): boolean => {
    skipWs();
    const ch = text[i];
    if (ch === "{" || ch === "[") {
      const start = i;
      const close = ch === "{" ? "}" : "]";
      let index = 0;
      let nested = false;
      i++;
      for (;;) {
        skipWs();
        if (i >= text.length) throw new Error("Unterminated JSON");
        if (text[i] === close) break;
        if (ch === "{") {
          const key = readString();
          skipWs();
          i++; // colon
          nested = value(key) || nested;
        } else {
          nested = value(childContext(context, index++)) || nested;
        }
        skipWs();
        if (text[i] === ",") i++;
      }
      i++;
      const slice = text.slice(start, i);
      const oneLine = !slice.includes("\n");
      // Empty containers say nothing about style.
      if (index > 0 || ch === "{") count(ch === "{" ? style.objects : style.arrays, context, oneLine);
      if (!nested) (oneLine ? style.oneLine : style.expanded).add(inline(JSON.parse(slice) as Json));
      return true;
    }
    if (ch === '"') {
      readString();
    } else {
      while (i < text.length && !/[\s,\]}]/.test(text[i])) i++;
    }
    return false;
  };

  try {
    value("$");
  } catch {
    return emptyStyle();
  }
  return style;
}

function mode(map: Map<string, Tally>, context: string): Mode {
  const tally = map.get(context);
  if (!tally) return "unknown";
  if (tally.inline === tally.total) return "always";
  return tally.inline > 0 ? "fit" : "never";
}

function inline(value: Json): string {
  if (isPrimitive(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return value.length ? `[${value.map(inline).join(", ")}]` : "[]";
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  return entries.length ? `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(", ")} }` : "{}";
}

/**
 * Format `value` as JSON in the content files' style. Pass the file's current
 * text as `previous` to keep its layout (one-line objects stay one-line…).
 */
export function formatJson(value: unknown, previous?: string): string {
  const style = previous ? learnStyle(previous) : emptyStyle();
  /** Layout the file gave this exact flat value: true = one line, undefined = new or edited. */
  const written = (one: string) => (style.oneLine.has(one) ? true : style.expanded.has(one) ? false : undefined);

  /** `used`: columns already taken on the line (indent + key); `tail`: a trailing comma. */
  const format = (node: Json, context: string, depth: number, used: number, tail: number): string => {
    if (isPrimitive(node)) return JSON.stringify(node);
    const pad = INDENT.repeat(depth);
    const inner = INDENT.repeat(depth + 1);
    const fits = (text: string) => used + text.length + tail <= WIDTH;

    if (Array.isArray(node)) {
      if (node.length === 0) return "[]";
      const m = mode(style.arrays, context);
      const flat = node.every(isPrimitive) || node.every(isFlatObject);
      if (flat) {
        const one = inline(node);
        const oneLine = written(one) ?? (m !== "never" && (m !== "unknown" || node.every(isPrimitive)) && fits(one));
        if (oneLine) return one;
      }
      const items = node.map(
        (item, index) =>
          inner + format(item, childContext(context, index), depth + 1, inner.length, index < node.length - 1 ? 1 : 0),
      );
      return `[\n${items.join(",\n")}\n${pad}]`;
    }

    const entries = Object.entries(node).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return "{}";
    const m = mode(style.objects, context);
    if (isFlatObject(node)) {
      const one = inline(node);
      // "always" ignores width; "fit" goes one-line when it fits; a new key only for small list items (`key[]`).
      const allowed = m === "fit" || (m === "unknown" && context.endsWith("[]") && entries.length <= 3);
      const oneLine = written(one) ?? (m === "always" || (allowed && fits(one)));
      if (oneLine) return one;
    }
    const lines = entries.map(([key, v], index) => {
      const label = `${JSON.stringify(key)}: `;
      const tailComma = index < entries.length - 1 ? 1 : 0;
      return inner + label + format(v as Json, key, depth + 1, inner.length + label.length, tailComma);
    });
    return `{\n${lines.join(",\n")}\n${pad}}`;
  };

  // Round-trip first so `undefined` and non-JSON values drop exactly as JSON would.
  const data = JSON.parse(JSON.stringify(value)) as Json;
  const eol = previous && !previous.endsWith("\n") ? "" : "\n";
  return `${format(data, "$", 0, 0, 0)}${eol}`;
}
