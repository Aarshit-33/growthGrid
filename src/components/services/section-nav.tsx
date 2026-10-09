"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn, pad } from "@/lib/utils";
import { useReducedMotionSafe } from "@/hooks/use-media-query";

/**
 * Sticky "On this page" navigation with scroll-spy. The active link is
 * the section crossing a band ~35% down the viewport; an emerald rail
 * glides to it. Plain anchors, so it works before hydration too.
 */
export function SectionNav({
  label,
  items,
  className,
}: {
  label: string;
  items: { id: string; label: string }[];
  className?: string;
}) {
  const [active, setActive] = useState(items[0]?.id);
  const reduce = useReducedMotionSafe();
  const ids = items.map((item) => item.id).join("|");

  useEffect(() => {
    const targets = ids
      .split("|")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    // Active = the last target whose top has crossed a line 35% down the
    // viewport. Works for tall sections and short headings alike, even when a
    // jump (anchor click, PageDown, fast fling) skips straight past them.
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.35;
      let current = targets[0];
      for (const el of targets) {
        if (el.getBoundingClientRect().top > line) break;
        current = el;
      }
      // A short final section may never reach the line: at the very bottom of
      // the page, it's the one being read.
      const root = document.documentElement;
      if (window.scrollY + window.innerHeight >= root.scrollHeight - 2) current = targets[targets.length - 1];
      setActive(current.id);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, [ids]);

  return (
    <nav aria-label={label} className={className}>
      <p className="label-mono">{label}</p>
      <ol className="relative mt-6 border-l border-line">
        {items.map((item, i) => {
          const current = item.id === active;
          return (
            <li key={item.id} className="relative">
              {current && (
                <motion.span
                  aria-hidden="true"
                  layoutId="section-nav-rail"
                  className="absolute -left-px inset-y-0 w-px bg-em shadow-[0_0_10px_rgb(60_228_154/0.7)]"
                  transition={reduce ? { duration: 0 } : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                />
              )}
              <a
                href={`#${item.id}`}
                aria-current={current ? "location" : undefined}
                className={cn(
                  "flex items-baseline gap-3 py-2.5 pl-5 text-[0.95rem] transition-colors duration-300",
                  current ? "text-ink" : "text-muted hover:text-dim",
                )}
              >
                <span className={cn("font-mono text-[0.68rem] transition-colors", current ? "text-em" : "text-faint")}>
                  {pad(i + 1)}
                </span>
                {item.label}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
