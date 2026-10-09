"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { CloudUpload } from "lucide-react";
import { uploadImageAction } from "@/lib/admin/actions";
import type { PublicImage } from "@/lib/admin/types";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────
   Image uploads, shared by the image picker and the Media screen:
   a file button, drag & drop and paste, one file at a time so
   each stays under the server's body limit. The server checks
   everything again (type from the bytes, size, SVG safety).
   ───────────────────────────────────────────────────────────── */

/** Mirrors MAX_UPLOAD_BYTES in lib/admin/media.ts. */
export const MAX_UPLOAD_MB = 8;
export const UPLOAD_FOLDER = "images/uploads";
export const UPLOAD_ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/avif,image/svg+xml,.svg,.avif,.webp";
export const UPLOAD_FORMATS = "PNG, JPG, WebP, AVIF, GIF or SVG";

/** A file's URL: each part encoded (spaces, #, ?), versioned so a replaced file never shows a stale copy. */
export const fileUrl = (image: Pick<PublicImage, "src" | "modified">) =>
  `${image.src.split("/").map(encodeURIComponent).join("/")}?v=${image.modified}`;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** "images/work" → "public/images/work". */
export const folderLabel = (folder: string) => (folder ? `public/${folder}` : "public");

/** Where an upload goes while `folder` is in view: a content folder takes it; anything else uses the uploads folder. */
export const uploadTarget = (folder: string | null) =>
  folder !== null && (folder === "images" || folder.startsWith("images/")) ? folder : UPLOAD_FOLDER;

export interface UploadOutcome {
  uploaded: PublicImage[];
  failed: { name: string; error: string }[];
}

/** "photo.heic: That isn't an image…" lines for a notice. */
export function describeFailures(outcome: UploadOutcome): string {
  const { uploaded, failed } = outcome;
  const head = uploaded.length ? `${uploaded.length} of ${uploaded.length + failed.length} uploaded. ` : "";
  return head + failed.map((item) => `${item.name}: ${item.error}`).join(" ");
}

/** The upload queue: `upload(files)` sends them one by one, then calls `onDone`. */
export function useImageUpload(folder: string, onDone: (outcome: UploadOutcome) => void) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const busy = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (list: FileList | File[] | null | undefined) => {
    const files = list ? [...list] : [];
    if (files.length === 0 || busy.current) return;
    busy.current = true;
    const outcome: UploadOutcome = { uploaded: [], failed: [] };
    for (const [i, file] of files.entries()) {
      setProgress({ done: i, total: files.length });
      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        outcome.failed.push({ name: file.name, error: `It's ${formatBytes(file.size)}; the limit is ${MAX_UPLOAD_MB} MB.` });
        continue;
      }
      const data = new FormData();
      data.set("file", file);
      data.set("folder", folder);
      try {
        const result = await uploadImageAction(data);
        if (result.ok) outcome.uploaded.push(result.data);
        else outcome.failed.push({ name: file.name, error: result.error });
      } catch {
        outcome.failed.push({ name: file.name, error: "Couldn't reach the studio server. Check it's running, then try again." });
      }
    }
    busy.current = false;
    setProgress(null);
    onDone(outcome);
  };

  /** Spread on a hidden file input; `browse()` opens it. */
  const inputProps = {
    ref: inputRef,
    type: "file" as const,
    accept: UPLOAD_ACCEPT,
    multiple: true,
    hidden: true,
    tabIndex: -1,
    "aria-hidden": true,
    onChange: (event: { currentTarget: HTMLInputElement }) => {
      const input = event.currentTarget;
      const files = input.files ? [...input.files] : [];
      // Reset first, so choosing the same file again still fires a change.
      input.value = "";
      void upload(files);
    },
  };

  const label = progress ? `Uploading ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : "Upload";

  return { upload, browse: () => inputRef.current?.click(), inputProps, uploading: progress !== null, progress, label };
}

const hasFiles = (event: DragEvent) => [...event.dataTransfer.types].includes("Files");

/**
 * Drag & drop and paste for an area: spread `bind` on it and render
 * <DropOverlay> inside it while `dragging`.
 */
export function useFileDrop(onFiles: (files: File[]) => void, enabled = true) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  // A drag that leaves the window (or is cancelled) must not leave the overlay up.
  useEffect(() => {
    if (!dragging) return;
    const reset = () => {
      depth.current = 0;
      setDragging(false);
    };
    window.addEventListener("dragend", reset);
    window.addEventListener("drop", reset);
    return () => {
      window.removeEventListener("dragend", reset);
      window.removeEventListener("drop", reset);
    };
  }, [dragging]);

  // Every file drag over the area is cancelled, even while busy: otherwise the
  // browser opens the dropped file in place of the Studio (losing unsaved edits).
  const bind = {
    onDragEnter: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (!enabled) return;
      depth.current += 1;
      setDragging(true);
    },
    onDragOver: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = enabled ? "copy" : "none";
    },
    onDragLeave: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      const files = [...event.dataTransfer.files];
      if (enabled && files.length) onFiles(files);
    },
    onPaste: (event: ClipboardEvent) => {
      const files = [...event.clipboardData.files];
      if (files.length === 0) return;
      event.preventDefault();
      if (enabled) onFiles(files);
    },
  };

  return { dragging, bind };
}

/** Shown over the area while files are dragged onto it. */
export function DropOverlay({ folder, className }: { folder: string; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-3 z-20 grid animate-rise-in place-items-center rounded-panel border-2 border-dashed border-em/60 bg-bg/85 text-center backdrop-blur-sm [animation-duration:0.3s]",
        className,
      )}
    >
      <div>
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-em/30 bg-em/10 text-em shadow-[0_0_40px_-10px_rgb(60_228_154/0.8)]">
          <CloudUpload className="size-6" />
        </span>
        <p className="mt-4 font-display text-[1.15rem] font-medium tracking-[-0.02em] text-ink">Drop to upload</p>
        <p className="mt-1 text-[0.82rem] text-muted">
          Into <code className="font-mono text-[0.76rem] text-dim">{folderLabel(folder)}</code> · {UPLOAD_FORMATS} · up to {MAX_UPLOAD_MB} MB each
        </p>
      </div>
    </div>
  );
}
