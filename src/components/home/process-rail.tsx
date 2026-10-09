"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { pinStart, scrollToTarget } from "@/components/layout/smooth-scroll";
import { journey } from "@/components/three/store";
import { BrandCase } from "@/components/ui/brand-case";
import { SectionHeading } from "@/components/ui/section-heading";
import { useReducedMotionSafe } from "@/hooks/use-media-query";
import type { ProcessStep, SectionIntro } from "@/lib/schemas";
import { cn, pad } from "@/lib/utils";

gsap.registerPlugin(ScrollTrigger, useGSAP);
// Phones: the URL bar collapsing must not re-measure (and jump) the pin.
ScrollTrigger.config({ ignoreMobileResize: true });

const H = 320;
const Y_BOTTOM = 276;
const RISE = 44;
/** Scroll distance per stage, and the pause on the last stage before release (× viewport height). */
const PER_STEP = 0.7;
const HOLD = 0.45;

/** Wide staircase for desktop, a narrower (so taller) one for phones and tablets. */
const LAYOUTS = {
  wide: { w: 1200, pad: 110, edge: 24 },
  compact: { w: 600, pad: 48, edge: 12 },
} as const;
type Layout = keyof typeof LAYOUTS;

/** Nodes on a rising staircase, and the stepped path joining them. */
function staircase(n: number, layout: Layout) {
  const { w, pad: xPad, edge } = LAYOUTS[layout];
  const span = n > 1 ? (w - xPad * 2) / (n - 1) : 0;
  const nodes = Array.from({ length: n }, (_, i) => ({ x: xPad + i * span, y: Y_BOTTOM - i * RISE }));
  let d = `M ${edge} ${nodes[0]?.y ?? Y_BOTTOM} H ${nodes[0]?.x ?? xPad}`;
  for (let i = 1; i < n; i++) {
    const mid = (nodes[i - 1].x + nodes[i].x) / 2;
    d += ` H ${mid} V ${nodes[i].y} H ${nodes[i].x}`;
  }
  d += ` H ${w - edge}`;
  return { w, nodes, d };
}

/**
 * The Growth Grid process, on every screen size: when the staircase reaches
 * the top of the viewport the section pins, and scrolling climbs it one
 * stage at a time (GSAP ScrollTrigger). The path draws itself as you go and
 * the active stage's detail swaps in below. After the last stage (and a
 * short hold) the pin releases and the page scrolls on normally.
 * With reduced motion the pin still works but every change is instant.
 */
