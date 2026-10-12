"use client";

import { useMemo } from "react";
import { useBrandName } from "@/components/layout/brand-context";

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A pattern for the site's name however copy spells it: "growthGrid" also
 * matches "Growth Grid" and "growthgrid" (words split at spaces and at
 * camelCase humps, optional whitespace between them, any case).
 */
function namePattern(name: string): RegExp | null {
  const words = name
    .trim()
    .split(/\s+|(?<=[a-z0-9])(?=[A-Z])/)
    .filter(Boolean)
    .map(escapeRegExp);
  return words.length ? new RegExp(`(${words.join("\\s?")})`, "i") : null;
}

/**
 * Label copy in which the brand name (Site settings › Name) keeps its own
 * casing. Eyebrows, `label-mono` captions and other all-caps labels uppercase
 * their text, but a camelCase name such as "growthGrid" must never read
 * "GROWTHGRID".
 *
 * Text without the name is returned as is. Text with it comes back as a
 * single span, so it stays one item inside flex labels (`.eyebrow` is
 * inline-flex with a gap, which would otherwise split the words apart).
 */
export function BrandCase({ text }: { text: string }) {
  const name = useBrandName();
  const pattern = useMemo(() => (name ? namePattern(name) : null), [name]);
  const parts = pattern ? text.split(pattern) : [text];
  if (parts.length === 1) return text;
  return (
    <span>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="normal-case">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </span>
  );
}
