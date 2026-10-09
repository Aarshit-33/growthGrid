"use client";

import { useCallback, useEffect, useState, type CSSProperties, type SyntheticEvent } from "react";
import {
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileImage,
  FileText,
  FileType,
  FileVideo,
  Play,
  type LucideIcon,
} from "lucide-react";
import { formatBytes, type FileKind, type PublicFile } from "@/lib/files/shared";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────
   File library previews, per kind of file: <FileThumb> fills a
   card, <FileStage> fills the preview dialog. Both fill their
   (positioned) parent.
   ───────────────────────────────────────────────────────────── */

/** "1600 × 1000", reported once an image or video knows its size. */
export type Measure = (size: string) => void;
const sizeLabel = (width: number, height: number) => `${width} × ${height}`;

/** Transparency checkerboard behind images that may have see-through areas. */
const CHECKERBOARD: CSSProperties = {
  backgroundColor: "var(--color-surface)",
  backgroundImage:
    "conic-gradient(var(--color-surface-2) 25%, transparent 0 50%, var(--color-surface-2) 0 75%, transparent 0)",
  backgroundSize: "18px 18px",
};

/** Photos fill their card; everything else (icons, logos, screenshots) is shown whole. */
const PHOTO_TYPES = new Set(["avif", "jpeg", "jpg", "webp"]);

const KIND_ICONS: Record<FileKind, LucideIcon> = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  pdf: FileText,
  font: FileType,
  text: FileText,
  archive: FileArchive,
  other: FileIcon,
};

/** Text files bigger than this show only their start in the dialog. */
const TEXT_PREVIEW_LIMIT = 256 * 1024;

/* ── Shared pieces ──────────────────────────────────────────── */

/** An image's pixel size, also when it loaded before hydration (no onLoad then). */
function useImageMeasure(onMeasure?: Measure) {
  const ref = useCallback(
    (img: HTMLImageElement | null) => {
      if (img?.complete && img.naturalWidth) onMeasure?.(sizeLabel(img.naturalWidth, img.naturalHeight));
    },
    [onMeasure],
  );
  const onLoad = (event: SyntheticEvent<HTMLImageElement>) =>
    onMeasure?.(sizeLabel(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight));
  return { ref, onLoad };
}

/** Same for a video, from its metadata. */
function useVideoMeasure(onMeasure?: Measure) {
  const ref = useCallback(
    (video: HTMLVideoElement | null) => {
      if (video && video.readyState >= 1 && video.videoWidth) onMeasure?.(sizeLabel(video.videoWidth, video.videoHeight));
    },
    [onMeasure],
  );
  const onLoadedMetadata = (event: SyntheticEvent<HTMLVideoElement>) =>
    onMeasure?.(sizeLabel(event.currentTarget.videoWidth, event.currentTarget.videoHeight));
  return { ref, onLoadedMetadata };
}

