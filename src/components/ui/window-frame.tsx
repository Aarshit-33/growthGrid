import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Terminal-style window chrome used for live "system" visuals. */
export function WindowFrame({
  label,
  status,
  children,
  className,
  bodyClassName,
}: {
  label: string;
  status?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={cn("card overflow-hidden shadow-panel", className)}>
      <div className="flex items-center gap-3 border-b border-line bg-white/[0.015] px-4 py-3">
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-surface-3" />
          <span className="size-2.5 rounded-full bg-surface-3" />
          <span className="size-2.5 rounded-full bg-surface-3" />
        </span>
        <span className="label-mono truncate normal-case tracking-[0.06em]">{label}</span>
        {status && <span className="ml-auto flex shrink-0 items-center">{status}</span>}
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}
