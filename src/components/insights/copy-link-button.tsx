"use client";

import { Check, Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Fallback for browsers/contexts without the async Clipboard API. */
function legacyCopy(text: string) {
  const previous = document.activeElement as HTMLElement | null;
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  field.remove();
  previous?.focus({ preventScroll: true });
  return ok;
}

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
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      ok = legacyCopy(url);
    }
    if (!ok) return;
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
