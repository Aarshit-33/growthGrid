import { z } from "zod";
import {
  hexColorSchema,
  homeFlagSchema,
  iconNameSchema,
  metricSchema,
  publishedSchema,
  seoSchema,
  slugSchema,
} from "./common";

/** A service line, e.g. "Digital Products" (collection: `services`). */
export const serviceSchema = z.object({
  slug: slugSchema,
  order: z.number().int().nonnegative(),
  published: publishedSchema,
  home: homeFlagSchema,
  title: z.string().min(1),
  /** H1 on the detail page. Supports *emphasis*. */
  headline: z.string().min(1),
  /** Short descriptor, e.g. "SaaS · Web apps · Dashboards". */
  tagline: z.string().min(1),
  /** One or two sentences used on cards and in meta. */
  summary: z.string().min(20),
  /** Intro paragraphs for the detail page. */
  description: z.array(z.string().min(1)).min(1),
  icon: iconNameSchema,
  accent: hexColorSchema,
  outcomes: z.array(metricSchema).min(2).max(4),
  deliverables: z.array(z.string().min(1)).min(3),
  capabilities: z
    .array(z.object({ title: z.string().min(1), description: z.string().min(1) }))
    .min(2),
  approach: z
    .array(z.object({ title: z.string().min(1), description: z.string().min(1) }))
    .min(3),
  /** Technology slugs (see technologies.json). */
  technologies: z.array(slugSchema),
  /** Project slugs (see projects.json). */
  relatedProjects: z.array(slugSchema),
  keywords: z.array(z.string()).min(1),
  seo: seoSchema,
});

export type Service = z.infer<typeof serviceSchema>;
