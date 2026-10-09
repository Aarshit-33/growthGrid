"use client";

import { motion, useScroll, useSpring } from "motion/react";
import { useRef } from "react";
import { useReducedMotionSafe } from "@/hooks/use-media-query";
import type { ProcessStep } from "@/lib/schemas";
import { pad } from "@/lib/utils";

/**
 * Vertical process timeline. A hairline rail fills with emerald as you
 * scroll; each step's node lights up as it passes. Works identically on
 * mobile and desktop (no pinning), so it's safe on any page.
 */
export function ProcessTimeline({ steps, durationLabel }: { steps: ProcessStep[]; durationLabel?: string }) {
  const ref = useRef<HTMLOListElement>(null);
  const reduce = useReducedMotionSafe();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 75%", "end 60%"] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });

  return (
    <ol ref={ref} className="relative">
      <span aria-hidden="true" className="absolute bottom-3 left-[1.1875rem] top-3 w-px bg-line md:left-[1.4375rem]" />
      <motion.span
        aria-hidden="true"
        className="absolute bottom-3 left-[1.1875rem] top-3 w-px origin-top bg-[linear-gradient(to_bottom,var(--color-em),var(--color-hot))] shadow-[0_0_12px_rgb(60_228_154/0.6)] md:left-[1.4375rem]"
        style={{ scaleY: reduce ? 1 : progress }}
      />
      {steps.map((step, i) => (
        <li key={step.slug} className="relative grid grid-cols-[2.5rem_1fr] gap-5 pb-14 last:pb-0 md:grid-cols-[3rem_1fr] md:gap-8 md:pb-20" data-reveal="">
          <span className="relative z-10 grid size-10 place-items-center rounded-full border border-line-strong bg-bg font-mono text-xs text-em shadow-[0_0_0_6px_var(--color-bg)] md:size-12">
            {pad(i + 1)}
          </span>
          <div className="pt-1.5 md:pt-2.5">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <h3 className="text-h3 text-ink">{step.title}</h3>
              <span className="label-mono text-faint">
                {durationLabel ? `${durationLabel} · ` : ""}
                {step.duration}
              </span>
            </div>
            <p className="mt-4 max-w-2xl text-dim">{step.summary}</p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {step.deliverables.map((d) => (
                <li
                  key={d}
                  className="rounded-full border border-line bg-white/[0.02] px-3 py-1.5 text-[0.82rem] text-dim"
                >
                  {d}
                </li>
              ))}
            </ul>
          </div>
        </li>
      ))}
    </ol>
  );
}
