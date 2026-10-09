import { z } from "zod";

/**
 * Contact-form submission. Shared by the client form (react-hook-form)
 * and the `/api/contact` route handler so validation is identical.
 */
export const leadInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Please enter your name.")
    .max(120, "That name is a little long."),
  email: z.email("Please enter a valid email address."),
  company: z.string().trim().max(160, "Please shorten the company name."),
  services: z.array(z.string().max(80)).max(12),
  timeline: z.string().max(60),
  message: z
    .string()
    .trim()
    .min(20, "Tell us a little more — at least 20 characters.")
    .max(5000, "Please keep it under 5,000 characters."),
  /** Honeypot — real users never see or fill this field. */
  website: z.string().max(0),
});

export type LeadInput = z.infer<typeof leadInputSchema>;

export const leadStatusSchema = z.enum(["new", "contacted", "qualified", "won", "lost", "spam"]);

/** Stored lead (collection: `leads`). */
export const leadSchema = leadInputSchema.omit({ website: true }).extend({
  status: leadStatusSchema,
  source: z.string().max(300).optional(),
  userAgent: z.string().max(400).optional(),
  createdAt: z.iso.datetime(),
});

export type Lead = z.infer<typeof leadSchema>;
