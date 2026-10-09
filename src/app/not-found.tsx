import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { SiteChrome } from "@/components/layout/site-chrome";
import { ArrowSwap } from "@/components/ui/button";
import { SplitHeading } from "@/components/ui/split-heading";
import { getPage } from "@/lib/data";
import { cn, pad } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage("not-found");
  return {
    title: page.eyebrow,
    description: page.lede,
    // Next.js already adds `noindex` to 404 responses; replacing the root
    // layout's `index, follow` keeps the two robots tags from contradicting.
    robots: { index: false, follow: true },
  };
}

const CELLS = 6;
const CELL = 60;
const SIZE = CELLS * CELL;

/** The glowing grid cell that went missing. `className` sizes it. */
function Tile({ className }: { className?: string }) {
  // `rotate` (a separate CSS property) composes with the float keyframes' transform.
  return (
    <div className="animate-float rotate-[14deg]">
      <div
        className={cn(
          "relative overflow-hidden rounded-[22%] border border-em/60 bg-[linear-gradient(140deg,rgb(60_228_154/0.9),rgb(15_160_110/0.85))] shadow-[0_0_60px_-6px_rgb(60_228_154/0.8),inset_0_1px_0_rgb(255_255_255/0.35)]",
          className,
        )}
      >
        <div className="blueprint absolute inset-0 opacity-40 [--color-line:rgb(4_7_10/0.35)] [--grid-size:0.75rem]" />
        <span className="absolute left-[12%] top-[12%] size-[9%] rounded-full bg-bg/70" />
      </div>
    </div>
  );
}

/**
 * Blueprint grid with one empty slot (marching-ants outline) and the tile
 * that drifted out of it, floating off-grid. Decorative; CSS-only motion
 * (the global reduced-motion rule stills it).
 */
function DriftedTile() {
  const lines = Array.from({ length: CELLS + 1 }, (_, i) => i * CELL);
  return (
    <div aria-hidden="true" className="relative mx-auto aspect-square w-full max-w-[30rem]">
      <svg viewBox={`-24 -24 ${SIZE + 48} ${SIZE + 48}`} className="size-full overflow-visible" fill="none">
        <defs>
          <radialGradient id="nf-fade" cx="50%" cy="50%" r="50%">
            <stop offset="55%" stopColor="#fff" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id="nf-mask">
            <rect x="-24" y="-24" width={SIZE + 48} height={SIZE + 48} fill="url(#nf-fade)" />
          </mask>
        </defs>
        <g mask="url(#nf-mask)" stroke="var(--color-line-strong)" strokeWidth="1">
          {lines.map((p) => (
            <g key={p}>
              <line x1={p} y1={-24} x2={p} y2={SIZE + 24} />
              <line x1={-24} y1={p} x2={SIZE + 24} y2={p} />
            </g>
          ))}
        </g>
        {/* Axis ticks */}
        <g className="fill-faint font-mono" fontSize="9" letterSpacing="1">
          {Array.from({ length: CELLS }, (_, i) => (
            <g key={i}>
              <text x={i * CELL + CELL / 2} y={-10} textAnchor="middle">
                {pad(i + 1)}
              </text>
              <text x={-10} y={i * CELL + CELL / 2 + 3} textAnchor="end">
                {pad(i + 1)}
              </text>
            </g>
          ))}
        </g>
        {/* The empty slot */}
        <rect
          x={2 * CELL + 4}
          y={2 * CELL + 4}
          width={CELL - 8}
          height={CELL - 8}
          rx="6"
          stroke="var(--color-em)"
          strokeOpacity="0.7"
          strokeWidth="1.5"
          strokeDasharray="6 4"
          className="animate-dash"
        />
        <circle cx={2.5 * CELL} cy={2.5 * CELL} r="2.5" fill="var(--color-em)" />
        {/* Its trajectory off the grid */}
        <path
          d={`M ${2.5 * CELL} ${2.5 * CELL} C ${3.4 * CELL} ${2.6 * CELL}, ${3.6 * CELL} ${3.6 * CELL}, ${4.35 * CELL} ${4.1 * CELL}`}
          stroke="var(--color-em)"
          strokeOpacity="0.45"
          strokeWidth="1.25"
          strokeDasharray="6 4"
          className="animate-dash"
        />
        {/* Crosshair on the slot */}
        <g stroke="var(--color-em)" strokeOpacity="0.5">
          <line x1={2.5 * CELL} y1={2 * CELL - 14} x2={2.5 * CELL} y2={2 * CELL - 4} />
          <line x1={2 * CELL - 14} y1={2.5 * CELL} x2={2 * CELL - 4} y2={2.5 * CELL} />
        </g>
      </svg>

      {/* The drifting tile (HTML for the glow). */}
      <div className="absolute left-[73%] top-[70%] -translate-x-1/2 -translate-y-1/2">
        <Tile className="size-[clamp(3.5rem,6vw,5rem)]" />
      </div>
    </div>
  );
}

