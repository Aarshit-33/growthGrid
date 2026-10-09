"use client";

import { MousePointerClick } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

/** Shared look for showcase controls (run / replay). */
export const controlClass =
  "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-line-strong bg-white/[0.02] px-4 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-ink transition-colors duration-300 hover:border-em/60 hover:text-hot";

/** Bottom strip of every live snapshot: the "try it" hint plus optional controls. */
export function ShowcaseFooter({ hint, children }: { hint: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-16 flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line bg-white/[0.015] px-4 py-3 sm:px-6">
      <p className="flex items-center gap-2 font-mono text-[0.7rem] tracking-[0.04em] text-muted">
        <MousePointerClick aria-hidden="true" className="size-3.5 shrink-0 text-em" />
        {hint}
      </p>
      {children}
    </div>
  );
}

/**
 * - `static`: on screen at mount (or reduced motion): keep the server-rendered final state.
 * - `armed`: mounted off-screen: render the pre-entrance state while waiting.
 * - `entered`: scrolled into view after being armed: play the entrance.
 */
export type Entrance = "static" | "armed" | "entered";

/**
 * One-shot entrance trigger that never hides content that is already visible:
 * widgets only arm themselves when they start below the fold, so the SSR
 * markup is always the complete, readable state. `onEnter` fires from the
 * observer callback, batched with the `entered` state change.
 */
export function useEntrance(
  ref: RefObject<Element | null>,
  onEnter?: () => void,
  threshold = 0.35,
): Entrance {
  const [state, setState] = useState<Entrance>("static");
  const enter = useRef(onEnter);

  useEffect(() => {
    enter.current = onEnter;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let first = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (first) {
          first = false;
          if (entry.isIntersecting) io.disconnect();
          else setState("armed");
          return;
        }
        if (entry.intersectionRatio >= threshold) {
          io.disconnect();
          setState("entered");
          enter.current?.();
        }
      },
      { threshold: [0, threshold] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold]);

  return state;
}
