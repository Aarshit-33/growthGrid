"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

/** Copies a code block's source; the label flips to the copied text and is announced politely. */
export function CopyCodeButton({
  code,
  label,
  copiedLabel,
  ariaLabel,
}: {
  code: string;
  label: string;
  copiedLabel: string;
  /** Screen-reader name before copying, e.g. "Copy code". */
  ariaLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    if (!(await copyText(code))) return;
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? copiedLabel : ariaLabel}
        className={cn(
          "-my-1 inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[0.66rem] font-medium uppercase tracking-[0.12em] transition-colors duration-300",
          copied ? "border-em/50 bg-em/[0.08] text-em" : "border-line text-muted hover:border-em/50 hover:text-ink",
        )}
      >
        <span aria-hidden="true" className="relative size-3.5">
          <Copy
            className={cn(
              "absolute inset-0 size-3.5 transition-[opacity,scale] duration-300 ease-out-expo",
              copied && "scale-50 opacity-0",
            )}
          />
          <Check
            className={cn(
              "absolute inset-0 size-3.5 transition-[opacity,scale] duration-300 ease-out-expo",
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
