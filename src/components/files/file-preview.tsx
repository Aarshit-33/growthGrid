"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, X } from "lucide-react";
import { formatBytes, formatDay, KIND_NAMES, type PublicFile } from "@/lib/files/shared";
import { cn } from "@/lib/utils";
import { FileStage } from "./file-thumb";

/* ─────────────────────────────────────────────────────────────
   File library preview: a full-screen sheet on phones, a large
   panel on desktop. Native <dialog> (focus trap, Esc to close);
   ← / → step through the files currently shown on the page.
   ───────────────────────────────────────────────────────────── */

interface PreviewProps {
  /** The file to show; null closes the dialog. */
  file: PublicFile | null;
  /** Its position among the files shown, and how many there are. */
  position: number;
  total: number;
  copied: boolean;
  onCopy: () => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

function RoundButton({
  label,
  onClick,
  disabled,
  initialFocus,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Focused when the dialog opens. */
  initialFocus?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      data-initial-focus={initialFocus || undefined}
      className="grid size-10 shrink-0 place-items-center rounded-full border border-line text-muted transition-[border-color,color,background-color] duration-300 hover:border-line-strong hover:bg-white/[0.04] hover:text-ink disabled:opacity-35"
    >
      {children}
    </button>
  );
}

const action =
  "inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-full px-4 text-[0.88rem] font-medium transition-[background-color,border-color,color,box-shadow] duration-300";

function PreviewBody({ file, position, total, copied, onCopy, onPrev, onNext, onClose }: PreviewProps & { file: PublicFile }) {
  // Stays mounted while you step through files (so keyboard focus stays put); only the
  // stage is keyed by file, and a measurement only counts for the file it was taken from.
  const [measured, setMeasured] = useState<{ src: string; size: string } | null>(null);
  const dimensions = measured?.src === file.src ? measured.size : null;
  // Stable per file: FileStage's image/video ref callbacks depend on it.
  const measure = useCallback(
    (size: string) => setMeasured((prev) => (prev?.src === file.src && prev.size === size ? prev : { src: file.src, size })),
    [file.src],
  );
  const details: [string, string][] = [
    ["Type", file.ext ? `${KIND_NAMES[file.kind]} · .${file.ext}` : KIND_NAMES[file.kind]],
    ["Size", formatBytes(file.bytes)],
    ...(dimensions ? ([["Dimensions", dimensions]] as [string, string][]) : []),
    ["Modified", formatDay(file.modified)],
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg-2 md:rounded-panel md:border md:border-line-strong md:shadow-[0_40px_120px_-30px_rgb(0_0_0/0.9)] motion-safe:animate-rise-in motion-safe:[animation-duration:0.45s]">
      <header className="flex items-center gap-2 border-b border-line py-3 pl-4 pr-3 md:gap-3 md:py-4 md:pl-6 md:pr-4">
        <div className="min-w-0 flex-1">
          <p className="label-mono tabular-nums">
            {position + 1} / {total}
          </p>
          <h2 id="file-preview-title" className="mt-1 truncate font-display text-[1.05rem] leading-tight text-ink md:text-xl">
            {file.name}
          </h2>
        </div>
        {total > 1 && (
          <>
            <RoundButton label="Previous file" onClick={onPrev}>
              <ChevronLeft aria-hidden="true" className="size-4" />
            </RoundButton>
            <RoundButton label="Next file" onClick={onNext}>
              <ChevronRight aria-hidden="true" className="size-4" />
            </RoundButton>
          </>
        )}
        <RoundButton label="Close preview" onClick={onClose} initialFocus>
          <X aria-hidden="true" className="size-4" />
        </RoundButton>
      </header>

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_19rem] md:grid-rows-1">
        <div className="relative min-h-0 overflow-hidden">
          <FileStage key={file.src} file={file} onMeasure={measure} />
        </div>

        <aside className="flex flex-col gap-5 border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:overflow-y-auto md:border-l md:border-t-0 md:p-6">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-1 md:gap-y-4">
            {details.map(([term, value]) => (
              <div key={term} className="min-w-0">
                <dt className="label-mono">{term}</dt>
                <dd className="mt-1 truncate text-[0.9rem] text-dim">{value}</dd>
              </div>
            ))}
            <div className="col-span-2 min-w-0 md:col-span-1">
              <dt className="label-mono">Path</dt>
              <dd className="mt-1 font-mono text-[0.78rem] leading-relaxed text-dim [overflow-wrap:anywhere]">/{file.path}</dd>
            </div>
          </dl>

          <div className="mt-auto flex flex-col gap-2">
            <a
              href={file.src}
              download={file.name}
              className={cn(
                action,
                "bg-em text-bg shadow-[0_0_0_1px_rgb(60_228_154/0.35),0_14px_40px_-14px_rgb(60_228_154/0.7)] hover:bg-hot",
              )}
            >
              <Download aria-hidden="true" className="size-4" />
              Download
              <span className="font-mono text-[0.72rem] font-normal opacity-70">{formatBytes(file.bytes)}</span>
            </a>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onCopy}
                className={cn(action, "border border-line-strong text-ink hover:border-em/60 hover:bg-em/[0.07]")}
              >
                {copied ? <Check aria-hidden="true" className="size-4 text-em" /> : <Copy aria-hidden="true" className="size-4" />}
                <span aria-live="polite">{copied ? "Copied" : "Copy link"}</span>
              </button>
              <a
                href={file.src}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(action, "border border-line-strong text-ink hover:border-em/60 hover:bg-em/[0.07]")}
              >
                <ExternalLink aria-hidden="true" className="size-4" />
                Open
              </a>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function FilePreview(props: PreviewProps) {
  const { file, onPrev, onNext, onClose } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const open = file !== null;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Start on Close rather than the first button (Previous), so Enter just closes.
      dialog.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  // While open: the page behind doesn't scroll, and ← / → step through the files.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      // Media controls use the arrow keys to seek.
      if (event.target instanceof Element && event.target.closest("audio, video, input, select, textarea")) return;
      if (event.key === "ArrowLeft") onPrev();
      else if (event.key === "ArrowRight") onNext();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onPrev, onNext]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="file-preview-title"
      onClose={onClose}
      // A click on the backdrop lands on the <dialog> itself.
      onClick={(event) => event.target === ref.current && onClose()}
      className="m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-transparent p-0 text-ink backdrop:bg-bg/80 backdrop:backdrop-blur-md md:m-auto md:h-[min(54rem,calc(100dvh-3rem))] md:w-[min(80rem,calc(100vw-3rem))]"
    >
      {file && <PreviewBody {...props} file={file} />}
    </dialog>
  );
}
