"use client";

import { useEffect, useRef } from "react";
import { gfxStore } from "@/components/three/gfx";

/* ─────────────────────────────────────────────────────────────
   Site-wide starfield: a fixed 2D canvas behind everything with
   small twinkling stars. Three depth layers drift at different
   speeds as the page scrolls, for a hint of parallax. A handful
   of brighter stars get a soft glow and a faint cross flare at
   their peak.
   Cheap by design: one pre-rendered glow sprite, ~30 fps, star
   count scaled to the viewport area (capped), paused while the
   tab is hidden. Reduced motion draws a single still frame.
   Without a GPU (gfx "lite"), where this canvas is painted on the
   CPU, the parallax goes and the stars twinkle at ~12 fps only
   while the page is at rest, so scrolling keeps the CPU.
   ───────────────────────────────────────────────────────────── */

interface Star {
  x: number;
  y: number;
  /** Radius in CSS px. */
  r: number;
  /** Peak opacity. */
  a: number;
  /** Twinkle speed (rad/s) and phase. */
  speed: number;
  phase: number;
  /** 0 = far (slow), 1 = mid, 2 = near (fast). */
  layer: 0 | 1 | 2;
  tint: string;
  bright: boolean;
}

/** Mostly cool white, a few in the brand emerald and a pale cyan. */
const TINTS = ["#eaf2f7", "#eaf2f7", "#eaf2f7", "#dff6ff", "#bfeede", "#3ce49a"];
/** Scroll parallax per layer (fraction of scroll distance). */
const PARALLAX = [0.015, 0.035, 0.07];
const FRAME_MS = 1000 / 30;
/** No GPU: slower twinkle, and none until scrolling has settled this long. */
const LITE_FRAME_MS = 1000 / 12;
const LITE_SCROLL_REST_MS = 250;

function makeSprite(tint: string) {
  const s = 32;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, tint);
  grad.addColorStop(0.18, tint);
  grad.addColorStop(0.42, `${tint}55`);
  grad.addColorStop(1, `${tint}00`);
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return c;
}

function makeStars(w: number, h: number): Star[] {
  // Denser on big screens, never so many that phones pay for it.
  const count = Math.min(260, Math.round((w * h) / 7000));
  return Array.from({ length: count }, () => {
    const layer = (Math.random() < 0.55 ? 0 : Math.random() < 0.7 ? 1 : 2) as Star["layer"];
    const bright = Math.random() < 0.06;
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      r: bright ? 1.1 + Math.random() * 0.7 : 0.35 + layer * 0.25 + Math.random() * 0.45,
      a: bright ? 0.85 + Math.random() * 0.15 : 0.25 + Math.random() * 0.5,
      speed: 0.6 + Math.random() * 2.2,
      phase: Math.random() * Math.PI * 2,
      layer,
      tint: TINTS[Math.floor(Math.random() * TINTS.length)],
      bright,
    };
  });
}

export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sprites = new Map(TINTS.map((t) => [t, makeSprite(t)]));
    let w = 0;
    let h = 0;
    let stars: Star[] = [];
    let raf = 0;
    let last = 0;
    let lastScroll = -Infinity;
    const lite = () => gfxStore.get().mode === "lite";

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const nw = window.innerWidth;
      const nh = window.innerHeight;
      // Phones fire resize when the URL bar collapses; only re-seed on real size changes.
      const reseed = Math.abs(nw - w) > 1 || Math.abs(nh - h) > nh * 0.25 || stars.length === 0;
      w = nw;
      h = nh;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reseed) stars = makeStars(w, h);
    };

    const draw = (time: number) => {
      const t = time / 1000;
      const still = reduce.matches;
      // No GPU: no parallax, so scrolling never needs a redraw.
      const scroll = lite() ? 0 : window.scrollY;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        // Twinkle: a slow swell, sharpened so stars occasionally flare.
        const wave = still ? 0.8 : 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
        const alpha = s.a * (0.35 + 0.65 * wave * wave);
        const y = (((s.y - scroll * PARALLAX[s.layer]) % h) + h) % h;
        const size = s.r * (s.bright ? 7 : 5);
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprites.get(s.tint)!, s.x - size / 2, y - size / 2, size, size);
        if (s.bright && wave > 0.82) {
          // Faint cross flare at the peak.
          const len = s.r * 7 * (wave - 0.82) * 5.5;
          ctx.globalAlpha = alpha * 0.45;
          ctx.fillStyle = s.tint;
          ctx.fillRect(s.x - len, y - 0.35, len * 2, 0.7);
          ctx.fillRect(s.x - 0.35, y - len, 0.7, len * 2);
        }
      }
      ctx.globalAlpha = 1;
    };

    const loop = (time: number) => {
      raf = requestAnimationFrame(loop);
      const cpu = lite();
      if (time - last < (cpu ? LITE_FRAME_MS : FRAME_MS)) return;
      if (cpu && time - lastScroll < LITE_SCROLL_REST_MS) return;
      last = time;
      draw(time);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      if (reduce.matches) draw(0);
      else raf = requestAnimationFrame(loop);
    };

    // Still mode only redraws when the parallax position changes.
    const onScroll = () => {
      lastScroll = performance.now();
      if (reduce.matches && !lite()) draw(0);
    };
    const onResize = () => {
      resize();
      draw(performance.now());
    };
    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else start();
    };

    resize();
    start();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    reduce.addEventListener("change", start);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      reduce.removeEventListener("change", start);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className="starfield" />;
}
