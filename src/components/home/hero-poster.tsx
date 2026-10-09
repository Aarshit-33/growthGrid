"use client";

import { useEffect, useRef } from "react";
import { FIELD, FIELD_LOOK, FIELD_VIEWS } from "@/components/three/scenes/growth-field-shape";
import { stageStore, useStore } from "@/components/three/store";

/* ─────────────────────────────────────────────────────────────
   The Growth Field as a still. When the WebGL stage won't run on
   this page view (graphics acceleration off / no GPU, data saver,
   or the stage failed), the hero paints the same grid, camera and
   colours as scenes/growth-field.tsx onto a 2D canvas, once per
   size: columns rising toward the horizon, their tops lit by
   height, with the swell kept right of the copy. No animation
   loop, since without a GPU every pixel is drawn on the CPU.
   Never imports three.js.
   ───────────────────────────────────────────────────────────── */

const COMPACT_QUERY = "(max-width: 767px)";

type RGB = readonly [number, number, number];

/** sRGB hex → linear light (the scene's shader maths). */
function linear(hex: number): RGB {
  const channel = (shift: number) => {
    const c = ((hex >> shift) & 255) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [channel(16), channel(8), channel(0)];
}

/** Palette (scenes/shared.ts). */
const BG = linear(0x04070a);
const BASE = linear(0x08130f);
const EM = linear(0x3ce49a);
const HOT = linear(0x7dffc4);

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const add = (a: RGB, b: RGB, k: number): RGB => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
/** Linear light → CSS colour (the shader's colour-space conversion). */
function css(c: RGB): string {
  const ch = (v: number) => {
    const x = Math.min(1, Math.max(0, v));
    return Math.round((x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055) * 255);
  };
  return `rgb(${ch(c[0])} ${ch(c[1])} ${ch(c[2])})`;
}

/** Seeded PRNG (mulberry32): the same still on every visit. */
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 2D simplex noise, about -1…1 (after Stefan Gustavson), on a seeded permutation. */
function simplex(rand: () => number) {
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = Uint8Array.from({ length: 512 }, (_, i) => p[i & 255]);
  const grad = [1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1];
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;
  const corner = (x: number, y: number, g: number) => {
    let t = 0.5 - x * x - y * y;
    if (t < 0) return 0;
    t *= t;
    const k = (g & 7) * 2;
    return t * t * (grad[k] * x + grad[k + 1] * y);
  };
  return (x: number, y: number) => {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - i + t;
    const y0 = y - j + t;
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = 1 - i1;
    const ii = i & 255;
    const jj = j & 255;
    return (
      70 *
      (corner(x0, y0, perm[ii + perm[jj]]) +
        corner(x0 - i1 + G2, y0 - j1 + G2, perm[ii + i1 + perm[jj + j1]]) +
        corner(x0 - 1 + 2 * G2, y0 - 1 + 2 * G2, perm[ii + 1 + perm[jj + 1]]))
    );
  };
}

type Point = readonly [x: number, y: number];
type Job = Generator<undefined, HTMLCanvasElement | null>;

/**
 * Paint the field, sized for `target`, into an offscreen canvas. Yields
 * after every row (back to front) so the caller can spread the work over
 * frames; returns the finished canvas, or null if `target` has no size yet.
 */
function* paintField(target: HTMLCanvasElement): Job {
  const w = target.clientWidth;
  const h = target.clientHeight;
  if (w < 1 || h < 1) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const compact = window.matchMedia(COMPACT_QUERY).matches;
  const view = FIELD_VIEWS[compact ? "compact" : "wide"];
  const { cols, rows, camY, camZ } = view;
  const { spacing, cell, front } = FIELD;
  const half = cell / 2;
  const mid = (cols - 1) / 2;

  // Camera at (0, camY, camZ) looking at (0, LOOK.y, LOOK.z): right is +x,
  // forward (0, fy, fz), up (0, -fz, fy).
  const len = Math.hypot(FIELD_LOOK.y - camY, FIELD_LOOK.z - camZ);
  const fy = (FIELD_LOOK.y - camY) / len;
  const fz = (FIELD_LOOK.z - camZ) / len;
  const focal = h / 2 / Math.tan((view.fov * Math.PI) / 360);
  const depthOf = (y: number, z: number) => (y - camY) * fy + (z - camZ) * fz;
  const project = (x: number, y: number, z: number): Point => {
    const depth = depthOf(y, z);
    const up = -(y - camY) * fz + (z - camZ) * fy;
    return [w / 2 + (x * focal) / depth, h / 2 - (up * focal) / depth];
  };

  // Terrain: the scene's height formula at rest (no scroll growth), with
  // its wandering swell parked right of the copy and a few live pings.
  const rand = prng(0x67726f77);
  const noise = simplex(rand);
  const swellX = compact ? 1.5 : 3.4;
  const swellZ = compact ? -0.6 : -1.4;
  const heights = new Float32Array(cols * rows);
  const glows = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c - mid) * spacing;
      const z = front - r * spacing;
      const swell = noise(x * 0.105, z * 0.105) * 0.5 + 0.5;
      const detail = noise(x * 0.43 + 17, z * 0.43 + 17) * 0.5 + 0.5;
      const lift = Math.exp(-((x - swellX) ** 2 + (z - swellZ) ** 2) * 0.3) * 0.55;
      const ping = rand() > 0.968 ? (1 - rand()) ** 3 : 0;
      heights[r * cols + c] = (0.05 + swell ** 2.6 * 2 + detail * 0.2) * 0.72 + lift * 1.7 + ping * 0.85;
      glows[r * cols + c] = Math.max(lift * 0.85, ping);
    }
  }

  const face = (points: readonly Point[], fill: string | CanvasGradient) => {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let k = 1; k < points.length; k++) ctx.lineTo(points[k][0], points[k][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };

  // Painter's order: back row first; in a row, outer columns before inner
  // ones (an inner column can hide the side face of the one beside it).
  const order = Array.from({ length: cols }, (_, c) => c).sort((a, b) => Math.abs(b - mid) - Math.abs(a - mid));
  const STOPS = [0, 0.6, 0.85, 1];

  for (let r = rows - 1; r >= 0; r--) {
    const z = front - r * spacing;
    const zf = z + half;
    const zb = z - half;
    for (const c of order) {
      const i = r * cols + c;
      const hgt = heights[i];
      const depth = depthOf(hgt / 2, z);
      const fog = smoothstep(8.5, 23, depth);
      if (depth < 0.5 || fog > 0.995) continue;

      const x = (c - mid) * spacing;
      const x0 = x - half;
      const x1 = x + half;
      const a = project(x0, 0, zf);
      const b = project(x1, 0, zf);
      const at = project(x0, hgt, zf);
      const bt = project(x1, hgt, zf);
      const ab = project(x0, hgt, zb);
      const bb = project(x1, hgt, zb);
      if (Math.max(b[0], bb[0]) < 0 || Math.min(a[0], ab[0]) > w || Math.min(at[1], ab[1]) > h) continue;

      const level = Math.min(1, hgt / 2.3);
      const glow = glows[i];
      // Sides: dark glass catching emerald light toward the top edge
      // (a flat average where the face is small or deep in the fog).
      const side = (v: number, shade: number) =>
        css(mix(add(scale(mix(BASE, scale(EM, 0.32), v ** 3 * (0.3 + level)), 0.5 + shade), HOT, glow * 0.3), BG, fog));
      const shaded = (bottom: Point, top: Point, shade: number) => {
        if (bottom[1] - top[1] < 8 || fog > 0.6) return side(0.75, shade);
        const g = ctx.createLinearGradient(bottom[0], bottom[1], top[0], top[1]);
        for (const v of STOPS) g.addColorStop(v, side(v, shade));
        return g;
      };

      if (x1 < 0) {
        const back = project(x1, 0, zb);
        face([b, back, bb, bt], shaded(b, bt, 0.3));
      } else if (x0 > 0) {
        const back = project(x0, 0, zb);
        face([a, back, ab, at], shaded(a, at, 0.3));
      }
      face([a, b, bt, at], shaded(a, at, 0.62));
      // Tops: the taller the column, the hotter it glows.
      face([at, bt, bb, ab], css(mix(add(mix(scale(EM, 0.16), HOT, smoothstep(0.22, 1, level)), HOT, glow), BG, fog)));
    }
    yield;
  }
  return canvas;
}

