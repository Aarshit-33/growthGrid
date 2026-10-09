"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SceneBoundary } from "./boundary";
import { disableStage, pointerFor, readyKey, registerSlot, slotKey, stageStore, useStore } from "./store";
import type { SceneProps } from "./types";

/* The drei <View> + scenes chunk loads only once the stage is enabled. */
const SceneView = dynamic(() => import("./scene-view"), { ssr: false, loading: () => null });

const INTERACTIVE = "a,button,input,select,textarea,label,[role='tab'],[role='button']";

/**
 * A rectangle the shared WebGL stage draws a scene into. It is
 * server-rendered with a CSS fallback that fades out once the scene has
 * drawn its first frame. It stays decorative (aria-hidden): every piece
 * of information lives in the DOM beside it.
 */
export function SceneSlot({
  scene,
  fallback,
  className,
  instance,
}: {
  scene: SceneProps;
  fallback?: ReactNode;
  className?: string;
  /** Distinguishes slots when one scene type appears several times on a page. */
  instance?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const enabled = useStore(stageStore, (s) => s.enabled);
  const ready = useStore(stageStore, (s) => s[readyKey(scene.id)]);
  const id = scene.id;

  useEffect(() => {
    const el = ref.current;
    return el ? registerSlot(slotKey(id, instance), el) : undefined;
  }, [id, instance]);

  // A slot hidden by layout (e.g. a desktop-only panel on a phone) has no
  // size: don't build or tick a scene nobody can see.
  const [sized, setSized] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry?.contentRect;
      setSized(!!r && r.width > 0 && r.height > 0);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pointer → normalised slot coordinates. Listening on window means
  // content layered above the slot (headings, buttons) never blocks it.
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    const p = pointerFor(id, instance);

    const locate = (e: PointerEvent | MouseEvent) => {
      const r = el.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (inside) {
        p.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        p.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
        p.at = performance.now();
      }
      return inside;
    };
    const onMove = (e: PointerEvent) => {
      p.type = e.pointerType;
      p.inside = locate(e);
    };
    const onClick = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
      if (locate(e)) p.taps += 1;
    };
    const onLeave = () => {
      p.inside = false;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    window.addEventListener("click", onClick, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
      window.removeEventListener("click", onClick);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      onLeave();
    };
  }, [enabled, id, instance]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-scene={id}
      data-scene-live={ready ? "" : undefined}
      className={cn("pointer-events-none absolute inset-0", className)}
    >
      {fallback && (
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-[1600ms] ease-out-expo",
            ready && "opacity-0",
          )}
        >
          {fallback}
        </div>
      )}
      {enabled && sized && (
        <SceneBoundary onError={disableStage}>
          <SceneView scene={scene} track={ref} />
        </SceneBoundary>
      )}
    </div>
  );
}