export function ProcessRail({
  steps,
  label,
  intro,
  index,
  headingId,
}: {
  steps: ProcessStep[];
  label?: string;
  /** Section intro: rendered here (as the h2) so the title stays visible while pinned. */
  intro?: SectionIntro;
  index?: string;
  headingId?: string;
}) {
  const n = steps.length;
  const scope = useRef<HTMLDivElement>(null);
  const paths = useRef<(SVGPathElement | null)[]>([]);
  const stRef = useRef<ScrollTrigger | null>(null);
  const [active, setActive] = useState(0);
  const [pinned, setPinned] = useState(false);
  const reduce = useReducedMotionSafe();
  const wide = useMemo(() => staircase(n, "wide"), [n]);
  const compact = useMemo(() => staircase(n, "compact"), [n]);
  const fraction = (i: number) => (n > 1 ? i / (n - 1) : 1);
  /** Share of the pin spent climbing (the rest is the final hold). */
  const climbShare = n > 1 ? ((n - 1) * PER_STEP) / ((n - 1) * PER_STEP + HOLD) : 0;

  const draw = (p: number) => {
    for (const path of paths.current) if (path) path.style.strokeDashoffset = String(1 - p);
  };

  useGSAP(
    () => {
      const st = ScrollTrigger.create({
        trigger: scope.current,
        start: pinStart(scope.current),
        end: () => `+=${Math.round(window.innerHeight * (Math.max(1, n - 1) * PER_STEP + HOLD))}`,
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          const climb = climbShare > 0 ? Math.min(1, self.progress / climbShare) : 1;
          draw(climb);
          // The journey backdrop climbs its staircase in step with the rail.
          journey.process = climb;
          const i = Math.min(n - 1, Math.round(climb * (n - 1)));
          setActive((prev) => (prev === i ? prev : i));
        },
      });
      stRef.current = st;
      journey.process = Math.min(1, st.progress / (climbShare || 1));
      setPinned(true);
      return () => {
        st.kill();
        stRef.current = null;
        journey.process = -1;
        setPinned(false);
      };
    },
    { scope, dependencies: [n] },
  );

  // Unpinned (before hydration / no ScrollTrigger): the path follows the selected stage.
  useEffect(() => {
    if (!pinned) draw(fraction(active));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, pinned]);

  const go = (i: number) => {
    const st = stRef.current;
    if (st) scrollToTarget(st.start + (st.end - st.start) * climbShare * fraction(i) + 1);
    else setActive(i);
  };

  const rail = (layout: Layout, className: string) => {
    const { w, nodes, d } = layout === "wide" ? wide : compact;
    const index = layout === "wide" ? 0 : 1;
    return (
      <div className={cn("relative", className)}>
        <svg viewBox={`0 0 ${w} ${H}`} className="w-full overflow-visible" aria-hidden="true">
          <defs>
            <filter id={`process-glow-${layout}`} x="-10%" y="-50%" width="120%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Ground grid */}
          {nodes.map((node, i) => (
            <line key={i} x1={node.x} x2={node.x} y1={node.y} y2={H} className="stroke-line" strokeDasharray="2 6" />
          ))}
          <path d={d} fill="none" strokeWidth={1.5} className="stroke-line-strong" />
          <path
            ref={(el) => {
              paths.current[index] = el;
            }}
            d={d}
            fill="none"
            strokeWidth={2.5}
            pathLength={1}
            strokeDasharray="1"
            strokeLinecap="round"
            filter={`url(#process-glow-${layout})`}
            className={cn("stroke-em", !pinned && "transition-[stroke-dashoffset] duration-1000 ease-out-expo")}
            style={{ strokeDashoffset: 1 }}
          />
        </svg>

        {/* Stage buttons, positioned over the SVG nodes. */}
        <ol className="absolute inset-0">
          {steps.map((s, i) => {
            // Only the current stage is highlighted; the drawn path shows the climb so far.
            const current = i === active;
            return (
              <li
                key={s.slug}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${(nodes[i].x / w) * 100}%`, top: `${(nodes[i].y / H) * 100}%` }}
              >
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={current ? "step" : undefined}
                  aria-label={layout === "compact" ? `${pad(i + 1)} ${s.title}` : undefined}
                  className="group relative grid size-10 place-items-center rounded-full lg:size-12"
                >
                  {/* Both fills are opaque so the path never strikes through a stage number. */}
                  <span
                    className={cn(
                      "absolute inset-0 rounded-full border transition-all duration-500",
                      current
                        ? "scale-100 border-em bg-[color-mix(in_oklab,var(--color-em)_15%,var(--color-bg))] shadow-[0_0_30px_-4px_rgb(60_228_154/0.8)]"
                        : "scale-75 border-line-strong bg-bg group-hover:border-em/60",
                    )}
                  />
                  <span
                    className={cn(
                      "relative font-mono text-[0.68rem] transition-colors duration-500 lg:text-xs",
                      current ? "text-em" : "text-muted group-hover:text-dim",
                    )}
                  >
                    {pad(i + 1)}
                  </span>
                  {layout === "wide" && (
                    <span
                      className={cn(
                        "absolute left-1/2 top-full mt-3 -translate-x-1/2 whitespace-nowrap font-mono text-[0.68rem] uppercase tracking-[0.14em] transition-colors duration-500",
                        current ? "text-ink" : "text-faint group-hover:text-dim",
                      )}
                    >
                      {s.title}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    );
  };

  return (
    <div
      ref={scope}
      className="scene-text relative flex min-h-[100svh] flex-col justify-center gap-6 pb-4 pt-[calc(var(--header-h)+0.75rem)] lg:gap-8 lg:pb-8 lg:pt-[calc(var(--header-h)+1.5rem)] [@media(min-width:64rem)_and_(max-height:820px)]:gap-5"
    >
      {/* The section title stays on screen while the block is pinned. */}
      {intro ? (
        <SectionHeading
          intro={intro}
          index={index}
          id={headingId}
          ledeClassName="[@media(max-height:960px)]:sr-only"
        />
      ) : (
        label && (
          <p className="label-mono flex items-center gap-3 text-faint">
            <span aria-hidden="true" className="h-px w-8 bg-em/50" />
            <BrandCase text={label} />
          </p>
        )
      )}
      {/* Width capped by viewport height (viewBox aspect 600:320 / 1200:320) so the
          staircase never pushes the stage detail off screen under the heading.
          Desktop: --rail-h is the height left after the heading, gaps and detail
          (more is taken when the lede shows, less on short screens). */}
      {rail("compact", "mx-auto w-full max-w-[min(36rem,calc(24svh*1.875))] lg:hidden")}
      {rail(
        "wide",
        "mx-auto hidden w-full max-w-[calc(var(--rail-h)*3.75)] [--rail-h:min(30svh,100svh_-_38rem)] lg:block [@media(min-height:961px)]:[--rail-h:min(30svh,100svh_-_44rem)] [@media(max-height:820px)]:[--rail-h:clamp(20svh,100svh_-_35rem,28svh)]",
      )}

      {/* Stage detail: every stage shares one grid cell, so the block keeps the
          height of the tallest (nothing shifts while climbing) and only the active
          one is visible (inactive ones are `invisible`, hidden from assistive tech).
          The scrim keeps the copy legible over the 3D staircase. */}
      <div className="relative isolate grid border-t border-line pt-6 lg:pt-8 [@media(min-width:64rem)_and_(max-height:820px)]:pt-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-4 -bottom-10 lg:-inset-x-8 top-0 -z-10 bg-[radial-gradient(120%_100%_at_60%_40%,rgb(4_7_10/0.82),rgb(4_7_10/0.55)_60%,transparent)]"
        />
        {steps.map((s, i) => {
          const on = i === active;
          return (
            <motion.div
              key={s.slug}
              initial={false}
              animate={on ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
              transition={{ duration: on && !reduce ? 0.45 : 0, ease: [0.16, 1, 0.3, 1] }}
              className={cn("grid gap-5 [grid-area:1/1] lg:grid-cols-12 lg:gap-10", !on && "invisible")}
            >
              <div className="lg:col-span-5">
                <p className="label-mono tabular-nums">
                  [{pad(i + 1)}/{pad(n)}] · {s.duration}
                </p>
                <h3 className="text-h2 mt-3 text-ink lg:mt-4">{s.title}</h3>
                <ul className="mt-4 flex flex-wrap gap-2 lg:mt-5">
                  {s.tags.map((tag) => (
                    <li
                      key={tag}
                      className="rounded-full border border-em/30 bg-em/[0.07] px-2.5 py-1 font-mono text-[0.66rem] uppercase tracking-[0.12em] text-em"
                    >
                      {tag}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="lg:col-span-7">
                <p className="text-lede">{s.summary}</p>
                {/* Supporting detail: visually dropped when the screen is too short for it. */}
                <ul className="mt-5 grid gap-2 sm:grid-cols-3 lg:mt-6 lg:gap-3 max-lg:[@media(max-height:900px)]:sr-only lg:[@media(max-height:820px)]:sr-only">
                  {s.deliverables.map((item) => (
                    <li key={item} className="card flex items-start gap-3 px-4 py-3 text-[0.9rem] text-dim lg:py-3.5">
                      <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rotate-45 bg-em" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
