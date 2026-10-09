"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useReducedMotionSafe } from "@/hooks/use-media-query";
import { leadFieldErrors } from "@/lib/leads/errors";
import type { ContactPage } from "@/lib/schemas";
import { leadInputSchema } from "@/lib/schemas/lead";
import { cn, interpolate } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────
   Project enquiry form.
   • Without JavaScript it's a plain POST to /api/contact, which
     redirects back to /contact#enquiry-sent | #enquiry-failed.
   • With JavaScript it validates with the same Zod schema as the
     API (identical copy via leadFieldErrors), posts JSON, and
     swaps to an in-place success state.
   ───────────────────────────────────────────────────────────── */

type Labels = ContactPage["form"];
type Status = "idle" | "submitting" | "success" | "error" | "rate-limited";

interface Values {
  name: string;
  email: string;
  company: string;
  services: string[];
  timeline: string;
  message: string;
  /** Honeypot. */
  website: string;
}

const EMPTY: Values = {
  name: "",
  email: "",
  company: "",
  services: [],
  timeline: "",
  message: "",
  website: "",
};

const MESSAGE_MAX = 5000;
const FIELD_ORDER = ["name", "email", "company", "services", "timeline", "message"] as const;
const fieldId = (field: string) => `contact-${field}`;
const errorId = (field: string) => `contact-${field}-error`;

/** Field errors for the visitor-facing fields (the honeypot is never validated client-side). */
function validate(values: Values, labels: Labels): Record<string, string> {
  const result = leadInputSchema.safeParse({ ...values, website: "" });
  return result.success ? {} : leadFieldErrors(result.error.issues, labels.errors);
}

const noopSubscribe = () => () => {};
const readSearch = () => window.location.search;
const serverSearch = () => "";

/**
 * The care plan a "Get a quote" link asked about (`/contact?plan=Growth`),
 * only if it's a plan we offer. Empty on the server and during hydration,
 * so the markup always matches; the client fills it in right after.
 */
function usePlanParam(plans: string[]): string | undefined {
  const search = useSyncExternalStore(noopSubscribe, readSearch, serverSearch);
  const wanted = new URLSearchParams(search).get("plan")?.trim().toLowerCase();
  return wanted ? plans.find((plan) => plan.toLowerCase() === wanted) : undefined;
}

const control =
  "block w-full rounded-xl border border-line bg-bg/50 px-4 py-3.5 text-ink placeholder:text-faint transition-[border-color,box-shadow,background-color] duration-300 hover:border-line-strong focus:border-em/70 focus:bg-bg/70 focus:outline-none focus:ring-4 focus:ring-em/15 aria-[invalid=true]:border-danger/70 aria-[invalid=true]:focus:ring-danger/15";

const chip =
  "group/chip relative inline-flex cursor-pointer select-none items-center gap-2.5 rounded-full border border-line bg-white/[0.02] py-2.5 pl-3 pr-4 text-[0.95rem] text-dim transition-[border-color,background-color,color] duration-300 hover:border-line-strong hover:text-ink has-[:checked]:border-em/60 has-[:checked]:bg-em/[0.08] has-[:checked]:text-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-em";

function FieldLabel({ htmlFor, children, optional }: { htmlFor: string; children: ReactNode; optional?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2.5 flex items-baseline justify-between gap-3 text-[0.95rem] font-medium text-ink">
      {children}
      {optional && <span className="label-mono text-faint">{optional}</span>}
    </label>
  );
}

function FieldError({ field, message }: { field: string; message?: string }) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.p
          id={errorId(field)}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25 }}
          className="overflow-hidden text-sm text-danger"
        >
          <span className="block pt-2">{message}</span>
        </motion.p>
      )}
    </AnimatePresence>
  );
}

function Legend({ children, optional }: { children: ReactNode; optional: string }) {
  return (
    <legend className="mb-3.5 flex w-full items-baseline justify-between gap-3 text-[0.95rem] font-medium text-ink">
      {children}
      <span className="label-mono text-faint">{optional}</span>
    </legend>
  );
}

