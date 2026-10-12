"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "./locale-context";
import { scrollToTarget } from "./smooth-scroll";

/** Live clock for the studio's timezone (only rendered when configured). */
export function StudioClock({ timezone, label }: { timezone: string; label: string }) {
  const locale = useLocale();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const time = now
    ? now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: timezone })
    : "--:--";

  return (
    <p className="flex items-center gap-2 font-mono text-xs text-muted">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-em" />
      {label} <time suppressHydrationWarning>{time}</time>
    </p>
  );
}

export function BackToTop({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => scrollToTarget(0)}
      className="group inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-muted transition-colors hover:text-hot"
    >
      {label}
      <span className="grid size-8 place-items-center rounded-full border border-line transition-colors group-hover:border-em/60">
        <ArrowUp aria-hidden="true" className="size-3.5 transition-transform duration-500 ease-out-expo group-hover:-translate-y-0.5" />
      </span>
    </button>
  );
}
