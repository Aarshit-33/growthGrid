"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────
   Toasts: `toast.success("Saved")` from any client component.
   Event-based, so no provider is needed; <Toaster /> renders them.
   ───────────────────────────────────────────────────────────── */

type ToastTone = "success" | "error" | "info" | "warn";

interface ToastOptions {
  body?: string | string[];
  duration?: number;
}

interface ToastItem extends Required<Pick<ToastOptions, "duration">> {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string | string[];
}

const EVENT = "gg-admin-toast";
let sequence = 0;

function show(tone: ToastTone, title: string, options: ToastOptions = {}) {
  if (typeof window === "undefined") return;
  const duration = options.duration ?? (tone === "error" || tone === "warn" ? 9000 : 4200);
  const detail: ToastItem = { id: ++sequence, tone, title, body: options.body, duration };
  window.dispatchEvent(new CustomEvent<ToastItem>(EVENT, { detail }));
}

export const toast = {
  success: (title: string, options?: ToastOptions) => show("success", title, options),
  error: (title: string, options?: ToastOptions) => show("error", title, options),
  info: (title: string, options?: ToastOptions) => show("info", title, options),
  warn: (title: string, options?: ToastOptions) => show("warn", title, options),
};

const TONE = {
  success: { icon: CircleCheck, accent: "text-em", bar: "bg-em" },
  error: { icon: CircleAlert, accent: "text-danger", bar: "bg-danger" },
  warn: { icon: TriangleAlert, accent: "text-warn", bar: "bg-warn" },
  info: { icon: Info, accent: "text-info", bar: "bg-info" },
} as const;

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { icon: ToneIcon, accent, bar } = TONE[item.tone];

  useEffect(() => {
    if (paused) return;
    timer.current = setTimeout(() => setLeaving(true), item.duration);
    return () => clearTimeout(timer.current);
  }, [paused, item.duration]);

  useEffect(() => {
    if (!leaving) return;
    const done = setTimeout(onClose, 220);
    return () => clearTimeout(done);
  }, [leaving, onClose]);

  const lines = Array.isArray(item.body) ? item.body : item.body ? [item.body] : [];

  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={cn(
        "glass pointer-events-auto relative overflow-hidden rounded-2xl shadow-panel transition-[opacity,transform] duration-200 ease-out",
        leaving ? "translate-x-4 opacity-0" : "animate-rise-in",
      )}
    >
      <div className="flex items-start gap-3 py-3.5 pl-4 pr-2.5">
        <ToneIcon className={cn("mt-0.5 size-[1.1rem] shrink-0", accent)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[0.88rem] font-medium leading-snug text-ink">{item.title}</p>
          {lines.length === 1 && <p className="mt-1 text-[0.8rem] leading-relaxed text-muted">{lines[0]}</p>}
          {lines.length > 1 && (
            <ul className="mt-1.5 max-h-40 list-disc space-y-1 overflow-y-auto pl-4 text-[0.8rem] leading-relaxed text-muted">
              {lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={() => setLeaving(true)}
          aria-label="Dismiss"
          className="grid size-7 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-white/[0.06] hover:text-ink"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      <span
        aria-hidden="true"
        className={cn("absolute inset-x-0 bottom-0 h-px origin-left animate-grow-x opacity-70", bar)}
        style={{ ["--grow-duration" as string]: `${item.duration}ms`, animationPlayState: paused ? "paused" : "running" }}
      />
    </div>
  );
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (event: Event) => {
      const item = (event as CustomEvent<ToastItem>).detail;
      setItems((list) => [...list.slice(-3), item]);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2.5"
    >
      {items.map((item) => (
        <ToastCard key={item.id} item={item} onClose={() => setItems((list) => list.filter((t) => t.id !== item.id))} />
      ))}
    </div>
  );
}
