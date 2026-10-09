/* ─────────────────────────────────────────────────────────────
   Graphics probe constants shared by gfx.ts (the client probe) and
   the intro gate (layout/intro-gate.ts, an inline script that runs
   before first paint), so both classify a device the same way.
   No "use client": server components read these values too.
   ───────────────────────────────────────────────────────────── */

/** WebGL renderer strings of software rasterisers (graphics acceleration
 *  switched off, VMs, remote desktops, blocklisted GPUs). Case-insensitive. */
export const SOFTWARE_GL_PATTERN = "swiftshader|llvmpipe|softpipe|software|basic render driver";

/** localStorage key behind `?webgl=force` (remembered) and `?webgl=auto` (cleared). */
export const WEBGL_FORCE_KEY = "gg-webgl";

/** Where the intro gate leaves its probe result, so the page doesn't
 *  create a second throwaway WebGL context to ask the same question. */
export const GFX_HINT = "__ggGfx";
