import type { FieldIssue, JsonSchema, Path } from "@/lib/admin/types";

/* ─────────────────────────────────────────────────────────────
   Pure helpers behind the schema-driven forms: read the JSON
   Schema that z.toJSONSchema produced, build blank values, label
   fields, and update values immutably along a path.
   ───────────────────────────────────────────────────────────── */

export type Raw = Record<string, unknown>;

export const isRecord = (value: unknown): value is Raw =>
  !!value && typeof value === "object" && !Array.isArray(value);

/* ── Schema analysis ──────────────────────────────────────── */

export type Shape =
  | { kind: "string"; schema: JsonSchema; nullable: boolean }
  | { kind: "number"; schema: JsonSchema; integer: boolean; nullable: boolean }
  | { kind: "boolean"; nullable: boolean }
  | { kind: "enum"; options: (string | number | boolean)[]; nullable: boolean }
  | { kind: "const"; value: unknown }
  | { kind: "object"; schema: JsonSchema; nullable: boolean }
  | { kind: "array"; schema: JsonSchema; nullable: boolean }
  | { kind: "union"; variants: JsonSchema[]; discriminator: string; nullable: boolean }
  | { kind: "unknown"; nullable: boolean };

const shapes = new WeakMap<JsonSchema, Shape>();

const isNullSchema = (s: JsonSchema) => s.type === "null" || (s.const === null && s.type === undefined);

/** The property every variant pins with `const` (e.g. a block's `type`). */
function discriminatorOf(variants: JsonSchema[]): string | null {
  const first = variants[0]?.properties;
  if (!first) return null;
  for (const key of Object.keys(first)) {
    if (variants.every((v) => v.properties?.[key]?.const !== undefined)) return key;
  }
  return null;
}

function analyzeUncached(schema: JsonSchema, nullable = false): Shape {
  const choices = schema.anyOf ?? schema.oneOf;
  if (choices) {
    const solid = choices.filter((s) => !isNullSchema(s));
    const canBeNull = nullable || solid.length < choices.length;
    if (solid.length === 1) return analyzeUncached(solid[0], canBeNull);
    if (solid.length > 0 && solid.every((s) => s.const !== undefined && s.const !== null)) {
      return { kind: "enum", options: solid.map((s) => s.const as string | number | boolean), nullable: canBeNull };
    }
    const discriminator = discriminatorOf(solid);
    if (discriminator) return { kind: "union", variants: solid, discriminator, nullable: canBeNull };
    return { kind: "unknown", nullable: canBeNull };
  }

  let type = schema.type as JsonSchema["type"] | JsonSchema["type"][] | undefined;
  if (Array.isArray(type)) {
    const solid = type.filter((t) => t !== "null");
    nullable = nullable || solid.length < type.length;
    type = solid.length === 1 ? solid[0] : undefined;
  }

  if (schema.enum) {
    const options = schema.enum.filter((v): v is string | number | boolean => v !== null);
    return { kind: "enum", options, nullable: nullable || options.length < schema.enum.length };
  }
  if (schema.const !== undefined) return { kind: "const", value: schema.const };

  switch (type) {
    case "string":
      return { kind: "string", schema, nullable };
    case "number":
    case "integer":
      return { kind: "number", schema, integer: type === "integer", nullable };
    case "boolean":
      return { kind: "boolean", nullable };
    case "object":
      return { kind: "object", schema, nullable };
    case "array":
      return { kind: "array", schema, nullable };
    default:
      return { kind: "unknown", nullable };
  }
}

export function analyze(schema: JsonSchema): Shape {
  let shape = shapes.get(schema);
  if (!shape) {
    shape = analyzeUncached(schema);
    shapes.set(schema, shape);
  }
  return shape;
}

const keyOrders = new WeakMap<JsonSchema, readonly string[]>();

/** Property names in schema order (a stable array per schema, for memoised fields). */
export function keysOf(schema: JsonSchema): readonly string[] {
  let keys = keyOrders.get(schema);
  if (!keys) {
    keys = Object.keys(schema.properties ?? {});
    keyOrders.set(schema, keys);
  }
  return keys;
}

/** The variant of a union that a value belongs to. */
export function variantOf(shape: Extract<Shape, { kind: "union" }>, value: unknown): JsonSchema | undefined {
  if (!isRecord(value)) return undefined;
  return shape.variants.find((v) => v.properties?.[shape.discriminator]?.const === value[shape.discriminator]);
}

