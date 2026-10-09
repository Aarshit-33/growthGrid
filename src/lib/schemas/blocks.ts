import { z } from "zod";
import { imageSchema, slugSchema } from "./common";

/**
 * Portable rich-content blocks used by insights (articles) and legal pages.
 * Inline text supports a tiny, safe markdown subset rendered by
 * `InlineText`: **bold**, *emphasis*, `code` and [links](https://…).
 */
export const blockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("heading"),
    level: z.union([z.literal(2), z.literal(3)]),
    text: z.string().min(1),
    /** Optional anchor id; generated from the text when omitted. */
    id: slugSchema.optional(),
  }),
  z.object({
    type: z.literal("paragraph"),
    text: z.string().min(1),
  }),
  z.object({
    type: z.literal("list"),
    style: z.enum(["bullet", "number"]),
    items: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    type: z.literal("quote"),
    text: z.string().min(1),
    cite: z.string().optional(),
  }),
  z.object({
    type: z.literal("callout"),
    tone: z.enum(["info", "tip", "warning"]),
    title: z.string().optional(),
    text: z.string().min(1),
  }),
  z.object({
    type: z.literal("code"),
    language: z.string().min(1),
    code: z.string().min(1),
    caption: z.string().optional(),
  }),
  z.object({
    type: z.literal("image"),
    image: imageSchema,
    caption: z.string().optional(),
  }),
  z.object({
    type: z.literal("divider"),
  }),
]);

export type Block = z.infer<typeof blockSchema>;
export type HeadingBlock = Extract<Block, { type: "heading" }>;
