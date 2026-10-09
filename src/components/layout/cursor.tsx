"use client";

import { motion, useMotionValue, useSpring } from "motion/react";
import { useEffect, useState } from "react";
import { QUERIES, useMediaQuery } from "@/hooks/use-media-query";

type CursorState = "hidden" | "default" | "hover" | "label";

/** Targets that grow the ring. With the native cursor gone this is the only
 *  hover cue, so disabled buttons are skipped and Tailwind's cursor classes
 *  stand in for the pointer/grab cursors they used to show. */
const INTERACTIVE =
  "a, button:not(:disabled), [role='button'], [role='tab'], summary, label, input:not(:disabled), select, textarea, .cursor-pointer, .cursor-grab, [data-cursor]";

/** Set on <html> while the custom cursor is live; globals.css hides the native one. */
const ROOT_FLAG = "data-custom-cursor";

/**
 * Custom cursor (desktop mouse only, off for reduced motion): a green dot
 * pinned to the pointer inside a trailing ring. It replaces the native
 * cursor, which is hidden site-wide while it's mounted, so touch, reduced
 * motion and no-JS visitors keep their normal cursor.
 * Elements can show a label in the ring with `data-cursor="View"`.
 */
export function Cursor() {
  const fine = useMediaQuery(QUERIES.finePointer);
  const reduce = useMediaQuery(QUERIES.reducedMotion);
  const enabled = fine && !reduce;

  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const sx = useSpring(x, { stiffness: 520, damping: 42, mass: 0.5 });
  const sy = useSpring(y, { stiffness: 520, damping: 42, mass: 0.5 });
  const [state, setState] = useState<CursorState>("hidden");
  const [label, setLabel] = useState("");
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    root.setAttribute(ROOT_FLAG, "");
    let visible = false;

    const sync = (el: EventTarget | null) => {
      const target = el instanceof Element ? el.closest(INTERACTIVE) : null;
      const text = target?.getAttribute("data-cursor");
      if (text) {
        setLabel(text);
        setState("label");
      } else {
        setState(target ? "hover" : "default");
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      x.set(e.clientX);
      y.set(e.clientY);
      if (visible) return;
      // First move since load or since re-entering the window: start the ring
      // under the pointer instead of springing in from its last position.
      visible = true;
      sx.jump(e.clientX);
      sy.jump(e.clientY);
      sync(e.target);
    };
    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "mouse") sync(e.target);
    };
    const onLeave = () => {
      visible = false;
      setState("hidden");
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse") setPressed(true);
    };
    const onUp = () => setPressed(false);

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerover", onOver, { passive: true });
    root.addEventListener("pointerleave", onLeave);
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    window.addEventListener("blur", onUp);
    return () => {
      root.removeAttribute(ROOT_FLAG);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerover", onOver);
      root.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", onUp);
    };
  }, [enabled, x, y, sx, sy]);

  if (!enabled) return null;

  const size = state === "label" ? 92 : state === "hover" ? 52 : 26;
  const hidden = state === "hidden";

  return (
    <>
      {/* Ring: trails the pointer on a spring, tightens while pressed. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[110]"
        style={{ x: sx, y: sy }}
      >
        <motion.div
          className="grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border"
          animate={{
            width: size,
            height: size,
            scale: pressed ? 0.82 : 1,
            opacity: hidden ? 0 : 1,
            backgroundColor:
              state === "label" ? "rgb(60 228 154 / 1)" : state === "hover" ? "rgb(60 228 154 / 0.08)" : "rgb(60 228 154 / 0)",
            borderColor: state === "label" ? "rgb(60 228 154 / 1)" : "rgb(60 228 154 / 0.55)",
          }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        >
          {state === "label" && (
            <motion.span
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              className="font-mono text-[0.64rem] font-medium uppercase tracking-[0.14em] text-bg"
            >
              {label}
            </motion.span>
          )}
        </motion.div>
      </motion.div>

      {/* Dot: pinned to the pointer with no lag, so it marks the exact click
          point. The dark halo keeps it visible on emerald primary buttons;
          it tucks away while the ring shows a label. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[110]"
        style={{ x, y }}
      >
        <motion.div
          className="size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-em shadow-[0_0_0_1.5px_rgb(4_7_10/0.75),0_0_12px_rgb(60_228_154/0.75)]"
          initial={false}
          animate={{
            scale: hidden || state === "label" ? 0 : 1,
            opacity: hidden ? 0 : 1,
          }}
          transition={{ type: "spring", stiffness: 600, damping: 34 }}
        />
      </motion.div>
    </>
  );
}
