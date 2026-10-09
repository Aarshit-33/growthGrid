"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  Check,
  CloudUpload,
  Copy,
  ExternalLink,
  ImageIcon,
  ImageOff,
  ImagePlus,
  Images,
  RefreshCw,
  Search,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { listImagesAction } from "@/lib/admin/actions";
import type { ActionResult, PublicImage } from "@/lib/admin/types";
import { cn } from "@/lib/utils";
import {
  describeFailures,
  DropOverlay,
  fileUrl,
  folderLabel,
  formatBytes,
  MAX_UPLOAD_MB,
  UPLOAD_FORMATS,
  uploadTarget,
  useFileDrop,
  useImageUpload,
  type UploadOutcome,
} from "../media/upload";
import { Badge, Btn, IconBtn, inputClasses, Kbd } from "../ui";

/* ─────────────────────────────────────────────────────────────
   The image picker: every image in /public as a grid of
   previews, with search and folder filters, plus uploads
   (button, drag & drop, paste). Choosing one hands back its
   path and pixel size. (Feedback stays inside the dialog:
   toasts would sit underneath the modal.)
   ───────────────────────────────────────────────────────────── */

export interface PickedImage {
  src: string;
  /** Pixel size, when the file could be read. */
  width?: number;
  height?: number;
}

interface Size {
  width: number;
  height: number;
}

type Listing = { status: "loading" } | { status: "ready"; images: PublicImage[] } | { status: "error"; message: string };

/** The last listing, so reopening the picker shows images at once (it still refreshes). */
let lastListing: PublicImage[] | null = null;

async function fetchImages(): Promise<ActionResult<PublicImage[]>> {
  try {
    const result = await listImagesAction();
    if (result.ok) lastListing = result.data;
    return result;
  } catch {
    return { ok: false, error: "Couldn't reach the studio server. Check it's running, then try again." };
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Load an image to read its pixel size (null if it can't be read). */
function measure(url: string): Promise<Size | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    const timer = window.setTimeout(() => resolve(null), 8000);
    const done = (size: Size | null) => {
      window.clearTimeout(timer);
      resolve(size);
    };
    img.onload = () => done(img.naturalWidth && img.naturalHeight ? { width: img.naturalWidth, height: img.naturalHeight } : null);
    img.onerror = () => done(null);
    img.src = url;
  });
}

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(9.75rem,1fr))] gap-3";

