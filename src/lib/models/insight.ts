import { insightSchema, type Insight } from "@/lib/schemas";
import {
  defineSchema,
  attachBlockTypes,
  blockArray,
  bool,
  defineModel,
  identifier,
  imageSchema,
  isoDate,
  optionalIcon,
  optionalIsoDate,
  published,
  homeFlag,
  req,
  required,
  seoSchema,
  slugRef,
  strings,
  sub,
  validateWithZod,
} from "./_shared";

const insightMongooseSchema = defineSchema(
  {
    slug: identifier,
    published,
    home: homeFlag,
    title: req,
    excerpt: req,
    category: required(sub({ key: slugRef, label: req, icon: optionalIcon })),
    tags: strings,
    /** Team member slug. */
    author: slugRef,
    cover: required(imageSchema),
    publishedAt: isoDate,
    updatedAt: optionalIsoDate,
    featured: bool,
    takeaway: req,
    body: blockArray(),
    seo: required(seoSchema),
  },
  // `updatedAt` is editorial content here, so Mongoose's own timestamps use other names.
  { timestamps: { createdAt: "_createdAt", updatedAt: "_updatedAt" } },
);

attachBlockTypes(insightMongooseSchema);

insightMongooseSchema.index({ publishedAt: -1 });
insightMongooseSchema.index({ "category.key": 1 });
validateWithZod(insightMongooseSchema, insightSchema, "Insight");

export const InsightModel = defineModel<Insight>("Insight", insightMongooseSchema, "insights");
