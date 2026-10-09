"use client";

import { createContext, useContext, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { FIELD_HINTS } from "@/lib/admin/meta";
import type { RefMap } from "@/lib/admin/types";
import { cn } from "@/lib/utils";
import { hintPath, parsePathKey } from "./schema-utils";

/* ─────────────────────────────────────────────────────────────
   What every field of a schema form can reach without props:
   the setter, reference choices, link suggestions and issues.
   ───────────────────────────────────────────────────────────── */

export interface FormApi {
  /** Set the value at a path key ("body.3.text"). `undefined` removes an optional field. */
  set: (at: string, value: unknown, order?: readonly string[]) => void;
  refs: RefMap;
  links: string[];
  /** Field problems from the last save, by path key. Cards holding one stay open. */
  issues: Map<string, string>;
}

export const FormContext = createContext<FormApi | null>(null);

export function useForm(): FormApi {
  const api = useContext(FormContext);
  if (!api) throw new Error("Schema fields must render inside <SchemaForm>.");
  return api;
}

/** Guidance for a field: by dot path first ("seo.title", "body[].text"), then by name. */
export function hintFor(at: string, name: string): string | undefined {
  return FIELD_HINTS[hintPath(parsePathKey(at))] ?? FIELD_HINTS[name];
}

export const LIST_ID = "admin-link-suggestions";

/** Label, control, hint and error for one field. */
export function FieldShell({
  id,
  label,
  required,
  hint,
  error,
  wide = false,
  aside,
  labelAsText = false,
  className,
  children,
}: {
  id: string;
  label: string;
  required: boolean;
  hint?: ReactNode;
  error?: string;
  /** Span both columns of the field grid. */
  wide?: boolean;
  /** Right side of the label row (counters, actions). */
  aside?: ReactNode;
  /** The control isn't a single input (lists, chips): label it by id instead of `for`. */
  labelAsText?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const labelClass = "text-[0.8rem] font-medium tracking-[-0.005em] text-dim";
  return (
    <div className={cn("min-w-0", wide && "sm:col-span-2", className)} data-field={id}>
      <div className="mb-2 flex min-h-5 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {labelAsText ? (
            <span id={`${id}-label`} className={labelClass}>
              {label}
            </span>
          ) : (
            <label htmlFor={id} className={labelClass}>
              {label}
            </label>
          )}
          {!required && (
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-faint/80">Optional</span>
          )}
        </div>
        {aside}
      </div>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1.5 text-[0.78rem] leading-snug text-danger">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-[0.76rem] leading-relaxed text-faint">
          {hint}
        </p>
      )}
    </div>
  );
}

/** aria-describedby for a control with optional hint / error lines. */
export const describedBy = (id: string, hint: unknown, error: unknown) =>
  [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
