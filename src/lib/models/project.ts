import type { Schema } from "mongoose";
import { projectSchema, type Project } from "@/lib/schemas";
import {
  defineSchema,
  blank,
  bool,
  defineModel,
  identifier,
  imageSchema,
  isoDate,
  metricSchema,
  nullableSlugRef,
  num,
  order,
  published,
  req,
  required,
  seoSchema,
  slugRefs,
  strings,
  sub,
  validateWithZod,
} from "./_shared";

/* ── Interactive showcase variants (single-nested discriminators on `type`) */

const showcaseOptions = { _id: false, id: false } as const;

const flowShowcase = defineSchema(
  {
    label: req,
    hint: req,
    runLabel: req,
    kpiLabels: strings,
    stages: {
      type: [sub({ label: req, time: req, title: req, copy: req, kpis: strings })],
      default: [],
    },
  },
  showcaseOptions,
);

const dashboardShowcase = defineSchema(
  {
    label: req,
    hint: req,
    days: strings,
    views: {
      type: [
        sub({
          label: req,
          unit: req,
          series: { type: [Number], default: [] },
          metrics: {
            type: [sub({ label: req, value: num, decimals: num, prefix: blank, suffix: blank, note: blank })],
            default: [],
          },
        }),
      ],
      default: [],
    },
  },
  showcaseOptions,
);

const triageShowcase = defineSchema(
  {
    label: req,
    hint: req,
    baseline: req,
    queries: {
      type: [
        sub({
          chip: req,
          query: req,
          category: req,
          context: req,
          route: req,
          confidence: { type: Number, required: true, min: 0, max: 100 },
          time: req,
        }),
      ],
      default: [],
    },
  },
  showcaseOptions,
);

const projectMongooseSchema = defineSchema(
  {
    slug: identifier,
    order,
    published,
    featured: bool,
    title: req,
    category: req,
    client: required(sub({ name: req, industry: req, region: req, anonymized: bool })),
    year: { type: Number, required: true, min: 2000, max: 2100 },
    duration: req,
    /** Service slugs. */
    services: slugRefs,
    summary: req,
    outcome: req,
    challenge: strings,
    approach: strings,
    solution: strings,
    highlights: strings,
    results: { type: [metricSchema], default: [] },
    cover: required(imageSchema),
    gallery: { type: [imageSchema], default: [] },
    showcase: {
      type: defineSchema({}, { _id: false, id: false, discriminatorKey: "type" }),
      default: null,
    },
    /** Technology slugs. */
    stack: slugRefs,
    /** Testimonial id. */
    testimonial: nullableSlugRef,
    publishedAt: isoDate,
    seo: required(seoSchema),
  },
  { timestamps: true },
);

const showcasePath = projectMongooseSchema.path("showcase") as unknown as Schema.Types.Subdocument;
showcasePath.discriminator("flow", flowShowcase);
showcasePath.discriminator("dashboard", dashboardShowcase);
showcasePath.discriminator("triage", triageShowcase);

projectMongooseSchema.index({ order: 1 });
projectMongooseSchema.index({ services: 1 });
validateWithZod(projectMongooseSchema, projectSchema, "Project");

export const ProjectModel = defineModel<Project>("Project", projectMongooseSchema, "projects");
