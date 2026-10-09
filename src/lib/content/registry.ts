import type { ZodType } from "zod";
import {
  audienceSchema,
  faqSchema,
  insightSchema,
  principleSchema,
  problemSchema,
  processStepSchema,
  projectSchema,
  serviceSchema,
  statSchema,
  teamMemberSchema,
  technologyCategorySchema,
  testimonialSchema,
} from "@/lib/schemas";

/**
 * Every list-type content collection, with the Zod schema that validates it
 * and the field that uniquely identifies a document. Used by the repository,
 * the validation script and the MongoDB seed script, so adding a collection
 * here wires it up everywhere.
 */
export const collectionRegistry = {
  services: { schema: serviceSchema, key: "slug", file: "services.json" },
  projects: { schema: projectSchema, key: "slug", file: "projects.json" },
  insights: { schema: insightSchema, key: "slug", file: "insights.json" },
  testimonials: { schema: testimonialSchema, key: "id", file: "testimonials.json" },
  team: { schema: teamMemberSchema, key: "slug", file: "team.json" },
  faqs: { schema: faqSchema, key: "id", file: "faqs.json" },
  technologies: { schema: technologyCategorySchema, key: "key", file: "technologies.json" },
  process: { schema: processStepSchema, key: "slug", file: "process.json" },
  principles: { schema: principleSchema, key: "key", file: "principles.json" },
  audiences: { schema: audienceSchema, key: "key", file: "audiences.json" },
  problems: { schema: problemSchema, key: "key", file: "problems.json" },
  stats: { schema: statSchema, key: "key", file: "stats.json" },
} as const satisfies Record<string, { schema: ZodType; key: string; file: string }>;

export type CollectionName = keyof typeof collectionRegistry;

export const collectionNames = Object.keys(collectionRegistry) as CollectionName[];
