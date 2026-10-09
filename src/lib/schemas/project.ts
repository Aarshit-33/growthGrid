import { z } from "zod";
import { imageSchema, isoDateSchema, metricSchema, publishedSchema, seoSchema, slugSchema } from "./common";

/* ─────────────────────────────────────────────────────────────
   Interactive "live snapshot" props shown with a case study.
   Each variant drives one client component in
   src/components/showcase/*.
   ───────────────────────────────────────────────────────────── */

const kpiTuple = z.tuple([z.string(), z.string(), z.string()]);

export const flowShowcaseSchema = z.object({
  type: z.literal("flow"),
  /** Window-bar label, e.g. "care-ops · live". */
  label: z.string().min(1),
  hint: z.string().min(1),
  runLabel: z.string().min(1),
  kpiLabels: kpiTuple,
  stages: z
    .array(
      z.object({
        label: z.string().min(1),
        time: z.string().min(1),
        title: z.string().min(1),
        copy: z.string().min(1),
        kpis: kpiTuple,
      }),
    )
    .min(2)
    .max(6),
});

export const dashboardShowcaseSchema = z
  .object({
    type: z.literal("dashboard"),
    label: z.string().min(1),
    hint: z.string().min(1),
    days: z.array(z.string().min(1)).min(4).max(12),
    views: z
      .array(
        z.object({
          label: z.string().min(1),
          unit: z.string().min(1),
          series: z.array(z.number().nonnegative()).min(4),
          metrics: z
            .array(
              z.object({
                label: z.string().min(1),
                value: z.number(),
                decimals: z.number().int().min(0).max(2),
                prefix: z.string(),
                suffix: z.string(),
                note: z.string(),
              }),
            )
            .length(3),
        }),
      )
      .min(1)
      .max(4),
  })
  .refine((d) => d.views.every((v) => v.series.length === d.days.length), {
    message: "Every dashboard view series must have one value per day label",
    path: ["views"],
  });

export const triageShowcaseSchema = z.object({
  type: z.literal("triage"),
  label: z.string().min(1),
  hint: z.string().min(1),
  /** Baseline shown after the answer time, e.g. "was ~4h". */
  baseline: z.string().min(1),
  queries: z
    .array(
      z.object({
        chip: z.string().min(1),
        query: z.string().min(1),
        category: z.string().min(1),
        context: z.string().min(1),
        route: z.string().min(1),
        confidence: z.number().min(0).max(100),
        time: z.string().min(1),
      }),
    )
    .min(1)
    .max(4),
});

export const showcaseSchema = z.discriminatedUnion("type", [
  flowShowcaseSchema,
  dashboardShowcaseSchema,
  triageShowcaseSchema,
]);

export type Showcase = z.infer<typeof showcaseSchema>;
export type FlowShowcase = z.infer<typeof flowShowcaseSchema>;
export type DashboardShowcase = z.infer<typeof dashboardShowcaseSchema>;
export type TriageShowcase = z.infer<typeof triageShowcaseSchema>;

/** A case study (collection: `projects`). */
export const projectSchema = z.object({
  slug: slugSchema,
  order: z.number().int().nonnegative(),
  published: publishedSchema,
  /** Shown in the home page's selected-work deck. */
  featured: z.boolean(),
  title: z.string().min(1),
  /** Short type label, e.g. "Healthcare platform". */
  category: z.string().min(1),
  client: z.object({
    name: z.string().min(1),
    industry: z.string().min(1),
    region: z.string().min(1),
    /** True when the client is described, not named (NDA). */
    anonymized: z.boolean(),
  }),
  year: z.number().int().min(2000).max(2100),
  duration: z.string().min(1),
  /** Service slugs. */
  services: z.array(slugSchema).min(1),
  summary: z.string().min(20),
  /** One-line narrative, e.g. "Problem → Platform → 60% less admin time". */
  outcome: z.string().min(1),
  challenge: z.array(z.string().min(1)).min(1),
  approach: z.array(z.string().min(1)).min(1),
  solution: z.array(z.string().min(1)).min(1),
  highlights: z.array(z.string().min(1)),
  results: z.array(metricSchema).min(2).max(4),
  cover: imageSchema,
  gallery: z.array(imageSchema),
  showcase: showcaseSchema.nullable(),
  /** Technology slugs. */
  stack: z.array(slugSchema),
  /** Testimonial id. */
  testimonial: slugSchema.nullable(),
  publishedAt: isoDateSchema,
  seo: seoSchema,
});

export type Project = z.infer<typeof projectSchema>;
