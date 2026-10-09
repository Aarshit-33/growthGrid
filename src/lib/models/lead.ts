import { leadStatusSchema, type Lead } from "@/lib/schemas";
import { defineSchema, blank, defineModel } from "./_shared";

/**
 * Contact-form submissions (collection: `leads`).
 * Input is validated with `leadInputSchema` in the API route before it
 * reaches Mongoose; these validators are a second line of defence.
 */
const leadMongooseSchema = defineSchema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    company: { ...blank, trim: true, maxlength: 160 },
    services: { type: [{ type: String, maxlength: 80 }], default: [] },
    timeline: { ...blank, maxlength: 60 },
    message: { type: String, required: true, trim: true, minlength: 20, maxlength: 5000 },
    status: { type: String, required: true, enum: leadStatusSchema.options, default: "new" },
    source: { type: String, maxlength: 300 },
    userAgent: { type: String, maxlength: 400 },
  },
  { timestamps: true },
);

leadMongooseSchema.index({ createdAt: -1 });
leadMongooseSchema.index({ status: 1, createdAt: -1 });

export type LeadDocument = Omit<Lead, "createdAt"> & { createdAt: Date; updatedAt: Date };

export const LeadModel = defineModel<LeadDocument>("Lead", leadMongooseSchema, "leads");
