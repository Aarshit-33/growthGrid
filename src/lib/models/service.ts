import { serviceSchema, type Service } from "@/lib/schemas";
import {
  defineSchema,
  defineModel,
  hexColor,
  icon,
  identifier,
  metricSchema,
  order,
  published,
  homeFlag,
  req,
  required,
  seoSchema,
  slugRefs,
  strings,
  titleDescriptionSchema,
  validateWithZod,
} from "./_shared";

const serviceMongooseSchema = defineSchema(
  {
    slug: identifier,
    order,
    published,
    home: homeFlag,
    title: req,
    headline: req,
    tagline: req,
    summary: req,
    description: strings,
    icon,
    accent: hexColor,
    outcomes: { type: [metricSchema], default: [] },
    deliverables: strings,
    capabilities: { type: [titleDescriptionSchema], default: [] },
    approach: { type: [titleDescriptionSchema], default: [] },
    /** Technology slugs. */
    technologies: slugRefs,
    /** Project slugs. */
    relatedProjects: slugRefs,
    keywords: strings,
    seo: required(seoSchema),
  },
  { timestamps: true },
);

serviceMongooseSchema.index({ order: 1 });
validateWithZod(serviceMongooseSchema, serviceSchema, "Service");

export const ServiceModel = defineModel<Service>("Service", serviceMongooseSchema, "services");
