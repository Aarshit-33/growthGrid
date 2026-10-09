"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SceneSlot } from "./slot";
import { JOURNEY_ZONES, journey } from "./store";

/**
 * The home page's story backdrop: a viewport-sized slot fixed behind the
 * content, where the shared stage draws the "ground to summit" journey.
 * It only exists (display) while one of its chapters is near the screen,
 * so the render loop can sleep through the hero, principles, FAQ and so on.
 */
export function JourneyBackdrop({ accents }: { accents: string[] }) {
  const [on, setOn] = useState(false);
  // A chapter is actually on screen (not just near): the veil fades in.
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const zones = JOURNEY_ZONES.map((selector) => document.querySelector(selector)).filter(
      (el): el is Element => el !== null,
    );
    const near = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) near.add(entry.target);
          else near.delete(entry.target);
        }
        setOn(near.size > 0);
      },
      { rootMargin: "20% 0px" },
    );
    zones.forEach((zone) => io.observe(zone));
    const seen = new Set<Element>();
    const viewIo = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) seen.add(entry.target);
          else seen.delete(entry.target);
        }
        setInView(seen.size > 0);
      },
      { rootMargin: "-12% 0px" },
    );
    zones.forEach((zone) => viewIo.observe(zone));

    // The summit step turns solid while a CTA action is hovered or focused.
    const summitZone = document.querySelector(JOURNEY_ZONES[JOURNEY_ZONES.length - 1]);
    const isAction = (target: EventTarget | null) => target instanceof Element && target.closest("a,button") !== null;
    const onOver = (e: Event) => {
      journey.cta = isAction(e.target);
    };
    const onOut = (e: Event) => {
      if (!isAction((e as PointerEvent | FocusEvent).relatedTarget)) journey.cta = false;
    };
    summitZone?.addEventListener("pointerover", onOver);
    summitZone?.addEventListener("pointerout", onOut);
    summitZone?.addEventListener("focusin", onOver);
    summitZone?.addEventListener("focusout", onOut);

    return () => {
      io.disconnect();
      viewIo.disconnect();
      summitZone?.removeEventListener("pointerover", onOver);
      summitZone?.removeEventListener("pointerout", onOut);
      summitZone?.removeEventListener("focusin", onOver);
      summitZone?.removeEventListener("focusout", onOut);
      journey.cta = false;
    };
  }, []);

  return (
    <div aria-hidden="true" className={cn("pointer-events-none fixed inset-x-0 top-0 h-[100lvh]", !on && "hidden")}>
      <SceneSlot scene={{ id: "journey", data: { accents } }} />
      {/* Legibility veil between the 3D story and the copy: an even tint,
          heavier on the copy side (left) on wide screens and edge to edge
          on phones, where the text spans the whole width. */}
      <div className={cn("absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none", !inView && "opacity-0")}>
        <div className="absolute inset-0 bg-[rgb(4_7_10/0.5)] lg:bg-[linear-gradient(90deg,rgb(4_7_10/0.62)_0%,rgb(4_7_10/0.44)_45%,rgb(4_7_10/0.26)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(4_7_10/0.55)_0%,transparent_22%,transparent_78%,rgb(4_7_10/0.55)_100%)]" />
      </div>
    </div>
  );
}
