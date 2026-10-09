"use client";

import { animate } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

function format(n: number, decimals: number, prefix: string, suffix: string) {
  return (
    prefix +
    n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) +
    suffix
  );
}

/**
 * Number that counts up when scrolled into view. The server renders the
 * final value (SEO, no-JS). It only animates if it starts off-screen, so
 * there's never a flash from the real number back to zero.
 */
export function Counter({
  value,
  from = 0,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 1.8,
  className,
}: {
  value: number;
  from?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) return;

    el.textContent = format(from, decimals, prefix, suffix);
    let stop: (() => void) | undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        const controls = animate(from, value, {
          duration,
          ease: [0.16, 1, 0.3, 1],
          onUpdate: (v) => {
            el.textContent = format(v, decimals, prefix, suffix);
          },
        });
        stop = () => controls.stop();
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      stop?.();
      el.textContent = format(value, decimals, prefix, suffix);
    };
  }, [value, from, decimals, prefix, suffix, duration]);

  const final = format(value, decimals, prefix, suffix);
  return (
    <span className={cn("tabular-nums", className)}>
      <span className="sr-only">{final}</span>
      <span ref={ref} aria-hidden="true">
        {final}
      </span>
    </span>
  );
}
