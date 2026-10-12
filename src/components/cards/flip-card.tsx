"use client";

import { useCallback, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { CardSide } from "@/lib/cards/render";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────
   A business card you can turn over: tap, click, Enter or Space
   flips it; with a mouse it also tilts toward the pointer under
   a soft glare. Both faces are SVG markup rendered on the server
   (lib/cards/render.ts), so the artwork is in the HTML from the
   first byte and this component only adds the motion.
   ───────────────────────────────────────────────────────────── */

export interface FlipCardProps {
  /** SVG markup for each side. */
  front: string;
  back: string;
  /** CSS border-radius of the faces (lib/cards/render.ts › cardRadius). */
  radius: string;
  /** Screen-reader name of the card, e.g. "Flip the card". */
  flipLabel: string;
  /** Alt text of each side ("Aarshit's business card, front"). */
  alt: Record<CardSide, string>;
  /** Controlled side; leave out to let the card keep its own. */
  side?: CardSide;
  defaultSide?: CardSide;
  onSideChange?: (side: CardSide) => void;
  /** With a mouse, show the back while the pointer is over the card (galleries). */
  hoverFlip?: boolean;
  /** Draw the emerald pool of light under the card. */
  glow?: boolean;
  className?: string;
}

const TILT = { x: 9, y: 12 };

export function FlipCard({
  front,
  back,
  radius,
  flipLabel,
  alt,
  side: controlled,
  defaultSide = "front",
  onSideChange,
  hoverFlip = false,
  glow = false,
  className,
}: FlipCardProps) {
  const [own, setOwn] = useState<CardSide>(defaultSide);
  const side = controlled ?? own;
  const ref = useRef<HTMLDivElement>(null);

  const show = useCallback(
    (next: CardSide) => {
      if (controlled === undefined) setOwn(next);
      onSideChange?.(next);
    },
    [controlled, onSideChange],
  );
  const flip = () => show(side === "front" ? "back" : "front");

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      flip();
    }
  };

  const still = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || event.pointerType !== "mouse" || still()) return;
    const box = el.getBoundingClientRect();
    const px = (event.clientX - box.left) / box.width;
    const py = (event.clientY - box.top) / box.height;
    el.dataset.tilting = "";
    el.style.setProperty("--rx", `${((0.5 - py) * TILT.x).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${((px - 0.5) * TILT.y).toFixed(2)}deg`);
    // The glare sits on the face that's showing: mirror it on the back.
    el.style.setProperty("--glare-x", `${((side === "back" ? 1 - px : px) * 100).toFixed(1)}%`);
    el.style.setProperty("--glare-y", `${(py * 100).toFixed(1)}%`);
  };

  const onPointerEnter = (event: PointerEvent<HTMLDivElement>) => {
    if (hoverFlip && event.pointerType === "mouse") show("back");
  };

  const onPointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (el) {
      delete el.dataset.tilting;
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
    }
    if (hoverFlip && event.pointerType === "mouse") show("front");
  };

  return (
    <figure className={cn("relative", className)}>
      <div
        ref={ref}
        data-side={side}
        className="biz-card"
        style={{ "--biz-radius": radius } as CSSProperties}
        onPointerMove={onPointerMove}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
      >
        {glow && <div aria-hidden="true" className="biz-card-glow" />}
        <div
          role="button"
          tabIndex={0}
          aria-pressed={side === "back"}
          aria-label={`${flipLabel}: ${alt[side]}`}
          onClick={flip}
          onKeyDown={onKeyDown}
          className="biz-card-turn cursor-pointer rounded-[inherit] outline-none focus-visible:[&>.biz-card-face]:outline-2 focus-visible:[&>.biz-card-face]:outline-offset-4 focus-visible:[&>.biz-card-face]:outline-em"
        >
          <div className="biz-card-face" data-face="front" aria-hidden="true" dangerouslySetInnerHTML={{ __html: front }} />
          <div className="biz-card-face" data-face="back" aria-hidden="true" dangerouslySetInnerHTML={{ __html: back }} />
        </div>
      </div>
      <figcaption className="sr-only" aria-live="polite">
        {alt[side]}
      </figcaption>
    </figure>
  );
}
