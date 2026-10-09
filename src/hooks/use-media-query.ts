"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribe to a CSS media query. SSR-safe: returns `serverValue`
 * (default false) on the server and during hydration.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export const QUERIES = {
  reducedMotion: "(prefers-reduced-motion: reduce)",
  finePointer: "(hover: hover) and (pointer: fine)",
  desktop: "(min-width: 64rem)",
  tablet: "(min-width: 48rem)",
} as const;

/**
 * Hydration-safe `prefers-reduced-motion`: false on the server and during
 * hydration, live afterwards. Use this instead of Motion's
 * `useReducedMotion()` whenever the value changes rendered markup (elements,
 * attributes, inline styles): Motion's hook reads the real preference on the
 * first client render, which no longer matches the server HTML.
 */
export function useReducedMotionSafe(): boolean {
  return useMediaQuery(QUERIES.reducedMotion);
}
