"use client";

import { LayoutGroup, motion } from "motion/react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useReducedMotionSafe } from "@/hooks/use-media-query";

/**
 * A list whose hovered / focused row gets a shared highlight that glides
 * between rows (Motion layoutId), so there's no layout shift and no
 * collapsing rows under the pointer. Rows are server-rendered and passed
 * in as nodes; this component only owns the highlight.
 */
export function HighlightList({
  items,
  className,
  itemClassName,
  highlightClassName,
}: {
  items: { key: string; content: ReactNode }[];
  className?: string;
  itemClassName?: string;
  highlightClassName?: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const reduce = useReducedMotionSafe();
  const group = useId();

  return (
    <LayoutGroup id={group}>
      <ol className={className} onPointerLeave={() => setActive(null)}>
        {items.map((item) => (
          <li
            key={item.key}
            className={cn("relative isolate", itemClassName)}
            onPointerEnter={(e) => {
              if (e.pointerType === "mouse") setActive(item.key);
            }}
            onFocus={() => setActive(item.key)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setActive(null);
            }}
          >
            {active === item.key && (
              <motion.span
                aria-hidden="true"
                layoutId="highlight"
                className={cn("pointer-events-none absolute inset-0 -z-10", highlightClassName)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={reduce ? { duration: 0 } : { duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
            {item.content}
          </li>
        ))}
      </ol>
    </LayoutGroup>
  );
}
