"use client";

import { Check, Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

/** Copies the canonical article URL; confirmation is announced politely. */
export function CopyLinkButton({
  url,
  label,
  copiedLabel,
  className,
}: {
  url: string;
  label: string;
  copiedLabel: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    if (!(await copyText(url))) return;
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2400);
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors duration-300",
          copied ? "border-em/50 bg-em/[0.08] text-em" : "border-line-strong text-dim hover:border-em/50 hover:text-ink",
          className,
        )}
      >
        <span aria-hidden="true" className="relative size-4">
          <Link2
            className={cn(
              "absolute inset-0 size-4 transition-[opacity,scale] duration-300 ease-out-expo",
              copied && "scale-50 opacity-0",
            )}
          />
          <Check
            className={cn(
              "absolute inset-0 size-4 transition-[opacity,scale] duration-300 ease-out-expo",
              !copied && "scale-50 opacity-0",
            )}
          />
        </span>
        {copied ? copiedLabel : label}
      </button>
      <span role="status" className="sr-only">
        {copied ? copiedLabel : ""}
      </span>
    </>
  );
}
