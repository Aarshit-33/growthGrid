"use client";

import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { gfxStore } from "@/components/three/gfx";
import { useStore } from "@/components/three/store";

let instance: Lenis | null = null;

/** The active Lenis instance (null on touch devices / reduced motion). */
export const getLenis = () => instance;

/** Scroll to a target, smoothly when Lenis is active. */
export function scrollToTarget(target: number | string | HTMLElement, offset = 0) {
  if (instance) {
    instance.scrollTo(target, { offset });
    return;
  }
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const behavior: ScrollBehavior = reduce ? "auto" : "smooth";
  if (typeof target === "number") {
    window.scrollTo({ top: target, behavior });
    return;
  }
  const el = typeof target === "string" ? document.querySelector(target) : target;
  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + offset, behavior });
}

/**
 * ScrollTrigger `start` for a full-screen pinned block: pin when its top
 * reaches the top of the viewport, or, if the block is taller than the
 * viewport (a very short window, browser zoom), when its bottom reaches the
 * bottom, so the stage content below the heading is never cut off while
 * pinned. Re-evaluated on every refresh (resize).
 */
export const pinStart = (el: HTMLElement | null) => () =>
  el && el.offsetHeight > window.innerHeight + 1 ? "bottom bottom" : "top top";

/** How long after a client navigation a #hash landing is held on target. */
const LANDING_GUARD_MS = 3000;

/**
 * Keep a client-side /#hash landing on its target while the new page
 * settles. Next scrolls to the fragment inside the commit, but pins created
 * around it can still move the page afterwards: in development, React
 * StrictMode's effect re-run kills and re-creates every pin, Chrome's scroll
 * anchoring compensates for the spacers that briefly disappear, and
 * ScrollTrigger then restores that compensated offset once they're back
 * (thousands of pixels off on a phone). So for a few seconds, re-align the
 * target after every ScrollTrigger refresh, until the reader scrolls. A
 * first load is left to the browser.
 */
function useHashLanding() {
  const pathname = usePathname();
  const previous = useRef(pathname);

  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;

    let id = "";
    try {
      id = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return;
    }
    const target = id ? document.getElementById(id) : null;
    if (!target) return;

    // Honours scroll-padding (the fixed header), like the fragment scroll itself.
    const align = () => target.scrollIntoView({ block: "start", behavior: "instant" });
    const interactions = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    let timer = 0;
    const stop = () => {
      window.clearTimeout(timer);
      ScrollTrigger.removeEventListener("refresh", align);
      for (const type of interactions) window.removeEventListener(type, stop, true);
    };
    ScrollTrigger.addEventListener("refresh", align);
    for (const type of interactions) window.addEventListener(type, stop, { capture: true, passive: true });
    timer = window.setTimeout(stop, LANDING_GUARD_MS);
    return stop;
  }, [pathname]);
}

/**
 * Lenis smooth scrolling driven by GSAP's ticker, so Lenis, ScrollTrigger
 * and every tween share one rAF loop. Skipped on touch devices (native
 * momentum is better), for reduced motion, and without a GPU (native
 * scrolling stays on the compositor thread; a JS-driven one would stutter
 * when every frame is painted on the CPU).
 */
export function SmoothScroll() {
  const lite = useStore(gfxStore, (s) => s.mode === "lite");
  useHashLanding();

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const refresh = () => ScrollTrigger.refresh();
    document.fonts?.ready.then(refresh);
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (reduce || !fine || lite) return;

    const lenis = new Lenis({
      lerp: 0.1,
      smoothWheel: true,
      autoRaf: false,
      anchors: { offset: -96 },
      prevent: (node) => node instanceof Element && node.closest("[data-lenis-prevent]") !== null,
    });
    instance = lenis;

    lenis.on("scroll", ScrollTrigger.update);
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(raf);
      lenis.destroy();
      instance = null;
    };
  }, [lite]);

  return null;
}
