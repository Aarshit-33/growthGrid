"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import type { CardSide } from "@/lib/cards/render";
import { cn } from "@/lib/utils";
import { FlipCard, type FlipCardProps } from "./flip-card";

/**
 * A person's card on their own page: the card, large, with a Front / Back
 * switch under it (the card also flips with a tap). The switch and the card
 * share one state, so either control keeps the other in step.
 */
export function CardViewer({
  sideLabels,
  hint,
  ...card
}: Omit<FlipCardProps, "side" | "onSideChange" | "glow"> & { sideLabels: Record<CardSide, string>; hint: string }) {
  const [side, setSide] = useState<CardSide>(card.defaultSide ?? "front");

  return (
    <div>
      <FlipCard {...card} side={side} onSideChange={setSide} glow />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 sm:mt-8">
        <div role="radiogroup" aria-label={card.flipLabel} className="inline-flex rounded-full border border-line-strong bg-white/[0.03] p-1 backdrop-blur-sm">
          {(["front", "back"] as const).map((value) => {
            const active = side === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSide(value)}
                className={cn(
                  "h-9 rounded-full px-4 text-[0.86rem] font-medium transition-[background-color,color,box-shadow] duration-300",
                  active ? "bg-em text-bg shadow-[0_8px_24px_-10px_rgb(60_228_154/0.8)]" : "text-dim hover:text-ink",
                )}
              >
                {sideLabels[value]}
              </button>
            );
          })}
        </div>
        <p className="flex items-center gap-2 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted">
          <RotateCcw className="size-3.5 text-em" aria-hidden="true" />
          {hint}
        </p>
      </div>
    </div>
  );
}
