/**
 * Renders JSON-LD structured data. `<` is escaped so content can never
 * close the script tag early (XSS-safe even with CMS-sourced strings).
 */
export function JsonLd({ data }: { data: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
