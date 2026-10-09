import type { ReactNode } from "react";
import type { Settings } from "@/lib/schemas";
import { cn } from "@/lib/utils";

/** Small mono pill for categories, tags and metadata. */
export function Tag({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: "default" | "em" | "solid";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-[0.66rem] font-medium uppercase leading-none tracking-[0.12em]",
        tone === "default" && "border-line bg-white/[0.025] text-muted",
        tone === "em" && "border-em/30 bg-em/[0.07] text-em",
        tone === "solid" && "border-transparent bg-em text-bg",
        className,
      )}
    >
      {children}
    </span>
  );
}

const DOT: Record<Settings["availability"]["status"], string> = {
  open: "bg-em animate-pulse-dot",
  limited: "bg-warn",
  closed: "bg-danger",
};

/** Live availability badge ("Booking new projects for Q4 2026"). */
export function Availability({
  availability,
  className,
}: {
  availability: Settings["availability"];
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 rounded-full border border-line bg-white/[0.03] px-3.5 py-1.5 text-sm text-dim",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", DOT[availability.status])} />
      {availability.label}
    </span>
  );
}