/** An object with src + alt (+ size): edited as an image. */
export function isImageSchema(schema: JsonSchema): boolean {
  const p = schema.properties;
  return !!p && "src" in p && "alt" in p;
}

/** A hex colour string. */
export const isColorSchema = (schema: JsonSchema) => !!schema.pattern?.includes("[0-9a-fA-F]{6}");

/** Text a `z.string().includes(…)` field must contain, from its pattern. */
export function requiredSnippet(schema: JsonSchema): string | null {
  if (schema.format !== "includes" || !schema.pattern) return null;
  return schema.pattern.replace(/\\(.)/g, "$1");
}

/* ── Blank values ─────────────────────────────────────────── */

const today = () => new Date().toISOString().slice(0, 10);

/** A blank value that has every required field (what "Add" creates). */
export function blankValue(schema: JsonSchema): unknown {
  if (schema.default !== undefined) return structuredClone(schema.default);
  const shape = analyze(schema);
  switch (shape.kind) {
    case "const":
      return shape.value;
    case "enum":
      return shape.nullable ? null : shape.options[0];
    case "union":
      return shape.nullable ? null : blankValue(shape.variants[0]);
    case "string":
      if (shape.nullable) return null;
      return shape.schema.format === "date" ? today() : isColorSchema(shape.schema) ? "#3ce49a" : "";
    case "number": {
      if (shape.nullable) return null;
      const s = shape.schema;
      if (s.minimum !== undefined) return s.minimum;
      if (s.exclusiveMinimum !== undefined) return shape.integer ? s.exclusiveMinimum + 1 : s.exclusiveMinimum + 0.1;
      return 0;
    }
    case "boolean":
      return false;
    case "object": {
      if (shape.nullable) return null;
      const out: Raw = {};
      const required = new Set(shape.schema.required ?? []);
      for (const [key, prop] of Object.entries(shape.schema.properties ?? {})) {
        if (required.has(key)) out[key] = blankValue(prop);
      }
      return out;
    }
    case "array": {
      if (shape.nullable) return null;
      const s = shape.schema;
      if (s.prefixItems) return s.prefixItems.map(blankValue);
      const min = s.minItems ?? 0;
      return s.items && min > 0 ? Array.from({ length: min }, () => blankValue(s.items as JsonSchema)) : [];
    }
    default:
      return null;
  }
}

/** Blank value for a schema that isn't null (for "Add …" on a nullable field). */
export function blankSolid(schema: JsonSchema): unknown {
  const choices = schema.anyOf ?? schema.oneOf;
  if (choices) {
    const solid = choices.filter((s) => !isNullSchema(s));
    if (solid.length === 1) return blankSolid(solid[0]);
    const shape = analyze(schema);
    if (shape.kind === "union") return blankValue(shape.variants[0]);
  }
  const shape = analyze(schema);
  if (shape.kind === "object") {
    const out: Raw = {};
    const required = new Set(shape.schema.required ?? []);
    for (const [key, prop] of Object.entries(shape.schema.properties ?? {})) {
      if (required.has(key)) out[key] = blankValue(prop);
    }
    return out;
  }
  if (shape.kind === "union") return blankValue(shape.variants[0]);
  if (shape.kind === "string") return "";
  return blankValue(schema);
}

/* ── Labels & hints ───────────────────────────────────────── */

const WORDS: Record<string, string> = {
  seo: "SEO",
  cta: "CTA",
  ctas: "CTAs",
  url: "URL",
  urls: "URLs",
  id: "ID",
  faq: "FAQ",
  faqs: "FAQs",
  kpi: "KPI",
  kpis: "KPIs",
  api: "API",
  ui: "UI",
  og: "OG",
  toc: "Contents",
};

const LABELS: Record<string, string> = {
  href: "Link",
  src: "Image path",
  alt: "Alt text",
  noIndex: "Hide from search engines",
  publishedAt: "Publish date",
  updatedAt: "Updated on",
  external: "Opens in a new tab",
  aftercare: "After launch",
  gaId: "Google Analytics ID",
  googleVerification: "Google verification code",
  bingVerification: "Bing verification code",
  discourageSearchEngines: "Hide the whole site from search engines",
  blockAiAnswers: "Block AI answer engines",
  blockAiTraining: "Block AI training crawlers",
  indexNowKey: "IndexNow key",
  themeColor: "Browser colour",
  mark: "Symbol",
  stacked: "Stacked logo",
  essentialMessage: "Message (analytics off)",
  acknowledge: "Button (analytics off)",
};

