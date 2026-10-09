import { model, models, Schema, type Model, type SchemaDefinition, type SchemaOptions } from "mongoose";
import { z, type ZodType } from "zod";
import { ICON_NAMES, socialPlatformSchema } from "@/lib/schemas";

/* ─────────────────────────────────────────────────────────────
   Shared Mongoose building blocks.

   The Mongoose models mirror the Zod schemas in src/lib/schemas
   (the source of truth). Mongoose handles storage concerns —
   types, required fields, enums, indexes — while a pre-validate
   hook runs the full Zod schema, so a document can only be saved
   if the site would also accept it when reading.
   ───────────────────────────────────────────────────────────── */

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/* ── Field shorthands ─────────────────────────────────────── */

export const req = { type: String, required: true, trim: true };
export const opt = { type: String, trim: true };
/** String that may legitimately be empty (e.g. a metric prefix). */
export const blank = { type: String, default: "" };
export const nullableString = { type: String, default: null };
export const num = { type: Number, required: true };
export const bool = { type: Boolean, required: true };
export const optionalBool = { type: Boolean };
/** Admin show/hide switch on list items (missing = shown). Mirrors `publishedSchema`. */
export const published = optionalBool;
/** "On the home page" switch (missing = shown). Mirrors `homeFlagSchema`. */
export const homeFlag = optionalBool;
export const order = { type: Number, required: true, min: 0 };
export const strings = { type: [String], default: [] };
export const optionalStrings = { type: [String], default: undefined };
export const icon = { type: String, required: true, enum: ICON_NAMES };
export const optionalIcon = { type: String, enum: ICON_NAMES };
export const hexColor = { type: String, required: true, match: HEX_PATTERN };
export const isoDate = { type: String, required: true, match: ISO_DATE_PATTERN };
export const optionalIsoDate = { type: String, match: ISO_DATE_PATTERN };
export const slugRef = { type: String, required: true, match: SLUG_PATTERN };
export const nullableSlugRef = { type: String, default: null, match: SLUG_PATTERN };
export const slugRefs = { type: [{ type: String, match: SLUG_PATTERN }], default: [] };

/** Unique, indexed identifier field (slug / key / id). */
export const identifier = { type: String, required: true, unique: true, match: SLUG_PATTERN };

/* ── Schema factories ─────────────────────────────────────── */

/**
 * Passing `any` as RawDocType pins Mongoose's first generic, so every other
 * generic falls back to its default and nothing is inferred from the
 * definition literal.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Untyped = any;

/**
 * Create a Mongoose schema with Mongoose's type inference switched off.
 *
 * By default `new Schema({...})` infers a document type from the whole
 * definition literal. For definitions of this size that inference is so
 * expensive that `tsc` runs out of memory. Always build schemas through
 * this helper (or `sub`). Document types come from the Zod schemas via
 * `defineModel<T>`, so no type safety is lost.
 */
export function defineSchema(definition: SchemaDefinition, options?: SchemaOptions<Untyped>): Schema {
  return new Schema<Untyped>(definition, options);
}

/** Embedded schema without its own _id. */
export function sub(definition: SchemaDefinition): Schema {
  return defineSchema(definition, { _id: false, id: false });
}

/** Mark an embedded schema as required. */
export function required(schema: Schema) {
  return { type: schema, required: true };
}

/** Embedded schema whose listed fields are all required strings. */
export function requiredStrings(...fields: string[]): Schema {
  return sub(Object.fromEntries(fields.map((f) => [f, req])));
}

/* ── Shared embedded schemas (mirror src/lib/schemas/common.ts) */

export const linkSchema = sub({ label: req, href: req, external: optionalBool });

export const imageSchema = sub({ src: req, alt: req, width: num, height: num });

export const metricSchema = sub({ value: req, label: req });

export const seoSchema = sub({
  title: { ...req, minlength: 10, maxlength: 70 },
  description: { ...req, minlength: 50, maxlength: 170 },
  keywords: optionalStrings,
  noIndex: optionalBool,
});

export const sectionIntroFields = { eyebrow: req, heading: req, lede: opt };

/** Section intro (eyebrow + heading + optional lede), optionally extended. */
export function intro(extra: SchemaDefinition = {}): Schema {
  return sub({ ...sectionIntroFields, ...extra });
}

export const ctaBlockSchema = sub({
  eyebrow: req,
  heading: req,
  lede: req,
  primary: required(linkSchema),
  secondary: { type: linkSchema },
});

export const titleDescriptionSchema = sub({ title: req, description: req });

export const socialPlatform = { type: String, required: true, enum: socialPlatformSchema.options };

/* ── Rich-content blocks (mirror src/lib/schemas/blocks.ts) ── */

/** Base schema for a `body` array; call `attachBlockTypes` after adding it. */
export function blockArray() {
  return { type: [defineSchema({}, { _id: false, id: false, discriminatorKey: "type" })], default: [] };
}

/** Register every block type as an embedded discriminator on `schema.path`. */
export function attachBlockTypes(schema: Schema, path = "body"): void {
  const blocks = schema.path(path) as unknown as Schema.Types.DocumentArray;
  blocks.discriminator(
    "heading",
    sub({ level: { type: Number, required: true, enum: [2, 3] }, text: req, id: { type: String, match: SLUG_PATTERN } }),
  );
  blocks.discriminator("paragraph", sub({ text: req }));
  blocks.discriminator("list", sub({ style: { type: String, required: true, enum: ["bullet", "number"] }, items: strings }));
  blocks.discriminator("quote", sub({ text: req, cite: opt }));
  blocks.discriminator(
    "callout",
    sub({ tone: { type: String, required: true, enum: ["info", "tip", "warning"] }, title: opt, text: req }),
  );
  blocks.discriminator(
    "code",
    // Code is stored verbatim — never trimmed.
    sub({ language: req, code: { type: String, required: true }, caption: opt }),
  );
  blocks.discriminator("image", sub({ image: required(imageSchema), caption: opt }));
  blocks.discriminator("divider", sub({}));
}

/* ── Zod validation hook ──────────────────────────────────── */

export class ContentValidationError extends Error {
  constructor(label: string, details: string) {
    super(`${label} failed content validation:\n${details}`);
    this.name = "ContentValidationError";
  }
}

/** Run the canonical Zod schema before Mongoose saves a document. */
export function validateWithZod(schema: Schema, zodSchema: ZodType, label: string): Schema {
  schema.pre("validate", async function () {
    const plain = this.toObject({ versionKey: false, depopulate: true, virtuals: false });
    const result = zodSchema.safeParse(plain);
    if (!result.success) {
      throw new ContentValidationError(label, z.prettifyError(result.error));
    }
  });
  return schema;
}

/* ── Model factory (safe across Next.js hot reloads) ──────── */

/**
 * Compile (or reuse) a model typed with the Zod-derived document type `T`.
 * The model is compiled untyped and cast once through `unknown`. Calling
 * `model<T>()` would make TypeScript structurally compare `Schema` with
 * `Schema<T>`, which expands Mongoose's entire generic surface per model.
 */
export function defineModel<T>(name: string, schema: Schema, collection: string): Model<T> {
  const compiled = models[name] ?? model(name, schema, collection);
  return compiled as unknown as Model<T>;
}
