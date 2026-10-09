/** The studio's name however copy spells it ("growthGrid", "Growth Grid"…). */
const BRAND_NAME = /(growth\s?grid)/i;

/**
 * Label copy in which the brand name keeps its own casing. Eyebrows,
 * `label-mono` captions and other all-caps labels uppercase their text, but
 * the camelCase name must read "growthGrid", never "GROWTHGRID".
 *
 * Text without the name is returned as is. Text with it comes back as a
 * single span, so it stays one item inside flex labels (`.eyebrow` is
 * inline-flex with a gap, which would otherwise split the words apart).
 */
export function BrandCase({ text }: { text: string }) {
  const parts = text.split(BRAND_NAME);
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