export function humanize(key: string): string {
  if (LABELS[key]) return LABELS[key];
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => WORDS[word.toLowerCase()] ?? word.toLowerCase());
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "body[].text" style path, for hints and refs (list indexes become []). */
export function hintPath(path: Path): string {
  let out = "";
  for (const part of path) {
    if (typeof part === "number") out += "[]";
    else out += out ? `.${part}` : part;
  }
  return out;
}

/* ── Paths ────────────────────────────────────────────────── */

export const pathKey = (path: Path) => path.join(".");

export const parsePathKey = (key: string): Path =>
  key === "" ? [] : key.split(".").map((part) => (/^\d+$/.test(part) ? Number(part) : part));

export const childKey = (key: string, part: string | number) => (key === "" ? String(part) : `${key}.${part}`);

/** DOM id of a field's input. */
export const fieldId = (key: string) => `f-${key.replace(/[^a-zA-Z0-9_-]/g, "-") || "root"}`;

/** Issues by path key ("body.3.text" → message). */
export function issueMap(issues: FieldIssue[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const issue of issues ?? []) {
    const key = pathKey(issue.path);
    if (!map.has(key)) map.set(key, issue.message);
  }
  return map;
}

/** Any issue at or below `key`. */
export function hasIssueWithin(issues: Map<string, string>, key: string): boolean {
  if (key === "") return issues.size > 0;
  for (const k of issues.keys()) if (k === key || k.startsWith(`${key}.`)) return true;
  return false;
}

/** Copy of `obj` with `key` added after the nearest earlier key in `order` (schema order). */
function insertKey(obj: Raw, key: string, value: unknown, order?: readonly string[]): Raw {
  const at = order?.indexOf(key) ?? -1;
  if (at === -1) return { ...obj, [key]: value };
  const entries = Object.entries(obj);
  let position = 0;
  entries.forEach(([k], i) => {
    const index = order!.indexOf(k);
    if (index !== -1 && index < at) position = i + 1;
  });
  entries.splice(position, 0, [key, value]);
  return Object.fromEntries(entries);
}

/**
 * Immutable set. `undefined` removes an object key (optional fields left
 * blank aren't written). `order` places a new key in schema order.
 */
export function setIn(root: unknown, path: Path, value: unknown, order?: readonly string[]): unknown {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  if (typeof head === "number") {
    const list = Array.isArray(root) ? [...root] : [];
    list[head] = setIn(list[head], rest, value, order);
    return list;
  }
  const obj = isRecord(root) ? root : {};
  const next = setIn(obj[head], rest, value, order);
  if (next === undefined) {
    if (!(head in obj)) return obj;
    const copy = { ...obj };
    delete copy[head];
    return copy;
  }
  if (head in obj) return { ...obj, [head]: next };
  return insertKey(obj, head, next, rest.length === 0 ? order : undefined);
}

export function getIn(root: unknown, path: Path): unknown {
  let node = root;
  for (const part of path) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string | number, unknown>)[part];
  }
  return node;
}

/** Stable JSON for dirty checks. */
export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/* ── Text heuristics ──────────────────────────────────────── */

const LONG_TEXT = new Set([
  "text",
  "answer",
  "paragraphs",
  "description",
  "solution",
  "challenge",
  "lede",
  "code",
  "quote",
  "excerpt",
  "message",
  "summary",
  "successMessage",
  "caption",
  "bio",
  "copy",
  "highlight",
  "takeaway",
  "rateLimited",
  "heading",
  "privacyNote",
  "errorMessage",
  "bestFor",
  "detail",
  "note",
  "approach",
  "items",
  "snapshotLede",
  "intro",
  "body",
  "outcome",
]);

/** Multi-line editor for prose fields and anything already long. */
export function isLongText(name: string, value: unknown, schema: JsonSchema): boolean {
  if (schema.format || isColorSchema(schema) || schema.pattern) return false;
  if (typeof value === "string" && (value.length > 80 || value.includes("\n"))) return true;
  return LONG_TEXT.has(name);
}

/** One-line summary of a list item, for its collapsed header. */
export function summarize(value: unknown, depth = 0): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return depth > 1 ? "" : value.map((v) => summarize(v, depth + 1)).filter(Boolean).join(", ");
  if (isRecord(value) && depth < 2) {
    const preferred = ["title", "label", "name", "heading", "question", "text", "value", "term", "src", "id", "key"];
    for (const key of preferred) {
      const s = summarize(value[key], depth + 1);
      if (s) return s;
    }
    for (const v of Object.values(value)) {
      if (typeof v === "string" && v) return v;
    }
  }
  return "";
}
