import {
  audienceSchema,
  faqSchema,
  principleSchema,
  problemSchema,
  processStepSchema,
  statSchema,
  teamMemberSchema,
  technologyCategorySchema,
  testimonialSchema,
  type Audience,
  type Faq,
  type Principle,
  type Problem,
  type ProcessStep,
  type Stat,
  type TeamMember,
  type TechnologyCategory,
  type Testimonial,
} from "@/lib/schemas";
import {
  defineSchema,
  blank,
  bool,
  defineModel,
  hexColor,
  icon,
  identifier,
  imageSchema,
  nullableSlugRef,
  num,
  order,
  published,
  homeFlag,
  req,
  required,
  SLUG_PATTERN,
  socialPlatform,
  strings,
  sub,
  validateWithZod,
} from "./_shared";

/* Mirrors src/lib/schemas/collections.ts — one model per collection. */

const timestamps = { timestamps: true } as const;
/** Schemas with a content field literally named `id` must disable Mongoose's `id` virtual. */
const withIdField = { timestamps: true, id: false } as const;

/* ── testimonials ─────────────────────────────────────────── */

const testimonialMongooseSchema = defineSchema(
  {
    id: identifier,
    published,
    quote: req,
    author: req,
    role: req,
    company: req,
    /** Project slug this quote relates to. */
    project: nullableSlugRef,
    featured: bool,
  },
  withIdField,
);
validateWithZod(testimonialMongooseSchema, testimonialSchema, "Testimonial");
export const TestimonialModel = defineModel<Testimonial>(
  "Testimonial",
  testimonialMongooseSchema,
  "testimonials",
);

/* ── team ─────────────────────────────────────────────────── */

const teamMemberMongooseSchema = defineSchema(
  {
    slug: identifier,
    order,
    published,
    name: req,
    role: req,
    bio: req,
    focus: strings,
    avatar: { type: imageSchema, default: null },
    socials: { type: [sub({ platform: socialPlatform, url: req })], default: [] },
  },
  timestamps,
);
teamMemberMongooseSchema.index({ order: 1 });
validateWithZod(teamMemberMongooseSchema, teamMemberSchema, "Team member");
export const TeamMemberModel = defineModel<TeamMember>("TeamMember", teamMemberMongooseSchema, "team");

/* ── faqs ─────────────────────────────────────────────────── */

const FAQ_SCOPE_PATTERN = /^(home|services|contact|about|service:[a-z0-9]+(?:-[a-z0-9]+)*)$/;

const faqMongooseSchema = defineSchema(
  {
    id: identifier,
    order,
    published,
    question: req,
    answer: req,
    /** "home" | "services" | "contact" | "about" | "service:<slug>" */
    scopes: { type: [{ type: String, match: FAQ_SCOPE_PATTERN }], default: [] },
  },
  withIdField,
);
faqMongooseSchema.index({ scopes: 1, order: 1 });
validateWithZod(faqMongooseSchema, faqSchema, "FAQ");
export const FaqModel = defineModel<Faq>("Faq", faqMongooseSchema, "faqs");

/* ── technologies (one document per category / orbit) ─────── */

const technologyCategoryMongooseSchema = defineSchema(
  {
    key: identifier,
    order,
    published,
    name: req,
    color: hexColor,
    description: req,
    technologies: {
      type: [
        sub({
          slug: { type: String, required: true, match: SLUG_PATTERN },
          published,
          name: req,
          short: { ...req, maxlength: 4 },
          description: req,
        }),
      ],
      default: [],
    },
  },
  timestamps,
);
technologyCategoryMongooseSchema.index({ "technologies.slug": 1 });
validateWithZod(technologyCategoryMongooseSchema, technologyCategorySchema, "Technology category");
export const TechnologyCategoryModel = defineModel<TechnologyCategory>(
  "TechnologyCategory",
  technologyCategoryMongooseSchema,
  "technologies",
);

/* ── process_steps ────────────────────────────────────────── */

const processStepMongooseSchema = defineSchema(
  {
    slug: identifier,
    order,
    published,
    home: homeFlag,
    title: req,
    summary: req,
    tags: strings,
    duration: req,
    deliverables: strings,
  },
  timestamps,
);
validateWithZod(processStepMongooseSchema, processStepSchema, "Process step");
export const ProcessStepModel = defineModel<ProcessStep>(
  "ProcessStep",
  processStepMongooseSchema,
  "process_steps",
);

/* ── principles ───────────────────────────────────────────── */

const principleMongooseSchema = defineSchema(
  {
    key: identifier,
    order,
    published,
    home: homeFlag,
    label: req,
    title: req,
    summary: req,
    instrument: required(
      sub({ name: req, shape: { type: String, required: true, enum: ["prism", "lattice", "runway", "rings"] } }),
    ),
  },
  timestamps,
);
validateWithZod(principleMongooseSchema, principleSchema, "Principle");
export const PrincipleModel = defineModel<Principle>("Principle", principleMongooseSchema, "principles");

/* ── audiences ────────────────────────────────────────────── */

const audienceMongooseSchema = defineSchema(
  {
    key: identifier,
    order,
    published,
    tab: required(sub({ title: req, subtitle: req })),
    label: req,
    title: req,
    copy: req,
    steps: { type: [sub({ label: req, text: req })], default: [] },
    outcome: required(sub({ title: req, detail: req })),
  },
  timestamps,
);
validateWithZod(audienceMongooseSchema, audienceSchema, "Audience");
export const AudienceModel = defineModel<Audience>("Audience", audienceMongooseSchema, "audiences");

/* ── problems ─────────────────────────────────────────────── */

const problemMongooseSchema = defineSchema(
  {
    key: identifier,
    order,
    published,
    icon,
    title: req,
    description: req,
    /** Node lit up in the system-monitor visual (0–9). */
    node: { type: Number, required: true, min: 0, max: 9 },
  },
  timestamps,
);
validateWithZod(problemMongooseSchema, problemSchema, "Problem");
export const ProblemModel = defineModel<Problem>("Problem", problemMongooseSchema, "problems");

/* ── stats ────────────────────────────────────────────────── */

const statMongooseSchema = defineSchema(
  {
    key: identifier,
    order,
    published,
    home: homeFlag,
    value: num,
    decimals: { type: Number, required: true, min: 0, max: 2 },
    prefix: blank,
    suffix: blank,
    label: req,
  },
  timestamps,
);
validateWithZod(statMongooseSchema, statSchema, "Stat");
export const StatModel = defineModel<Stat>("Stat", statMongooseSchema, "stats");