export function ImagePicker({
  value,
  onPick,
  onClose,
}: {
  /** The path the field holds now: marked "In use" and selected. */
  value: string;
  onPick: (image: PickedImage) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const pressedOnBackdrop = useRef(false);
  const [listing, setListing] = useState<Listing>(() =>
    lastListing ? { status: "ready", images: lastListing } : { status: "loading" },
  );
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [selected, setSelected] = useState(value);
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  const [choosing, setChoosing] = useState(false);
  const [copied, setCopied] = useState(false);
  /** Bumped after an upload, to scroll the new image into view. */
  const [reveal, setReveal] = useState(0);

  // Open as a modal with the search box focused. Closing on unmount hands focus back to the opener.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    searchRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  // A fresh listing on every open: files may have been added since.
  useEffect(() => {
    let live = true;
    const hadListing = lastListing !== null;
    fetchImages().then((result) => {
      if (!live) return;
      if (result.ok) setListing({ status: "ready", images: result.data });
      else if (hadListing) setNotice(result.error);
      else setListing({ status: "error", message: result.error });
    });
    return () => {
      live = false;
    };
  }, []);

  const ready = listing.status === "ready";
  const images = listing.status === "ready" ? listing.images : [];
  const folders = [...new Set(images.map((image) => image.folder))];
  // A folder that vanished on refresh falls back to "All".
  const folderFilter = folder !== null && folders.includes(folder) ? folder : null;
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = images.filter(
    (image) =>
      (folderFilter === null || image.folder === folderFilter) && words.every((word) => image.src.toLowerCase().includes(word)),
  );
  const active = images.find((image) => image.src === selected);

  // Uploads go to the folder in view when it's a content folder, else to public/images/uploads.
  const target = uploadTarget(folderFilter);
  const onUploaded = ({ uploaded, failed }: UploadOutcome) => {
    if (uploaded.length) {
      const added = new Set(uploaded.map((image) => image.src));
      setListing((current) => {
        const rest = current.status === "ready" ? current.images.filter((image) => !added.has(image.src)) : [];
        lastListing = [...uploaded, ...rest];
        return { status: "ready", images: lastListing };
      });
      setQuery("");
      setFolder(uploaded[0].folder);
      setSelected(uploaded[0].src);
      setReveal((n) => n + 1);
    }
    setNotice(failed.length ? describeFailures({ uploaded, failed }) : null);
  };
  const { upload, browse, inputProps, uploading, label: uploadLabel } = useImageUpload(target, onUploaded);
  const { dragging, bind: dropBind } = useFileDrop((files) => void upload(files), !uploading);

  // Bring the image in use (or the one just uploaded) into view once the list is there.
  useEffect(() => {
    if (!ready) return;
    gridRef.current?.querySelector<HTMLElement>("[data-tile][aria-pressed='true']")?.scrollIntoView({ block: "nearest" });
  }, [ready, reveal]);

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setNotice(null);
    const result = await fetchImages();
    setRefreshing(false);
    if (result.ok) setListing({ status: "ready", images: result.data });
    else if (listing.status === "ready") setNotice(result.error);
    else setListing({ status: "error", message: result.error });
  };

  const remember = (src: string, img: HTMLImageElement) => {
    const { naturalWidth: width, naturalHeight: height } = img;
    if (!width || !height) return;
    setSizes((all) => (all[src]?.width === width && all[src]?.height === height ? all : { ...all, [src]: { width, height } }));
  };

  const choose = async (image: PublicImage) => {
    if (choosing) return;
    setChoosing(true);
    const size = sizes[image.src] ?? (await measure(fileUrl(image)));
    setChoosing(false);
    onPick({ src: image.src, ...(size ?? {}) });
  };

  const copyPath = async (src: string) => {
    try {
      await navigator.clipboard.writeText(src);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setNotice("Couldn't copy the path. Select it and copy it instead.");
    }
  };

  const focusTile = (tile: HTMLButtonElement | null | undefined) => {
    if (!tile) return;
    tile.focus();
    tile.scrollIntoView({ block: "nearest" });
    setSelected(tile.dataset.src ?? "");
  };

  // Arrow keys move through the grid; up from the first row goes back to search.
  const onGridKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const tiles = [...(gridRef.current?.querySelectorAll<HTMLButtonElement>("[data-tile]") ?? [])];
    const index = tiles.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) return;
    const rowBreak = tiles.findIndex((tile) => tile.offsetTop !== tiles[0].offsetTop);
    const columns = rowBreak === -1 ? tiles.length : rowBreak;
    const moves: Record<string, number> = {
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      ArrowUp: index - columns,
      ArrowDown: index + columns,
      Home: 0,
      End: tiles.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    if (event.key === "ArrowUp" && target < 0) return searchRef.current?.focus();
    focusTile(tiles[Math.min(Math.max(target, 0), tiles.length - 1)]);
  };

  // From search: ↓ goes to the grid, Enter uses the only match (or jumps to the first).
  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.key !== "ArrowDown" && event.key !== "Enter") || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (event.key === "Enter" && shown.length === 1) return void choose(shown[0]);
    focusTile(gridRef.current?.querySelector<HTMLButtonElement>("[data-tile]"));
  };

  const refreshBtn = (
    <Btn icon={RefreshCw} loading={refreshing} onClick={refresh}>
      Refresh
    </Btn>
  );

  const uploadBtn = (
    <Btn icon={CloudUpload} loading={uploading} onClick={browse} title={`Add images to ${folderLabel(target)}`}>
      {uploadLabel}
    </Btn>
  );

  let body: ReactNode;
  if (listing.status === "loading") {
    body = <Skeleton />;
  } else if (listing.status === "error") {
    body = (
      <Empty icon={ImageOff} tone="danger" title="Couldn't load the images" action={refreshBtn}>
        {listing.message}
      </Empty>
    );
  } else if (images.length === 0) {
    body = (
      <Empty
        icon={ImagePlus}
        title="No images in /public yet"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {uploadBtn}
            {refreshBtn}
          </div>
        }
      >
        Upload one, drop files here, or paste an image. They&apos;re saved in <Code>{folderLabel(target)}</Code>.
      </Empty>
    );
  } else if (shown.length === 0) {
    body = (
      <Empty
        icon={Search}
        title="No matching images"
        action={
          <Btn
            onClick={() => {
              setQuery("");
              setFolder(null);
              searchRef.current?.focus();
            }}
          >
            Show all images
          </Btn>
        }
      >
        Nothing {folderFilter !== null ? `in ${folderLabel(folderFilter)} ` : ""}matches “{query.trim()}”.
      </Empty>
    );
  } else {
    body = (
      <div ref={gridRef} role="group" aria-label="Images" onKeyDown={onGridKey} className={GRID}>
        {shown.map((image, i) => (
          <Tile
            key={image.src}
            image={image}
            index={i}
            size={sizes[image.src]}
            picked={image.src === selected}
            inUse={image.src === value}
            onSelect={() => setSelected(image.src)}
            onChoose={() => choose(image)}
            onSize={(img) => remember(image.src, img)}
          />
        ))}
      </div>
    );
  }

  const count = shown.length === images.length ? plural(images.length, "image") : `${shown.length} of ${images.length} images`;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="admin-image-picker-title"
      aria-describedby="admin-image-picker-description"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // Only a click that starts and ends on the backdrop closes (not a drag out of the search box).
      onPointerDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressedOnBackdrop.current && event.target === event.currentTarget) onClose();
      }}
      {...dropBind}
      className="m-auto h-[min(46rem,calc(100dvh-2rem))] w-[min(70rem,calc(100vw-2rem))] animate-rise-in overflow-hidden rounded-panel border border-line-strong bg-surface p-0 text-ink shadow-panel [animation-duration:0.45s] backdrop:bg-bg/75 backdrop:backdrop-blur-sm"
    >
      <div aria-hidden="true" className="pointer-events-none absolute -top-28 left-[12%] h-48 w-[55%] rounded-full bg-em/[0.08] blur-3xl" />
      <div className="relative flex h-full flex-col">
        {dragging && <DropOverlay folder={target} />}
        <input {...inputProps} />
        <header className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-6">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-em/25 bg-em/10 text-em shadow-[0_0_24px_-8px_rgb(60_228_154/0.6)]">
              <Images className="size-[1.15rem]" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="admin-image-picker-title" className="font-display text-[1.2rem] font-medium tracking-[-0.02em]">
                Choose an image
              </h2>
              <p id="admin-image-picker-description" className="mt-0.5 text-[0.84rem] leading-relaxed text-muted">
                Everything in <Code>/public</Code>. Upload, drop or paste images to add them ({UPLOAD_FORMATS}, up to {MAX_UPLOAD_MB} MB).
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <IconBtn
              icon={RefreshCw}
              label="Refresh the list"
              onClick={refresh}
              aria-busy={refreshing || undefined}
              className={cn(refreshing && "text-em [&_svg]:animate-spin")}
            />
            <IconBtn icon={X} label="Close" onClick={onClose} />
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2.5 px-5 py-4 sm:px-6">
          <div className="relative min-w-[13rem] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden="true" />
            <input
              ref={searchRef}
              type="text"
              inputMode="search"
              enterKeyHint="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onSearchKey}
              placeholder="Search by file or folder name"
              aria-label="Search images"
              autoComplete="off"
              spellCheck={false}
              className={inputClasses(false, "h-10 pl-10 pr-9")}
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
                className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-faint transition-colors hover:bg-white/[0.06] hover:text-ink"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
          {uploadBtn}
          {folders.length > 1 && (
            <div role="group" aria-label="Folders" className="flex flex-wrap items-center gap-1.5">
              {[null, ...folders].map((name) => {
                const on = folderFilter === name;
                const total = name === null ? images.length : images.filter((image) => image.folder === name).length;
                return (
                  <button
                    key={name ?? "*"}
                    type="button"
                    aria-pressed={on}
                    title={name === null ? "Every folder" : folderLabel(name)}
                    onClick={() => setFolder(name)}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[0.76rem] font-medium transition-[background-color,border-color,color] duration-200",
                      on ? "border-em/50 bg-em/12 text-hot" : "border-line text-muted hover:border-line-strong hover:text-ink",
                    )}
                  >
                    {name === null ? "All" : (name.split("/").pop() ?? name) || "public"}
                    <span className={cn("font-mono text-[0.64rem]", on ? "text-hot/70" : "text-faint")}>{total}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {notice && (
          <div
            role="alert"
            className="mx-5 mb-3 flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/[0.07] py-2 pl-3.5 pr-1.5 text-[0.8rem] leading-relaxed text-warn sm:mx-6"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 py-0.5">{notice}</span>
            <IconBtn icon={X} label="Dismiss" onClick={() => setNotice(null)} className="size-7 text-warn/80" />
          </div>
        )}

        <div className="grid min-h-0 flex-1 border-t border-line md:grid-cols-[minmax(0,1fr)_17.5rem]">
          <div className="min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6">{body}</div>
          <aside aria-label="Selected image" className="hidden min-h-0 overflow-y-auto overscroll-contain border-l border-line bg-white/[0.012] md:block">
            {active ? (
              <Details
                image={active}
                size={sizes[active.src]}
                inUse={active.src === value}
                copied={copied}
                onCopy={() => copyPath(active.src)}
                onSize={(img) => remember(active.src, img)}
              />
            ) : (
              <div className="grid h-full place-items-center p-6 text-center">
                <div className="text-faint">
                  <ImageIcon className="mx-auto size-6" aria-hidden="true" />
                  <p className="mt-2.5 text-[0.82rem] leading-relaxed">Select an image to see its details.</p>
                </div>
              </div>
            )}
          </aside>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-3.5 sm:px-6">
          <p className="min-w-0 truncate text-[0.78rem] text-faint">
            {ready && images.length > 0 && (
              <>
                {count}
                <span className="hidden lg:inline">
                  {" "}
                  · Double-click or press <Kbd>Enter</Kbd> to use one
                </span>
              </>
            )}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn variant="primary" icon={Check} disabled={!active} loading={choosing} onClick={() => active && choose(active)}>
              Use image
            </Btn>
          </div>
        </footer>
      </div>
    </dialog>
  );
}

/* ── Pieces ───────────────────────────────────────────────── */

function Code({ children }: { children: ReactNode }) {
  return <code className="font-mono text-[0.78rem] text-dim">{children}</code>;
}

function Tile({
  image,
  index,
  size,
  picked,
  inUse,
  onSelect,
  onChoose,
  onSize,
}: {
  image: PublicImage;
  index: number;
  size?: Size;
  picked: boolean;
  inUse: boolean;
  onSelect: () => void;
  onChoose: () => void;
  onSize: (img: HTMLImageElement) => void;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <button
      type="button"
      data-tile=""
      data-src={image.src}
      aria-pressed={picked}
      aria-label={`${image.name}${inUse ? " (in use)" : ""}`}
      title={image.src}
      onClick={onSelect}
      onDoubleClick={onChoose}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          onChoose();
        }
      }}
      style={{ animationDelay: `${Math.min(index, 16) * 22}ms` }}
      className={cn(
        "group/tile relative flex min-w-0 animate-rise-in flex-col rounded-xl border p-1.5 text-left [animation-duration:0.55s] transition-[border-color,background-color,box-shadow,translate] duration-300 ease-out-expo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-em",
        picked
          ? "border-em/60 bg-em/[0.07] shadow-[0_0_0_1px_rgb(60_228_154/0.3),0_14px_34px_-16px_rgb(60_228_154/0.6)]"
          : "border-line bg-white/[0.015] hover:-translate-y-0.5 hover:border-line-strong hover:bg-white/[0.035]",
      )}
    >
      <span className="relative block aspect-[16/10] overflow-hidden rounded-lg bg-surface-2 dot-matrix [--grid-size:0.75rem]">
        {broken ? (
          <span className="grid size-full place-items-center text-faint">
            <ImageOff className="size-5" aria-hidden="true" />
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- previews of /public files in any format and size
          <img
            src={fileUrl(image)}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={(event) => onSize(event.currentTarget)}
            onError={() => setBroken(true)}
            className="size-full object-contain transition-[scale] duration-500 ease-out-expo group-hover/tile:scale-[1.045]"
          />
        )}
        {inUse && (
          <span className="absolute left-1.5 top-1.5 rounded-full border border-em/40 bg-bg/80 px-2 py-0.5 font-mono text-[0.56rem] uppercase tracking-[0.14em] text-hot backdrop-blur-sm">
            In use
          </span>
        )}
        <span
          aria-hidden="true"
          className={cn(
            "absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-em text-bg shadow-[0_0_16px_-2px_rgb(60_228_154/0.85)] transition-[opacity,scale] duration-300 ease-spring",
            picked ? "scale-100 opacity-100" : "scale-50 opacity-0",
          )}
        >
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      </span>
      <span className="mt-2 block truncate px-1 text-[0.8rem] font-medium text-ink">{image.name}</span>
      <span className="mb-0.5 mt-0.5 block truncate px-1 font-mono text-[0.64rem] text-faint">
        {size ? `${size.width}×${size.height} · ` : ""}
        {formatBytes(image.bytes)}
      </span>
    </button>
  );
}

