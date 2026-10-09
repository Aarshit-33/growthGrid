import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { headingText, parseHeading, plainText, type HeadingToken } from "@/lib/utils/text";

/* ─────────────────────────────────────────────────────────────
   Tiny, safe renderers for content strings. No HTML is ever
   injected — strings are tokenised into React elements.

   • Headings:  "Built for the work\nthat *moves you forward.*"
   • Body text: **bold**, *emphasis*, `code`, [label](href)
   ───────────────────────────────────────────────────────────── */

export { headingText, parseHeading, plainText, type HeadingToken };

/** Heading with *emphasis* and line breaks, no animation. */
export function HeadingText({ text }: { text: string }) {
  const lines = parseHeading(text);
  return (
    <>
      {lines.map((tokens, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {tokens.map((t, j) =>
            t.em ? (
              <em key={j} className="em-serif">
                {t.text}
              </em>
            ) : (
              <Fragment key={j}>{t.text}</Fragment>
            ),
          )}
        </Fragment>
      ))}
    </>
  );
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

function isInternal(href: string) {
  return href.startsWith("/") || href.startsWith("#");
}

/** Render the inline markdown subset used in content strings. */
export function InlineText({ text }: { text: string }): ReactNode {
  const parts = text.split(INLINE).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("[")) {
      const match = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
      if (match) {
        const [, label, href] = match;
        return isInternal(href) ? (
          <Link key={i} href={href}>
            {label}
          </Link>
        ) : (
          <a key={i} href={href} target="_blank" rel="noopener noreferrer">
            {label}
          </a>
        );
      }
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
