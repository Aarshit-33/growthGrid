import { z } from "zod";
import { blockSchema } from "./blocks";
import {
  homeFlagSchema,
  iconNameSchema,
  imageSchema,
  isoDateSchema,
  publishedSchema,
  seoSchema,
  slugSchema,
} from "./common";

/** An article / field note (collection: `insights`). */
export const insightSchema = z.object({
  slug: slugSchema,
  published: publishedSchema,
  home: homeFlagSchema,
  title: z.string().min(1),
  excerpt: z.string().min(40),
  category: z.object({
    key: slugSchema,
    label: z.string().min(1),
    /** Topic icon (e.g. on the home page's collapsed insight cards); a default is used when unset. */
    icon: iconNameSchema.optional(),
  }),
  tags: z.array(z.string().min(1)),
  /** Team member slug. */
  author: slugSchema,
  cover: imageSchema,
  publishedAt: isoDateSchema,
  updatedAt: isoDateSchema.optional(),
  featured: z.boolean(),
  takeaway: z.string().min(1),
  body: z.array(blockSchema).min(1),
  seo: seoSchema,
});

export type Insight = z.infer<typeof insightSchema>;

/** Insight enriched at read time (computed fields are never stored). */
export type InsightWithMeta = Insight & { readingTime: number };
