"use client";

import { useEffect } from "react";
import { GFX_HINT, SOFTWARE_GL_PATTERN, WEBGL_FORCE_KEY } from "./gfx-shared";
import { createStore } from "./store";

/* ─────────────────────────────────────────────────────────────
   Graphics capability, probed once per page load.

   "full": a hardware-accelerated WebGL context is available.
   "lite": no WebGL, or WebGL drawn by a software rasteriser (the
   browser's "Use graphics acceleration" switched off, VMs, remote
   desktops, blocklisted GPUs). Every pixel is painted on the CPU
   there, so:
     · the 3D stage never mounts and each scene keeps its static
       fallback (see lazy.tsx / slot.tsx);
     · <html data-gfx="lite"> swaps CSS effects that repaint on every
       scroll frame (backdrop blurs, the film grain) for static ones;
     · smooth scrolling and the starfield step down (native scroll,
       no parallax).
   `?webgl=force` opts back in (remembered per browser); `?webgl=auto`
   restores the default detection.
   This module must never import three.js; it ships with the initial
   bundle.
   ───────────────────────────────────────────────────────────── */

export type GfxMode = "pending" | "full" | "lite";

export const gfxStore = createStore({ mode: "pending" as GfxMode });

const SOFTWARE_GL = new RegExp(SOFTWARE_GL_PATTERN, "i");
const FORCE_KEY = WEBGL_FORCE_KEY;

function forcedOn(): boolean {
  try {
    const param = new URLSearchParams(window.location.search).get("webgl");
    if (param === "force") window.localStorage.setItem(FORCE_KEY, "force");
    if (param === "auto") window.localStorage.removeItem(FORCE_KEY);
    return window.localStorage.getItem(FORCE_KEY) === "force";
  } catch {
    return false;
  }
}

function hardwareWebgl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return false;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
    // Release the probe context right away; browsers cap live contexts.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return !SOFTWARE_GL.test(renderer) || forcedOn();
  } catch {
    return false;
  }
}

/** Probe once (it creates a throwaway WebGL context); later calls return the cached result.
 *  Pages with the intro were already probed before first paint (layout/intro-gate.ts). */
export function probeGfx(): Exclude<GfxMode, "pending"> {
  const known = gfxStore.get().mode;
  if (known !== "pending") return known;
  const hint = (window as Window & { [GFX_HINT]?: unknown })[GFX_HINT];
  const mode = hint === "full" || hint === "lite" ? hint : hardwareWebgl() ? "full" : "lite";
  document.documentElement.dataset.gfx = mode;
  gfxStore.set({ mode });
  return mode;
}

/** Run `fn` once the main thread is idle (Safari: after a short timeout). Returns a cancel function. */
export function onIdle(fn: () => void, timeout = 1500): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(fn, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(fn, 300);
  return () => window.clearTimeout(id);
}

/**
 * Classifies the device's graphics once per page load, on idle, for every
 * page (not only those with a 3D stage, which share the cached probe).
 * Mounted once in the root layout; renders nothing.
 */
export function GfxProbe() {
  useEffect(
    () =>
      onIdle(() => {
        probeGfx();
      }),
    [],
  );
  return null;
}
