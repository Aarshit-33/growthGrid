"use client";

import { useEffect, useRef } from "react";

/**
 * Emerald hairline pinned under the site header that fills while the
 * article body is read: it starts when the body reaches mid-screen and ends
 * when its last line is in view. When the header auto-hides, the bar rides
 * up with it to the top of the viewport. Transform-only, rAF-throttled and
 * directly tied to scroll (no autonomous motion). Hidden from AT.
 */
export function ReadingProgress({ targetId }: { targetId: string }) {
  const rail = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = document.getElementById(targetId);
    const railEl = rail.current;
    const barEl = bar.current;
    if (!target || !railEl || !barEl) return;
    const header = document.querySelector<HTMLElement>("header");

    let frame = 0;
    let followUntil = 0;
    const update = (now: number) => {
      frame = 0;
      const { top, height } = target.getBoundingClientRect();
      const start = window.innerHeight * 0.5;
      const span = height - start;
      const progress = span > 0 ? Math.min(1, Math.max(0, (start - top) / span)) : top <= start ? 1 : 0;
      barEl.style.transform = `scaleX(${progress})`;

      const offset = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
      railEl.style.transform = `translate3d(0, ${offset}px, 0)`;
      // Keep tracking while the header slides in/out after scrolling stops.
      if (now < followUntil) frame = requestAnimationFrame(update);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const follow = () => {
      followUntil = performance.now() + 700;
      schedule();
    };

    update(performance.now());
    const observer = new MutationObserver(follow);
    if (header) observer.observe(header, { attributes: true, attributeFilter: ["class", "style"] });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [targetId]);

  return (
    <div
      ref={rail}
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-40 h-0.5 will-change-transform"
      style={{ transform: "translate3d(0, var(--header-h), 0)" }}
    >
      {/* Initial scale is inline: a scale-x-* class would multiply with the JS transform. */}
      <div
        ref={bar}
        className="h-full origin-left bg-[linear-gradient(90deg,var(--color-deep),var(--color-em)_60%,var(--color-hot))] shadow-[0_0_14px_rgb(60_228_154/0.7)] will-change-transform"
        style={{ transform: "scaleX(0)" }}
      />
    </div>
  );
}