/** Main-thread time spent painting per frame, so the paint never becomes a long task. */
const FRAME_BUDGET_MS = 8;

function PosterCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let size = "";
    let job: Job | null = null;
    let frame = 0;

    const step = () => {
      frame = 0;
      if (!job) return;
      const until = performance.now() + FRAME_BUDGET_MS;
      let next = job.next();
      while (!next.done && performance.now() < until) next = job.next();
      if (!next.done) {
        frame = window.requestAnimationFrame(step);
        return;
      }
      job = null;
      const art = next.value;
      if (!art) {
        size = "";
        return;
      }
      // Swap the finished still in at once (no half-painted frames).
      canvas.width = art.width;
      canvas.height = art.height;
      canvas.getContext("2d")?.drawImage(art, 0, 0);
      canvas.dataset.painted = "";
    };

    // Fires once on observe, then on real size changes (rotation, resize).
    const ro = new ResizeObserver(() => {
      const next = `${canvas.clientWidth}x${canvas.clientHeight}`;
      if (next === size) return;
      size = next;
      job = paintField(canvas);
      if (!frame) frame = window.requestAnimationFrame(step);
    });
    ro.observe(canvas);
    return () => {
      ro.disconnect();
      window.cancelAnimationFrame(frame);
      job = null;
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="absolute inset-0 size-full opacity-0 transition-opacity duration-1000 ease-out-expo data-painted:opacity-100"
    />
  );
}

/** The hero's static stand-in gets the painted field once WebGL is ruled out for this page view. */
export function HeroPoster() {
  const off = useStore(stageStore, (s) => s.off);
  return off ? <PosterCanvas /> : null;
}
