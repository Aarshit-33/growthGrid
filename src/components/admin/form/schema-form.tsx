"use client";

import { useCallback, useMemo } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { FormContext as FormDefinition, JsonSchema } from "@/lib/admin/types";
import { Badge, Panel } from "../ui";
import { FormContext, hintFor, LIST_ID, type FormApi } from "./context";
import { Field } from "./fields";
import { analyze, childKey, hasIssueWithin, humanize, isRecord, keysOf, parsePathKey, setIn, type Raw } from "./schema-utils";

/* ─────────────────────────────────────────────────────────────
   <SchemaForm>: a complete editor for one document, generated
   from its JSON Schema. Simple fields share a "Details" panel;
   each object or list gets a panel of its own. A focused form
   lays out one object of the document the same way.
   ───────────────────────────────────────────────────────────── */

export interface FormSection {
  /** DOM id of the panel (for the "On this page" nav). */
  id: string;
  label: string;
  /** Under the title (default: the field's hint). */
  description?: string;
  /** Path keys of the fields it holds ("hero", "aftercare.plans"). */
  keys: string[];
  details: boolean;
}

/** Objects, card lists and unions get their own panel. */
function isComplex(schema: JsonSchema): boolean {
  const shape = analyze(schema);
  if (shape.kind === "object" || shape.kind === "union" || shape.kind === "unknown") return true;
  if (shape.kind !== "array") return false;
  const item = shape.schema.items ? analyze(shape.schema.items) : null;
  return !!item && (item.kind === "object" || item.kind === "union");
}

const sectionId = (key: string) => `sec-${key.replace(/\./g, "-")}`;

/** The panels for one object's fields. `at`: its path key ("" for the whole document). */
function sectionsOf(schema: JsonSchema, at: string, hidden: readonly string[], panels: FormDefinition["panels"] = {}): FormSection[] {
  const own = panels[at];
  const details: FormSection = {
    id: at ? sectionId(at) : "sec-details",
    label: own?.label ?? "Details",
    description: own?.description,
    keys: [],
    details: true,
  };
  const out: FormSection[] = [];
  for (const name of keysOf(schema)) {
    if (hidden.includes(name)) continue;
    const prop = (schema.properties as Record<string, JsonSchema>)[name];
    if (analyze(prop).kind === "const") continue;
    const key = childKey(at, name);
    if (isComplex(prop)) {
      out.push({ id: sectionId(key), label: panels[key]?.label ?? humanize(name), description: panels[key]?.description, keys: [key], details: false });
    } else details.keys.push(key);
  }
  return details.keys.length > 0 ? [details, ...out] : out;
}

export function formSections(form: Pick<FormDefinition, "schema" | "hidden" | "focus" | "panels">): FormSection[] {
  if (form.focus) {
    const prop = form.schema.properties?.[form.focus];
    const shape = prop ? analyze(prop) : null;
    if (shape?.kind === "object") return sectionsOf(shape.schema, form.focus, [], form.panels);
  }
  return sectionsOf(form.schema, "", form.hidden, form.panels);
}

/** The field at a path key ("aftercare.plans"): its schema and value, and its place in its parent. */
function locate(schema: JsonSchema, doc: Raw, key: string) {
  const path = key.split(".");
  const name = path[path.length - 1];
  let parent = schema;
  let holder: unknown = doc;
  for (const part of path.slice(0, -1)) {
    const prop = parent.properties?.[part];
    const shape = prop ? analyze(prop) : null;
    parent = shape?.kind === "object" ? shape.schema : {};
    holder = isRecord(holder) ? holder[part] : undefined;
  }
  return {
    schema: parent.properties?.[name] ?? {},
    value: isRecord(holder) ? holder[name] : undefined,
    name,
    required: (parent.required ?? []).includes(name),
    order: keysOf(parent),
  };
}

/** Sections with a problem from the last save (for the nav). */
export function flaggedSections(sections: FormSection[], issues: Map<string, string>): Set<string> {
  const flagged = new Set<string>();
  for (const section of sections) {
    if (section.keys.some((key) => hasIssueWithin(issues, key))) flagged.add(section.id);
  }
  return flagged;
}

export function SchemaForm({
  form,
  value,
  onChange,
  issues,
  sections,
}: {
  form: FormDefinition;
  value: Raw;
  onChange: (update: (previous: Raw) => Raw) => void;
  issues: Map<string, string>;
  sections: FormSection[];
}) {
  const set = useCallback(
    (at: string, next: unknown, order?: readonly string[]) =>
      onChange((previous) => setIn(previous, parsePathKey(at), next, order) as Raw),
    [onChange],
  );
  const api = useMemo<FormApi>(
    () => ({ set, refs: form.refs, links: form.links, issues }),
    [set, form.refs, form.links, issues],
  );

  return (
    <FormContext.Provider value={api}>
      <datalist id={LIST_ID}>
        {form.links.map((href) => (
          <option key={href} value={href} />
        ))}
      </datalist>
      <div className="space-y-6">
        {sections.map((section, i) => {
          const delay = { animationDelay: `${Math.min(i, 6) * 45}ms` };
          if (section.details) {
            return (
              <Panel
                key={section.id}
                id={section.id}
                title={section.label}
                description={section.description}
                icon={SlidersHorizontal}
                className="animate-rise-in"
                bodyClassName="py-6"
              >
                <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2">
                  {section.keys.map((key) => {
                    const field = locate(form.schema, value, key);
                    return (
                      <Field
                        key={key}
                        schema={field.schema}
                        value={field.value}
                        at={key}
                        name={field.name}
                        required={field.required}
                        order={field.order}
                      />
                    );
                  })}
                </div>
              </Panel>
            );
          }
          const key = section.keys[0];
          const field = locate(form.schema, value, key);
          const shape = analyze(field.schema);
          const optional = !field.required || ("nullable" in shape && shape.nullable);
          return (
            <div key={section.id} className="animate-rise-in" style={delay}>
              <Panel
                id={section.id}
                title={section.label}
                description={section.description ?? hintFor(key, field.name)}
                actions={optional ? <Badge>Optional</Badge> : undefined}
                className={hasIssueWithin(issues, key) ? "border-danger/40" : undefined}
                bodyClassName="py-6"
              >
                <Field
                  schema={field.schema}
                  value={field.value}
                  at={key}
                  name={field.name}
                  required={field.required}
                  order={field.order}
                  bare
                />
              </Panel>
            </div>
          );
        })}
      </div>
    </FormContext.Provider>
  );
}
