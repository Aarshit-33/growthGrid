import type { ReactNode } from "react";
import type { InstrumentShape } from "@/components/three/types";
import { cn } from "@/lib/utils";

/* Line-art marks for each principle's instrument. Used as the 3D scene's
   fallback and wherever a principle is shown without WebGL (e.g. /about). */
const GLYPHS: Record<InstrumentShape, ReactNode> = {
  prism: (
    <>
      <path d="M100 56 L138 124 L62 124 Z" />
      {[-34, -17, 0, 17, 34].map((dy) => (
        <path key={dy} d={`M20 ${96 + dy} L80 92`} opacity={0.45} />
      ))}
      <path d="M80 92 L120 92" opacity={0.8} />
      <path d="M120 92 L184 104" strokeWidth={2.4} />
    </>
  ),
  lattice: (
    <>
      <path d="M100 46 L146 72 L146 128 L100 154 L54 128 L54 72 Z" />
      <path d="M100 46 L100 100 M54 72 L100 100 L146 72 M100 100 L100 154" opacity={0.7} />
      <path d="M77 59 L77 113 L123 139 M123 59 L123 113 L77 139 M54 100 L100 126 L146 100" opacity={0.35} />
    </>
  ),
  runway: (
    <>
      <path d="M62 164 L90 70 M138 164 L110 70" />
      <path d="M100 156 L100 78" strokeDasharray="6 9" opacity={0.7} />
      <path d="M104 70 C 122 50, 150 36, 184 30" strokeDasharray="2 7" strokeWidth={2.4} />
    </>
  ),
  rings: (
    <>
      <ellipse cx="62" cy="100" rx="32" ry="19" />
      <ellipse cx="100" cy="100" rx="32" ry="8" opacity={0.8} />
      <ellipse cx="138" cy="100" rx="32" ry="19" />
    </>
  ),
};

/** Decorative line-art glyph for an instrument shape (inherits `currentColor`). */
export function InstrumentGlyph({
  shape,
  className,
  dial = true,
}: {
  shape: InstrumentShape;
  className?: string;
  /** Dotted dial ring around the glyph. */
  dial?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 200 200"
      aria-hidden="true"
      className={cn("text-em", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {dial && <circle cx="100" cy="100" r="92" strokeDasharray="1.2 5.4" opacity={0.4} />}
      {GLYPHS[shape]}
    </svg>
  );
}
