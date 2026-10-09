import { z } from "zod";
import {
  hexColorSchema,
  homeFlagSchema,
  iconNameSchema,
  imageSchema,
  publishedSchema,
  slugSchema,
  socialPlatformSchema,
} from "./common";

/* ─────────────────────────────────────────────────────────────
   Smaller content collections.
   ───────────────────────────────────────────────────────────── */

/** collection: `testimonials` */
export const testimonialSchema = z.object({
  id: slugSchema,
  published: publishedSchema,
  quote: z.string().min(20),
  author: z.string().min(1),
  role: z.string().min(1),
  company: z.string().min(1),
  /** Project slug this quote relates to. */
  project: slugSchema.nullable(),
  featured: z.boolean(),
});
export type Testimonial = z.infer<typeof testimonialSchema>;

/** collection: `team` */
export const teamMemberSchema = z.object({
  slug: slugSchema,
  order: z.number().int().nonnegative(),
  published: publishedSchema,
  name: z.string().min(1),
  role: z.string().min(1),
  bio: z.string().min(1),
  focus: z.array(z.string().min(1)).min(1),
  avatar: imageSchema.nullable(),
  socials: z.array(z.object({ platform: socialPlatformSchema, url: z.url() })),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

/**
 * collection: `faqs`
 * `scopes` decide where a question appears: "home", "services", "contact",
 * "about", or a specific service page via "service:<slug>".
 */
export const faqScopeSchema = z
  .string()
  .regex(
    /^(home|services|contact|about|service:[a-z0-9]+(?:-[a-z0-9]+)*)$/,
    'Scope must be home | services | contact | about | "service:<slug>"',
  );
export const faqSchema = z.object({
  id: slugSchema,
  order: z.number().int().nonnegative(),
  published: publishedSchema,
  question: z.string().min(5),
  answer: z.string().min(20),
  scopes: z.array(faqScopeSchema).min(1),
});
export type Faq = z.infer<typeof faqSchema>;

/** collection: `technologies` — one document per orbit / category. */
export const technologySchema = z.object({
  slug: slugSchema,
  published: publishedSchema,
  name: z.string().min(1),
  /** 1–4 character label drawn on the planet. */
  short: z.string().min(1).max(4),
  description: z.string().min(1),
});
export const technologyCategorySchema = z.object({
  key: slugSchema,
  order: z.number().int().nonnegative(),
  published: publishedSchema,
  name: z.string().min(1),
  color: hexColorSchema,
  description: z.string().min(1),
  technologies: z.array(technologySchema).min(1),
});
export type Technology = z.infer<typeof technologySchema>;
export type TechnologyCategory = z.infer<typeof technologyCategorySchema>;

/** collection: `process_steps` */
export const processStepSchema = z.object({
  slug: slugSchema,
  order: z.number().int().nonnegative(),
  published: publishedSchema,
  home: homeFlagSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  tags: z.array(z.string().min(1)).min(1),
  duration: z.string().min(1),
  deliverables: z.array(z.string().min(1)).min(1),
});
export type ProcessStep = z.infer<typeof processStepSchema>;

/** collection: `principles` */
export const principleSchema = z.object({
  key: slugSchema,
  order: z.number().int().nonnegative(),
  published: publishedSchema,
  home: homeFlagSchema,
  /** Short uppercase label, e.g. "Focus". */
  label: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  instrument: z.object({
    name: z.string().min(1),
    shape: z.enum(["prism", "lattice", "runway", "rings"]),
  }),
});
export type Principle = z.infer<typeof principleSchema>;

/** collection: `audiences` */
export const audienceSchema = z.object({
  key: slugSchema,
  order: z.number().int().nonnegative(),
  published: publishedSchema,
  tab: z.object({ title: z.string().min(1), subtitle: z.string().min(1) }),
  label: z.string().min(1),
  title: z.string().min(1),
  copy: z.string().min(1),
  steps: z
    .array(z.object({ label: z.string().min(1), text: z.string().min(1) }))
    .length(3),
  outcome: z.object({ title: z.string().min(1), detail: z.string().min(1) }),
});
export type Audience = z.infer<typeof audienceSchema>;

/** collection: `problems` */
export const problemSchema = z.object({
  key: slugSchema,
  order: z.number().int().nonnegative(),
  published: publishedSchema,
  icon: iconNameSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  /** Index of the node lit up in the system-monitor visual (0–9). */
  node: z.number().int().min(0).max(9),
});
export type Problem = z.infer<typeof problemSchema>;

/** collection: `stats` */
export const statSchema = z.object({
  key: slugSchema,
  order: z.number().int().nonnegative(),
  published: publishedSchema,
  home: homeFlagSchema,
  value: z.number(),
  decimals: z.number().int().min(0).max(2),
  prefix: z.string(),
  suffix: z.string(),
  label: z.string().min(1),
});
export type Stat = z.infer<typeof statSchema>;
