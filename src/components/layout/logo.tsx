import type { BrandMarkImage } from "@/lib/brand";
import type { ImageAsset } from "@/lib/schemas/common";
import type { Brand } from "@/lib/schemas/settings";
import { cn } from "@/lib/utils";

/** The mark's cells: column, row, opacity (1: the lit diagonal, drawn emerald). */
export const MARK_CELLS = [
  [0, 0, 0.18], [1, 0, 0.18], [2, 0, 1],
  [0, 1, 0.18], [1, 1, 1], [2, 1, 0.35],
  [0, 2, 1], [1, 2, 0.35], [2, 2, 0.35],
] as const;

/**
 * GrowthGrid mark: a 3×3 grid where an ascending diagonal lights up —
 * the grid that grows.
 */
export function LogoMark({ className, animated = false }: { className?: string; animated?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-6", className)}>
      {MARK_CELLS.map(([x, y, o], i) => (
        <rect
          key={i}
          x={1 + x * 8}
          y={1 + y * 8}
          width="6"
          height="6"
          rx="1.4"
          fill={o === 1 ? "var(--color-em)" : "currentColor"}
          opacity={o}
          className={cn(animated && o === 1 && "origin-center animate-pulse")}
        />
      ))}
    </svg>
  );
}

/** Mark + wordmark (rendered exactly as written in settings: "growthGrid"), or the logo from Branding. */
export function Logo({ wordmark, logo, className }: { wordmark: string; logo?: Brand["logo"] | null; className?: string }) {
  const image = logo?.image;
  if (image && logo.style === "logo-only") {
    return (
      <span className={cn("inline-flex items-center text-ink", className)}>
        <LogoImage image={image} height={logo.height} />
        <span className="sr-only">{wordmark}</span>
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-ink", className)}>
      {image ? <LogoImage image={image} height={logo.height} /> : <LogoMark className="size-[1.4rem]" />}
      <span className="font-display text-[1.2rem] font-semibold leading-none tracking-[-0.045em]">{wordmark}</span>
    </span>
  );
}

/** A Branding logo at a set height; the width follows the image (any format, SVG included). */
function LogoImage({ image, height }: { image: Pick<ImageAsset, "src" | "width" | "height">; height: number }) {
  // The width/height attributes give the browser the ratio; CSS `width: auto` keeps
  // it when a container caps the height (the header's bar).
  const width = image.width && image.height ? Math.round((image.width / image.height) * height) : undefined;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small brand image in any format, sized by height
    <img
      src={image.src}
      alt=""
      width={width}
      height={height}
      decoding="async"
      style={{ height, width: "auto" }}
      className="block max-w-none shrink-0 object-contain"
    />
  );
}

/**
 * The small brand spot (page transition, sign-in badge, Studio bar): the
 * Branding mark, else the grid mark. `className` sizes it like LogoMark
 * (e.g. "size-10"); a full logo keeps that height and its own width.
 */
export function BrandMark({ mark, className, animated = false }: { mark?: BrandMarkImage | null; className?: string; animated?: boolean }) {
  if (!mark) return <LogoMark className={className} animated={animated} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small brand image in any format
    <img
      src={mark.src}
      alt=""
      aria-hidden="true"
      decoding="async"
      style={mark.wide ? { width: "auto", maxWidth: "10rem" } : undefined}
      className={cn("size-6 shrink-0 object-contain", className)}
    />
  );
}