/** Confirmation that replaces the form. Takes focus once it has actually mounted. */
function SuccessPanel({ labels, reduce, onReset }: { labels: Labels; reduce: boolean; onReset: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <>
      <span className="grid size-16 place-items-center rounded-full border border-em/40 bg-em/10 text-em shadow-[0_0_40px_-8px_rgb(60_228_154/0.7)]">
        <svg viewBox="0 0 24 24" className="size-7" fill="none" aria-hidden="true">
          <motion.path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: reduce ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.65, 0, 0.35, 1] }}
          />
        </svg>
      </span>
      <h2 ref={headingRef} tabIndex={-1} className="text-h2 mt-8 scroll-mt-32 text-ink focus:outline-none">
        {labels.successTitle}
      </h2>
      <p className="text-lede mt-4 max-w-xl">{labels.successMessage}</p>
      <Button variant="secondary" className="mt-10" onClick={onReset}>
        {labels.resetLabel}
      </Button>
    </>
  );
}

export function ContactForm({
  labels,
  services,
  plans = [],
  email,
  privacyNote,
}: {
  labels: Labels;
  /** Service titles offered as "What do you need help with?" chips. */
  services: string[];
  /** Care plan names a `?plan=` link may pre-write the message for. */
  plans?: string[];
  /** Studio email, offered as a fallback when sending fails. */
  email: string;
  /** Pre-rendered privacy note (inline markdown rendered on the server). */
  privacyNote: ReactNode;
}) {
  const reduce = useReducedMotionSafe();
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSummary, setShowSummary] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const summaryRef = useRef<HTMLDivElement>(null);
  const submitting = status === "submitting";

  // Arriving from a care plan's "Get a quote": the message starts out naming
  // the plan. It's a starting point, never an override: once the visitor
  // edits the message (or starts a new one) it's theirs.
  const plan = usePlanParam(plans);
  const [prefillDismissed, setPrefillDismissed] = useState(false);
  const prefill = plan && !prefillDismissed && values.message === "" ? interpolate(labels.planMessage, { plan }) : "";
  /** What the form shows, validates and sends. */
  const current: Values = prefill ? { ...values, message: prefill } : values;

  // Only surface errors for fields the visitor has already been told about,
  // so typing never triggers a wall of red — but fixes clear instantly.
  const revalidate = (next: Values, fields: string[]) => {
    const all = validate(next, labels);
    setErrors((prev) => {
      const updated = { ...prev };
      for (const field of fields) {
        if (all[field]) updated[field] = all[field];
        else delete updated[field];
      }
      return updated;
    });
  };

  const update = <K extends keyof Values>(key: K, value: Values[K]) => {
    const next = { ...values, [key]: value };
    setValues(next);
    if (errors[key]) revalidate(next, [key]);
    if (status === "error" || status === "rate-limited") setStatus("idle");
  };

  const onText = (key: "name" | "email" | "company" | "message" | "website") => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    update(key, e.target.value);

  const onMessage = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setPrefillDismissed(true);
    update("message", e.target.value);
  };

  const onBlur = (key: "name" | "email" | "company" | "message") => () => {
    // Validate a field once it's been filled in and left.
    if (current[key].trim() !== "" || errors[key]) revalidate(current, [key]);
  };

  const toggleService = (service: string) =>
    update(
      "services",
      values.services.includes(service) ? values.services.filter((s) => s !== service) : [...values.services, service],
    );

  const focusField = (field: string) => {
    const el = document.getElementById(fieldId(field)) ?? document.querySelector<HTMLElement>(`[name="${field}"]`);
    el?.focus();
    el?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const found = validate(current, labels);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setShowSummary(true);
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }

    setShowSummary(false);
    setStatus("submitting");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(current),
      });
      if (response.ok) {
        setStatus("success");
        return;
      }
      if (response.status === 429) {
        setStatus("rate-limited");
        return;
      }
      const data: unknown = await response.json().catch(() => null);
      const serverErrors =
        data && typeof data === "object" && "errors" in data ? (data as { errors: Record<string, string> }).errors : null;
      if (response.status === 400 && serverErrors && Object.keys(serverErrors).length > 0) {
        setErrors(serverErrors);
        setShowSummary(true);
        setStatus("idle");
        requestAnimationFrame(() => summaryRef.current?.focus());
        return;
      }
      setStatus("error");
    } catch {
      setStatus("error");
    }
  }

  function reset() {
    setValues(EMPTY);
    setPrefillDismissed(true);
    setErrors({});
    setShowSummary(false);
    setStatus("idle");
    requestAnimationFrame(() => document.getElementById(fieldId("name"))?.focus());
  }

  // "Brief completeness" rail across the top of the card (decorative).
  const checks = [
    values.name.trim().length >= 2,
    leadInputSchema.shape.email.safeParse(values.email).success,
    current.message.trim().length >= 20,
    values.services.length > 0,
    values.timeline !== "",
  ];
  const progress = status === "success" ? 1 : checks.filter(Boolean).length / checks.length;

  const orderedErrors = FIELD_ORDER.filter((field) => errors[field]).map((field) => [field, errors[field]] as const);
  const messageLength = current.message.length;
  const describedBy = (field: string) => (errors[field] ? errorId(field) : undefined);
  const fade = reduce
    ? { initial: false as const, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 16 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -12 },
      };

  return (
    <div className="card card-hover relative overflow-hidden">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-line">
        <div
          className={cn(
            "h-full origin-left bg-em transition-[transform,box-shadow] duration-700 ease-out-expo motion-reduce:transition-none",
            progress === 1 && "shadow-[0_0_14px_rgb(60_228_154/0.9)]",
          )}
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
      <div aria-hidden="true" className="blueprint fade-radial pointer-events-none absolute inset-0 opacity-30 [--grid-size:2.5rem]" />

      <AnimatePresence mode="wait" initial={false}>
        {status === "success" ? (
          <motion.div
            key="success"
            {...fade}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            role="status"
            className="relative flex min-h-[32rem] flex-col items-start justify-center p-6 sm:p-10 lg:p-12"
          >
            <SuccessPanel labels={labels} reduce={!!reduce} onReset={reset} />
          </motion.div>
        ) : (
          <motion.form
            key="form"
            {...fade}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            action="/api/contact"
            method="post"
            noValidate
            onSubmit={onSubmit}
            aria-labelledby="contact-form-heading"
            aria-busy={submitting}
            className="relative p-6 sm:p-10 lg:p-12"
          >
            <h2 id="contact-form-heading" className="text-h3 text-ink">
              {labels.heading}
            </h2>

            <AnimatePresence initial={false}>
              {showSummary && orderedErrors.length > 0 && (
                <motion.div
                  key="summary"
                  ref={summaryRef}
                  tabIndex={-1}
                  role="alert"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden focus:outline-none"
                >
                  <div className="mt-6 rounded-xl border border-danger/40 bg-danger/[0.07] p-5">
                    <p className="font-medium text-ink">{labels.errors.summary}</p>
                    <ul className="mt-3 space-y-1.5 text-sm">
                      {orderedErrors.map(([field, message]) => (
                        <li key={field}>
                          <a
                            href={`#${fieldId(field)}`}
                            onClick={(e) => {
                              e.preventDefault();
                              focusField(field);
                            }}
                            className="text-danger underline decoration-danger/40 underline-offset-4 hover:decoration-danger"
                          >
                            {message}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-9 grid gap-x-5 gap-y-7 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor={fieldId("name")}>{labels.nameLabel}</FieldLabel>
                <input
                  id={fieldId("name")}
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  maxLength={120}
                  placeholder={labels.namePlaceholder}
                  value={values.name}
                  onChange={onText("name")}
                  onBlur={onBlur("name")}
                  aria-invalid={errors.name ? true : undefined}
                  aria-describedby={describedBy("name")}
                  className={control}
                />
                <FieldError field="name" message={errors.name} />
              </div>
              <div>
                <FieldLabel htmlFor={fieldId("email")}>{labels.emailLabel}</FieldLabel>
                <input
                  id={fieldId("email")}
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  placeholder={labels.emailPlaceholder}
                  value={values.email}
                  onChange={onText("email")}
                  onBlur={onBlur("email")}
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={describedBy("email")}
                  className={control}
                />
                <FieldError field="email" message={errors.email} />
              </div>
              <div className="sm:col-span-2">
                <FieldLabel htmlFor={fieldId("company")} optional={labels.optionalLabel}>
                  {labels.companyLabel}
                </FieldLabel>
                <input
                  id={fieldId("company")}
                  name="company"
                  type="text"
                  autoComplete="organization"
                  maxLength={160}
                  placeholder={labels.companyPlaceholder}
                  value={values.company}
                  onChange={onText("company")}
                  onBlur={onBlur("company")}
                  aria-invalid={errors.company ? true : undefined}
                  aria-describedby={describedBy("company")}
                  className={control}
                />
                <FieldError field="company" message={errors.company} />
              </div>
            </div>

            <fieldset className="mt-9">
              <Legend optional={labels.optionalLabel}>{labels.servicesLabel}</Legend>
              <div className="flex flex-wrap gap-2.5">
                {services.map((service) => (
                  <label key={service} className={chip}>
                    <input
                      type="checkbox"
                      name="services"
                      value={service}
                      checked={values.services.includes(service)}
                      onChange={() => toggleService(service)}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className="grid size-[1.125rem] place-items-center rounded-[0.35rem] border border-line-strong transition-colors duration-300 group-has-[:checked]/chip:border-em group-has-[:checked]/chip:bg-em"
                    >
                      <Check className="size-3 text-bg opacity-0 transition-opacity duration-200 group-has-[:checked]/chip:opacity-100" strokeWidth={3} />
                    </span>
                    {service}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-9">
              <Legend optional={labels.optionalLabel}>{labels.timelineLabel}</Legend>
              <div className="flex flex-wrap gap-2.5">
                {labels.timelineOptions.map((option) => (
                  <label key={option} className={chip}>
                    <input
                      type="radio"
                      name="timeline"
                      value={option}
                      checked={values.timeline === option}
                      onChange={() => update("timeline", option)}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className="grid size-[1.125rem] place-items-center rounded-full border border-line-strong transition-colors duration-300 group-has-[:checked]/chip:border-em"
                    >
                      <span className="size-2 scale-0 rounded-full bg-em transition-transform duration-300 ease-out-expo group-has-[:checked]/chip:scale-100" />
                    </span>
                    {option}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="mt-9">
              <FieldLabel htmlFor={fieldId("message")}>{labels.messageLabel}</FieldLabel>
              <div className="relative">
                <textarea
                  id={fieldId("message")}
                  name="message"
                  required
                  rows={6}
                  maxLength={MESSAGE_MAX}
                  placeholder={labels.messagePlaceholder}
                  value={current.message}
                  onChange={onMessage}
                  onBlur={onBlur("message")}
                  aria-invalid={errors.message ? true : undefined}
                  aria-describedby={describedBy("message")}
                  className={cn(control, "min-h-44 resize-y pb-9 leading-relaxed")}
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute bottom-3 right-4 font-mono text-[0.68rem] tabular-nums transition-colors",
                    messageLength > MESSAGE_MAX * 0.9 ? "text-warn" : "text-faint",
                  )}
                >
                  {messageLength.toLocaleString("en-US")} / {MESSAGE_MAX.toLocaleString("en-US")}
                </span>
              </div>
              <FieldError field="message" message={errors.message} />
            </div>

            {/* Honeypot: hidden from people and assistive tech; bots fill it in. */}
            <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden">
              <label htmlFor={fieldId("website")}>{labels.honeypotLabel}</label>
              <input
                id={fieldId("website")}
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={values.website}
                onChange={onText("website")}
              />
            </div>

            <AnimatePresence initial={false}>
              {(status === "error" || status === "rate-limited") && (
                <motion.div
                  key="send-error"
                  role="alert"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <p className="mt-8 rounded-xl border border-danger/40 bg-danger/[0.07] p-5 text-[0.95rem] text-ink">
                    {status === "rate-limited" ? labels.errors.rateLimited : labels.errorMessage}{" "}
                    <a href={`mailto:${email}`} className="font-medium text-em underline decoration-em/40 underline-offset-4 hover:text-hot">
                      {email}
                    </a>
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-10 flex flex-col gap-6 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-sm text-sm text-muted [&_a]:text-dim [&_a]:underline [&_a]:decoration-line-strong [&_a]:underline-offset-4 hover:[&_a]:text-ink">
                {privacyNote}
              </p>
              <Button type="submit" size="lg" disabled={submitting} className="w-full shrink-0 sm:w-auto">
                {submitting ? labels.submittingLabel : labels.submitLabel}
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