/** Loads a font file under its own family name; null until it's ready (or if it can't load). */
function useFontFamily(file: PublicFile) {
  const [family, setFamily] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const name = `gg-file-${file.path.replace(/[^a-z0-9]+/gi, "-")}`;
    new FontFace(name, `url("${file.src}")`)
      .load()
      .then((face) => {
        if (!live) return;
        document.fonts.add(face);
        setFamily(name);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [file.path, file.src]);
  return family;
}

/** Big file-type icon with the extension, for files without a visual preview. */
function IconTile({ file, large = false }: { file: PublicFile; large?: boolean }) {
  const Icon = KIND_ICONS[file.kind];
  return (
    <div className="absolute inset-0 grid place-items-center bg-surface-2">
      <div aria-hidden="true" className="absolute left-1/2 top-1/2 size-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-em/[0.08] blur-2xl" />
      <div className="relative flex flex-col items-center gap-3">
        <Icon aria-hidden="true" strokeWidth={1.25} className={cn("text-muted", large ? "size-20" : "size-11")} />
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-faint">{file.ext || "file"}</span>
      </div>
    </div>
  );
}

/* ── Card previews ──────────────────────────────────────────── */

function ImageThumb({ file, onMeasure }: { file: PublicFile; onMeasure?: Measure }) {
  const [failed, setFailed] = useState(false);
  const measure = useImageMeasure(onMeasure);
  if (failed) return <IconTile file={file} />;
  const photo = PHOTO_TYPES.has(file.ext);
  return (
    <div className="absolute inset-0" style={photo ? undefined : CHECKERBOARD}>
      {/* eslint-disable-next-line @next/next/no-img-element -- previews of /public files in any format and size */}
      <img
        {...measure}
        src={file.src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
        className={cn(
          "size-full transition-transform duration-700 ease-out-expo group-hover/card:scale-[1.04]",
          photo ? "object-cover" : "object-contain p-5 sm:p-6",
        )}
      />
    </div>
  );
}

function VideoThumb({ file, onMeasure }: { file: PublicFile; onMeasure?: Measure }) {
  const measure = useVideoMeasure(onMeasure);
  return (
    <div className="absolute inset-0 bg-black">
      <video
        {...measure}
        // #t: the browser fetches just enough to paint a first frame.
        src={`${file.src}#t=0.1`}
        muted
        playsInline
        preload="metadata"
        tabIndex={-1}
        className="size-full object-cover transition-transform duration-700 ease-out-expo group-hover/card:scale-[1.04]"
      />
      <div aria-hidden="true" className="absolute inset-0 grid place-items-center">
        <span className="grid size-11 place-items-center rounded-full border border-white/15 bg-bg/60 text-ink backdrop-blur-md">
          <Play className="size-4 translate-x-px" fill="currentColor" />
        </span>
      </div>
    </div>
  );
}

function FontThumb({ file }: { file: PublicFile }) {
  const family = useFontFamily(file);
  return (
    <div className="absolute inset-0 grid place-items-center bg-surface-2">
      <span
        style={{ fontFamily: family ? `"${family}"` : undefined }}
        className={cn("text-[3.5rem] leading-none text-ink transition-opacity duration-500", family ? "opacity-100" : "opacity-30")}
      >
        Aa
      </span>
    </div>
  );
}

function TextThumb({ snippet }: { snippet: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-surface-2 p-3.5">
      <pre className="whitespace-pre-wrap font-mono text-[0.6rem] leading-[1.6] text-muted [overflow-wrap:anywhere]">{snippet}</pre>
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-surface-2 to-transparent" />
    </div>
  );
}

/** A card's preview. `onMeasure` receives the pixel size of images and videos. */
export function FileThumb({ file, onMeasure }: { file: PublicFile; onMeasure?: Measure }) {
  switch (file.kind) {
    case "image":
      return <ImageThumb file={file} onMeasure={onMeasure} />;
    case "video":
      return <VideoThumb file={file} onMeasure={onMeasure} />;
    case "font":
      return <FontThumb file={file} />;
    case "text":
      return file.snippet ? <TextThumb snippet={file.snippet} /> : <IconTile file={file} />;
    default:
      return <IconTile file={file} />;
  }
}

/* ── Dialog previews ────────────────────────────────────────── */

function ImageStage({ file, onMeasure }: { file: PublicFile; onMeasure?: Measure }) {
  const measure = useImageMeasure(onMeasure);
  return (
    <div className="absolute inset-0 flex items-center justify-center p-4 md:p-8" style={CHECKERBOARD}>
      {/* eslint-disable-next-line @next/next/no-img-element -- previews of /public files in any format and size */}
      <img
        {...measure}
        src={file.src}
        alt={file.name}
        decoding="async"
        className="max-h-full max-w-full object-contain shadow-[0_30px_80px_-30px_rgb(0_0_0/0.85)]"
      />
    </div>
  );
}

function VideoStage({ file, onMeasure }: { file: PublicFile; onMeasure?: Measure }) {
  const measure = useVideoMeasure(onMeasure);
  return (
    <video
      {...measure}
      src={file.src}
      controls
      playsInline
      preload="metadata"
      className="absolute inset-0 size-full bg-black object-contain"
    />
  );
}

function AudioStage({ file }: { file: PublicFile }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 bg-surface-2 p-6">
      <div aria-hidden="true" className="absolute left-1/2 top-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-em/[0.07] blur-3xl" />
      <FileAudio aria-hidden="true" strokeWidth={1.1} className="relative size-20 text-muted" />
      <audio src={file.src} controls preload="metadata" className="relative w-full max-w-md" />
    </div>
  );
}

function FontStage({ file }: { file: PublicFile }) {
  const family = useFontFamily(file);
  return (
    <div
      style={{ fontFamily: family ? `"${family}"` : undefined }}
      className={cn(
        "absolute inset-0 flex flex-col justify-center gap-6 overflow-auto bg-surface-2 p-6 text-ink transition-opacity duration-500 md:p-12",
        family ? "opacity-100" : "opacity-30",
      )}
    >
      <p className="text-[clamp(3rem,9vw,6.5rem)] leading-none">Aa Gg Rr</p>
      <p className="text-[clamp(1.1rem,2.4vw,1.6rem)] leading-snug text-dim [overflow-wrap:anywhere]">
        ABCDEFGHIJKLMNOPQRSTUVWXYZ
        <br />
        abcdefghijklmnopqrstuvwxyz
        <br />
        0123456789 &amp; ? ! @ ₹ %
      </p>
      <p className="text-base text-muted">The quick brown fox jumps over the lazy dog.</p>
    </div>
  );
}

function TextStage({ file }: { file: PublicFile }) {
  const [text, setText] = useState<string | null>(null);
  const tooBig = file.bytes > TEXT_PREVIEW_LIMIT;
  useEffect(() => {
    if (tooBig) return;
    const controller = new AbortController();
    fetch(file.src, { signal: controller.signal })
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then(setText)
      .catch(() => {});
    return () => controller.abort();
  }, [file.src, tooBig]);

  return (
    <div className="absolute inset-0 flex flex-col bg-surface">
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-5 font-mono text-[0.78rem] leading-relaxed text-dim [overflow-wrap:anywhere] md:p-7">
        {text ?? file.snippet ?? ""}
      </pre>
      {tooBig && (
        <p className="border-t border-line px-5 py-3 text-xs text-muted md:px-7">
          Showing the start only: the file is {formatBytes(file.bytes)}. Download it to see all of it.
        </p>
      )}
    </div>
  );
}

function NoPreview({ file }: { file: PublicFile }) {
  return (
    <div className="absolute inset-0">
      <IconTile file={file} large />
      <p className="absolute inset-x-6 bottom-8 text-center text-sm text-muted">
        No preview for {file.ext ? `.${file.ext}` : "this kind of"} files. Download it to open it.
      </p>
    </div>
  );
}

/** The dialog's large preview. `onMeasure` receives the pixel size of images and videos. */
export function FileStage({ file, onMeasure }: { file: PublicFile; onMeasure?: Measure }) {
  switch (file.kind) {
    case "image":
      return <ImageStage file={file} onMeasure={onMeasure} />;
    case "video":
      return <VideoStage file={file} onMeasure={onMeasure} />;
    case "audio":
      return <AudioStage file={file} />;
    case "pdf":
      // Same origin, so the X-Frame-Options: SAMEORIGIN header allows it.
      return <iframe src={file.src} title={file.name} className="absolute inset-0 size-full border-0 bg-white" />;
    case "font":
      return <FontStage file={file} />;
    case "text":
      return <TextStage file={file} />;
    default:
      return <NoPreview file={file} />;
  }
}
