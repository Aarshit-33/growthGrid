"use client";

import { motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { useBrandMark } from "@/components/layout/brand-context";
import { BrandMark } from "@/components/layout/logo";
import { useReducedMotionSafe } from "@/hooks/use-media-query";

// True after the first page has mounted. Module state survives client
// navigations, so only *subsequent* pages play the transition — the first
// paint (SSR/LCP) is never covered by a curtain.
let hasMounted = false;

/**
 * Page transition: an emerald-edged curtain lifts to reveal the new page.
 * Opacity-only on the content so fixed/sticky descendants aren't affected.
 */
export default function Template({ children }: { children: ReactNode }) {
  const [animate] = useState(() => hasMounted);
  const reduce = useReducedMotionSafe();
  const mark = useBrandMark();

  useEffect(() => {
    hasMounted = true;
  }, []);

  if (!animate || reduce) return <>{children}</>;

  return (
    <>
      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[70] grid place-items-center border-b border-em/40 bg-surface"
        initial={{ clipPath: "inset(0% 0% 0% 0%)" }}
        animate={{ clipPath: "inset(0% 0% 100% 0%)" }}
        transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1], delay: 0.1 }}
      >
        <motion.span
          initial={{ opacity: 1, scale: 1 }}
          animate={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.3 }}
          className="text-muted"
        >
          <BrandMark mark={mark} className="size-10" />
        </motion.span>
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </>
  );
}
