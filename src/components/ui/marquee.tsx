import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Infinite CSS marquee. The track holds two copies and slides by -50%, so
 * the loop is seamless. The duplicate is aria-hidden; hover pauses.
 */
export function Marquee({
  items,
  duration = 40,
  reverse = false,
  className,
  itemClassName,
  separator,
}: {
  items: ReactNode[];
  /** Seconds per loop. */
  duration?: number;
  reverse?: boolean;
  className?: string;
  itemClassName?: string;
  separator?: ReactNode;
}) {
  const row = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
      {items.map((item, i) => (
        <li key={i} className={cn("flex shrink-0 items-center", itemClassName)}>
          {item}
          {separator && <span aria-hidden="true">{separator}</span>}
        </li>
      ))}
    </ul>
  );

  return (
    <div className={cn("group fade-x flex overflow-hidden", className)}>
      <div
        className="flex w-max animate-marquee group-hover:[animation-play-state:paused]"
        style={
          {
            "--marquee-duration": `${duration}s`,
            animationDirection: reverse ? "reverse" : undefined,
          } as CSSProperties
        }
      >
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