/**
 * Small-screen version of the same story (slot → trail → tile) without the
 * axes; the page's blueprint background supplies the grid. Needs a
 * positioned `className`.
 */
function MiniDrift({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("h-24 w-28", className)}>
      <svg viewBox="0 0 112 96" className="absolute inset-0 size-full overflow-visible" fill="none">
        <rect
          x="2"
          y="2"
          width="30"
          height="30"
          rx="5"
          stroke="var(--color-em)"
          strokeOpacity="0.7"
          strokeWidth="1.25"
          strokeDasharray="6 4"
          className="animate-dash"
        />
        <circle cx="17" cy="17" r="2" fill="var(--color-em)" />
        <path
          d="M 17 17 C 46 18, 56 50, 84 66"
          stroke="var(--color-em)"
          strokeOpacity="0.45"
          strokeWidth="1"
          strokeDasharray="6 4"
          className="animate-dash"
        />
      </svg>
      <div className="absolute left-[80%] top-[76%] -translate-x-1/2 -translate-y-1/2">
        <Tile className="size-9" />
      </div>
    </div>
  );
}

export default async function NotFound() {
  const page = await getPage("not-found");
  const code = page.eyebrow.match(/\d{3}/)?.[0];

  // Rendered by the root layout (unknown URLs and notFound() anywhere), outside
  // the (site) layout, so the 404 brings the site chrome itself.
  return (
    <SiteChrome>
      <section className="relative isolate overflow-hidden pb-20 pt-[calc(var(--header-h)+3rem)] md:pb-28 md:pt-[calc(var(--header-h)+5rem)] lg:flex lg:min-h-[100svh] lg:items-center lg:pb-16 lg:pt-[calc(var(--header-h)+2.5rem)]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="blueprint fade-radial absolute inset-0 opacity-70 [--grid-size:4rem]" />
          <div className="absolute -top-56 left-1/2 h-[34rem] w-[60rem] max-w-[140vw] -translate-x-1/2 rounded-full bg-em/[0.08] blur-3xl" />
          {code && (
            <span className="absolute -right-[4vw] top-[calc(var(--header-h)+1rem)] select-none font-display text-[clamp(9rem,34vw,30rem)] font-semibold leading-none tracking-[-0.08em] text-transparent opacity-60 [-webkit-text-stroke:1px_var(--color-line-strong)] lg:bottom-[6vh] lg:top-auto">
              {code}
            </span>
          )}
          <span className="crosshair left-[var(--gutter)] top-[calc(var(--header-h)+1rem)] hidden md:block" />
          <span className="crosshair right-[var(--gutter)] top-[calc(var(--header-h)+1rem)] hidden md:block" />
          <MiniDrift className="absolute right-[7vw] top-[calc(var(--header-h)+2.25rem)] lg:hidden" />
        </div>

        <div className="container-x grid gap-16 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <p className="eyebrow load-fade" style={{ "--delay": "60ms" } as CSSProperties}>
              <span aria-hidden="true" className="h-px w-8 bg-em/50" />
              {page.eyebrow}
            </p>
            <SplitHeading as="h1" mode="load" text={page.headline} className="text-h1 mt-6 max-w-3xl" delay={140} />
            <p className="text-lede load-fade mt-8 max-w-xl" style={{ "--delay": "420ms" } as CSSProperties}>
              {page.lede}
            </p>

            <nav
              aria-labelledby="recovery-links"
              className="load-fade mt-12 max-w-xl md:mt-16 lg:mt-12"
              style={{ "--delay": "560ms" } as CSSProperties}
            >
              <p id="recovery-links" className="label-mono">
                {page.linksLabel}
              </p>
              <ul className="mt-5 border-b border-line">
                {page.links.map((link, i) => (
                  <li key={link.href} className="border-t border-line">
                    <Link
                      href={link.href}
                      className="group/link flex items-center gap-5 py-4 transition-colors duration-300 hover:text-hot md:py-5 lg:py-4"
                    >
                      <span aria-hidden="true" className="font-mono text-[0.68rem] tabular-nums text-faint">
                        {pad(i + 1)}
                      </span>
                      <span className="text-[1.05rem] font-medium text-ink transition-[color,translate] duration-500 ease-out-expo group-hover/link:translate-x-1 group-hover/link:text-hot md:text-[1.15rem]">
                        {link.label}
                      </span>
                      <span className="ml-auto flex items-center gap-5">
                        <span aria-hidden="true" className="hidden font-mono text-[0.68rem] text-faint sm:inline">
                          {link.href}
                        </span>
                        <ArrowSwap trigger="link" className="text-muted group-hover/link:text-em" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div className="load-fade hidden lg:col-span-5 lg:block" style={{ "--delay": "300ms" } as CSSProperties}>
            <DriftedTile />
          </div>
        </div>
      </section>
    </SiteChrome>
  );
}
