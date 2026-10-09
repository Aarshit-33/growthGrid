import { GFX_HINT, SOFTWARE_GL_PATTERN, WEBGL_FORCE_KEY } from "@/components/three/gfx-shared";
import type { SceneId } from "@/components/three/store";

/* ─────────────────────────────────────────────────────────────
   Intro loader gate.

   On a slow network the page's copy arrives long before the 3D
   props behind it (three.js plus the scenes are the heaviest
   download on the site). On the pages listed below, a branded
   loader covers the first screen until those scenes have drawn,
   then lifts to reveal the finished hero.

   Whether to show it is decided by an inline script that runs
   while the HTML is parsed, before the first paint, so it never
   flashes. The loader only appears where the 3D will actually run:
     · a hardware-accelerated WebGL context (same probe as gfx.ts);
       graphics acceleration off, no WebGL or a software renderer
       means no 3D, so the site shows instantly, as before;
     · no data saver and no reduced-motion preference;
     · a visible tab, and once per browser session (later loads hit
       the HTTP cache and draw quickly).
   Without JS nothing runs and the page shows as normal. If the app
   never boots, the script lifts the loader itself after the cap.

   <html data-intro>: "on" (covering) → "out" (lifting) → "done".
   intro-loader.tsx renders the script (first thing in the site chrome)
   and runs the rest. No "use client" here: plain values and functions
   any module can import.
   ───────────────────────────────────────────────────────────── */

export type IntroState = "on" | "out" | "done";

export const INTRO_ATTR = "data-intro";

/** sessionStorage flag: the intro has played in this tab. */
export const INTRO_SEEN_KEY = "gg-intro";

/** Pages that open with the intro, and the scenes each waits for (those on
 *  the first screen: a reload that restores a scrolled position skips any
 *  that are out of view). A page listed here must render <Stage />. */
export const INTRO_PAGES: Readonly<Record<string, readonly SceneId[]>> = {
  "/": ["hero"],
};

/** The loader stays at least this long after navigation start (ms), so a
 *  fast load reads as a deliberate beat rather than a flicker. */
export const INTRO_MIN_MS = 1200;

/** …and at most this long: past it the page shows with the static fallbacks
 *  still in place, and the 3D fades in over them when it arrives. */
export const INTRO_MAX_MS = 9000;

/** The lift-off transition (matches the CSS in globals.css › Intro loader). */
export const INTRO_EXIT_MS = 1100;

/** Safety net if the app never boots (e.g. its JS fails to load). */
const FAILSAFE_MS = INTRO_MAX_MS + 3000;

/** Current intro state on <html> (client only). */
export function introState(): IntroState | null {
  const value = document.documentElement.getAttribute(INTRO_ATTR);
  return value === "on" || value === "out" || value === "done" ? value : null;
}

/** The inline gate script (ES5, runs before first paint). */
export function introGateScript(): string {
  const s = JSON.stringify;
  return `(function(){try{
var d=document,h=d.documentElement,w=window;
if(${s(Object.keys(INTRO_PAGES))}.indexOf(location.pathname)<0)return;
if(sessionStorage.getItem(${s(INTRO_SEEN_KEY)}))return;
if(d.visibilityState==="hidden")return;
if(w.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
var c=navigator.connection;if(c&&c.saveData)return;
var k=${s(WEBGL_FORCE_KEY)},forced=function(){try{var p=new URLSearchParams(location.search).get("webgl");if(p==="force")localStorage.setItem(k,"force");if(p==="auto")localStorage.removeItem(k);return localStorage.getItem(k)==="force"}catch(e){return false}};
var m="lite",cv=d.createElement("canvas"),gl=cv.getContext("webgl2")||cv.getContext("webgl");
if(gl){var x=gl.getExtension("WEBGL_debug_renderer_info"),r=String(gl.getParameter(x?x.UNMASKED_RENDERER_WEBGL:gl.RENDERER)||""),l=gl.getExtension("WEBGL_lose_context");if(l)l.loseContext();if(!new RegExp(${s(SOFTWARE_GL_PATTERN)},"i").test(r)||forced())m="full"}
w[${s(GFX_HINT)}]=m;
if(m!=="full"){h.setAttribute("data-gfx","lite");return}
h.setAttribute(${s(INTRO_ATTR)},"on");
setTimeout(function(){if(h.getAttribute(${s(INTRO_ATTR)})!=="on")return;h.setAttribute(${s(INTRO_ATTR)},"out");try{sessionStorage.setItem(${s(INTRO_SEEN_KEY)},"1")}catch(e){}setTimeout(function(){h.setAttribute(${s(INTRO_ATTR)},"done")},${INTRO_EXIT_MS})},${FAILSAFE_MS});
}catch(e){}})();`;
}