function Details({
  image,
  size,
  inUse,
  copied,
  onCopy,
  onSize,
}: {
  image: PublicImage;
  size?: Size;
  inUse: boolean;
  copied: boolean;
  onCopy: () => void;
  onSize: (img: HTMLImageElement) => void;
}) {
  const updated = new Date(image.modified).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-line bg-surface-2 dot-matrix [--grid-size:0.8rem]">
        {/* eslint-disable-next-line @next/next/no-img-element -- previews of /public files in any format and size */}
        <img
          key={image.src}
          src={fileUrl(image)}
          alt=""
          decoding="async"
          onLoad={(event) => onSize(event.currentTarget)}
          className="size-full animate-rise-in object-contain [animation-duration:0.5s]"
        />
      </div>
      <div className="min-w-0">
        <p className="break-words font-display text-[1rem] font-medium leading-snug tracking-[-0.01em] text-ink">{image.name}</p>
        <div className="mt-1 flex items-start gap-1">
          <code className="min-w-0 flex-1 break-all pt-1 font-mono text-[0.72rem] leading-relaxed text-muted">{image.src}</code>
          <IconBtn
            icon={copied ? Check : Copy}
            label={copied ? "Copied" : "Copy path"}
            onClick={onCopy}
            className={cn("size-7", copied && "text-em hover:text-em")}
          />
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 border-t border-line pt-4">
        <Meta label="Dimensions">{size ? `${size.width} × ${size.height}` : "…"}</Meta>
        <Meta label="File size">{formatBytes(image.bytes)}</Meta>
        <Meta label="Folder" wide>
          {folderLabel(image.folder)}
        </Meta>
        <Meta label="Updated" wide>
          {updated}
        </Meta>
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {inUse && (
          <Badge tone="em" icon={Check}>
            In use here
          </Badge>
        )}
        <a
          href={fileUrl(image)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[0.8rem] font-medium text-em transition-colors hover:text-hot"
        >
          Open full size <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

function Meta({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={cn("min-w-0", wide && "col-span-2")}>
      <dt className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-faint">{label}</dt>
      <dd className="mt-1 break-all font-mono text-[0.76rem] text-dim">{children}</dd>
    </div>
  );
}

function Empty({
  icon: IconComponent,
  title,
  tone = "default",
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  tone?: "default" | "danger";
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid h-full min-h-[16rem] place-items-center text-center">
      <div className="max-w-sm animate-rise-in [animation-duration:0.5s]">
        <span
          className={cn(
            "mx-auto grid size-12 place-items-center rounded-2xl border",
            tone === "danger" ? "border-danger/30 bg-danger/[0.08] text-danger" : "border-dashed border-line-strong bg-white/[0.02] text-muted",
          )}
        >
          <IconComponent className="size-5" aria-hidden="true" />
        </span>
        <p className="mt-4 font-display text-[1.05rem] font-medium tracking-[-0.01em] text-ink">{title}</p>
        <p className="mt-1.5 text-[0.84rem] leading-relaxed text-muted">{children}</p>
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div role="status" aria-label="Loading images" className={GRID}>
      {Array.from({ length: 10 }, (_, i) => {
        const delay = { animationDelay: `${i * 90}ms` };
        return (
          <div key={i} aria-hidden="true" className="rounded-xl border border-line p-1.5">
            <div className="aspect-[16/10] animate-pulse rounded-lg bg-white/[0.045]" style={delay} />
            <div className="mx-1 mt-2.5 h-2.5 w-3/4 animate-pulse rounded-full bg-white/[0.05]" style={delay} />
            <div className="mx-1 mb-1 mt-2 h-2 w-1/2 animate-pulse rounded-full bg-white/[0.035]" style={delay} />
          </div>
        );
      })}
    </div>
  );
}
