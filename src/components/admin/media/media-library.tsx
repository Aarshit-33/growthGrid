"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  FolderOpen,
  ImageOff,
  Images,
  Link2,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { deleteImageAction, listMediaAction } from "@/lib/admin/actions";
import { adminHref } from "@/lib/admin/config";
import type { MediaItem } from "@/lib/admin/types";
import { cn } from "@/lib/utils";
import { useConfirm } from "../hooks";
import { TimeAgo } from "../time-ago";
import { toast } from "../toast";
import { Badge, Btn, PageHeader } from "../ui";
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
} from "./upload";

/* ─────────────────────────────────────────────────────────────
   Media library: every image in /public, where the content uses
   it, uploads (button, drag & drop, paste) and deleting images
   nothing uses. Deleted files are kept in .data/deleted-media.
   ───────────────────────────────────────────────────────────── */

type Usage = "all" | "used" | "unused";

const ALL_FOLDERS = "*";
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

interface MediaLibraryProps {
  base: string;
  initial: MediaItem[];
  /** The role may delete (unused images under public/images). */
  canDelete: boolean;
}

export function MediaLibrary({ base, initial, canDelete }: MediaLibraryProps) {
  const [items, setItems] = useState(initial);
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState(ALL_FOLDERS);
  const [usage, setUsage] = useState<Usage>("all");
  const [selectedSrc, setSelectedSrc] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const searchRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await listMediaAction();
      if (result.ok) setItems(result.data);
      else toast.error(result.error);
    } catch {
      toast.error("Couldn't reach the studio server. Check it's running, then try again.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Uploads land in the folder in view (when it's a content folder), else public/images/uploads.
  const target = uploadTarget(folder === ALL_FOLDERS ? null : folder);
  const onUploaded = async (outcome: UploadOutcome) => {
    if (outcome.failed.length) toast.error(outcome.uploaded.length ? "Some files weren't uploaded" : "Upload failed", { body: describeFailures(outcome) });
    if (!outcome.uploaded.length) return;
    toast.success(outcome.uploaded.length === 1 ? "Image uploaded" : `${outcome.uploaded.length} images uploaded`, {
      body: `Saved to ${folderLabel(outcome.uploaded[0].folder)}. Pick it from any image field.`,
    });
    await reload();
    setUsage("all");
    setQuery("");
    setSelectedSrc(outcome.uploaded[0].src);
  };
  const uploader = useImageUpload(target, (outcome) => void onUploaded(outcome));
  const drop = useFileDrop((files) => void uploader.upload(files), !uploader.uploading);

  const summary = useMemo(() => {
    const folders = new Set<string>();
    let bytes = 0;
    let used = 0;
    for (const item of items) {
      folders.add(item.folder);
      bytes += item.bytes;
      if (item.uses.length) used += 1;
    }
    return { bytes, used, unused: items.length - used, folders: [...folders].sort() };
  }, [items]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter(
      (item) =>
        (folder === ALL_FOLDERS || item.folder === folder) &&
        (usage === "all" || (usage === "used") === item.uses.length > 0) &&
        (!needle || item.src.toLowerCase().includes(needle) || item.uses.some((use) => use.label.toLowerCase().includes(needle))),
    );
  }, [items, query, folder, usage]);

  const selected = items.find((item) => item.src === selectedSrc) ?? null;
  const filtered = query.trim() !== "" || folder !== ALL_FOLDERS || usage !== "all";
  const resetFilters = () => {
    setQuery("");
    setFolder(ALL_FOLDERS);
    setUsage("all");
  };

  // "/" jumps to the search box; Escape closes the details.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof Element && event.target.closest("input, select, textarea, [contenteditable], dialog");
      if (event.key === "Escape" && !typing) setSelectedSrc(null);
      if (event.key !== "/" || event.altKey || event.ctrlKey || event.metaKey || typing) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const remove = async (item: MediaItem) => {
    const ok = await confirm({
      title: "Delete this image?",
      body: (
        <>
          <p>
            <strong className="break-all text-ink">{item.src}</strong> comes off the site. A copy is kept in{" "}
            <code className="font-mono text-[0.85em] text-dim">.data/deleted-media</code>, so it can be put back by hand.
          </p>
          <p className="mt-2.5">Nothing in the content uses it. Files the site&apos;s code uses directly aren&apos;t tracked here, so only delete images you recognise.</p>
        </>
      ),
      confirmLabel: "Delete image",
      tone: "danger",
    });
    if (!ok) return;
    setDeleting(item.src);
    try {
      const result = await deleteImageAction({ src: item.src });
      if (!result.ok) {
        toast.error(result.error);
        if (result.conflict) void reload();
        return;
      }
      setItems((list) => list.filter((other) => other.src !== item.src));
      setSelectedSrc(null);
      toast.success("Image deleted", { body: `A copy is kept at ${result.data.kept}.` });
    } catch {
      toast.error("Couldn't reach the studio server. Check it's running, then try again.");
    } finally {
      setDeleting(null);
    }
  };

  const stats: [string, string][] = [
    ["Images", String(items.length)],
    ["Total size", formatBytes(summary.bytes)],
    ["In use", String(summary.used)],
    ["Unused", String(summary.unused)],
  ];

  return (
    <div className="relative space-y-8" {...drop.bind}>
      {confirmDialog}
      <input {...uploader.inputProps} />
      {drop.dragging && <DropOverlay folder={target} className="fixed inset-4 lg:left-[18rem]" />}

      <PageHeader
        eyebrow="Studio"
        title="Media library"
        description={
          canDelete
            ? "Every image in /public: upload new ones, see where each is used, and clear out the ones nothing uses."
            : "Every image in /public: upload new ones and see where each is used."
        }
        actions={
          <>
            <Btn variant="ghost" size="sm" icon={RefreshCw} onClick={() => void reload()} loading={refreshing} disabled={uploader.uploading}>
              Refresh
            </Btn>
            <Btn variant="primary" icon={Upload} onClick={uploader.browse} loading={uploader.uploading}>
              {uploader.label}
            </Btn>
          </>
        }
        className="animate-rise-in"
      />

      <dl className="grid animate-rise-in grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line [animation-delay:60ms] md:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="bg-bg-2/95 px-4 py-4 sm:px-5">
            <dt className="label-mono text-[0.62rem]">{label}</dt>
            <dd className="mt-2 font-display text-[1.5rem] leading-none tracking-[-0.03em] text-ink tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {/* Toolbar */}
      <div className="flex animate-rise-in flex-col gap-3 [animation-delay:100ms] lg:flex-row lg:items-center">
        <label className="relative block lg:w-80">
          <span className="sr-only">Search images</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, folder or where it's used"
            autoComplete="off"
            spellCheck={false}
            className="h-10 w-full rounded-full border border-line bg-surface/80 pl-10 pr-10 text-[0.86rem] text-ink outline-none transition-[border-color,box-shadow] duration-300 placeholder:text-faint hover:border-line-strong focus:border-em/60 focus:shadow-[0_0_0_4px_rgb(60_228_154/0.12)] [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-white/[0.06] hover:text-ink"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          )}
        </label>
        <div role="group" aria-label="Usage" className="flex gap-2">
          {(
            [
              ["all", "All", items.length],
              ["used", "In use", summary.used],
              ["unused", "Unused", summary.unused],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              aria-pressed={usage === value}
              onClick={() => setUsage(value)}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-[0.8rem] transition-[background-color,border-color,color] duration-300",
                usage === value ? "border-em/50 bg-em/[0.12] text-ink" : "border-line bg-surface/60 text-muted hover:border-line-strong hover:text-ink",
              )}
            >
              {label}
              <span className={cn("font-mono text-[0.68rem] tabular-nums", usage === value ? "text-em" : "text-faint")}>{count}</span>
            </button>
          ))}
        </div>
        <label className="relative block lg:ml-auto">
          <span className="sr-only">Folder</span>
          <FolderOpen aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <select
            value={folder}
            onChange={(event) => setFolder(event.target.value)}
            className="h-10 w-full cursor-pointer appearance-none rounded-full border border-line bg-surface/80 pl-10 pr-8 text-[0.82rem] text-dim outline-none transition-colors hover:border-line-strong focus-visible:border-em/60 lg:w-60"
          >
            <option value={ALL_FOLDERS}>All folders</option>
            {summary.folders.map((each) => (
              <option key={each} value={each}>
                /{each}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <div className="mb-4 flex min-h-6 items-center justify-between gap-4">
            <p className="label-mono tabular-nums" aria-live="polite">
              {filtered ? `${visible.length} of ${plural(items.length, "image")}` : plural(items.length, "image")}
            </p>
            {filtered && (
              <button type="button" onClick={resetFilters} className="text-[0.8rem] text-em transition-colors hover:text-hot">
                Clear filters
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <UploadPrompt target={target} onBrowse={uploader.browse} />
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center rounded-panel border border-dashed border-line-strong px-6 py-16 text-center">
              <Search className="size-6 text-em" aria-hidden="true" />
              <p className="mt-4 font-display text-lg text-ink">No images match</p>
              <button type="button" onClick={resetFilters} className="mt-2 text-[0.86rem] text-em underline-offset-4 hover:underline">
                Clear the filters
              </button>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {visible.map((item, index) => (
                <li key={item.src} className="min-w-0">
                  <MediaTile item={item} index={index} selected={item.src === selectedSrc} onSelect={() => setSelectedSrc(item.src === selectedSrc ? null : item.src)} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="xl:sticky xl:top-8 xl:self-start" aria-label="Image details">
          {selected ? (
            <MediaDetails
              key={selected.src}
              item={selected}
              base={base}
              canDelete={canDelete}
              deleting={deleting === selected.src}
              onDelete={() => void remove(selected)}
              onClose={() => setSelectedSrc(null)}
            />
          ) : (
            <div className="card p-5 text-[0.84rem] leading-relaxed text-muted">
              <p className="flex items-center gap-2 font-medium text-ink">
                <Images className="size-4 text-em" aria-hidden="true" /> Pick an image
              </p>
              <p className="mt-2">
                {canDelete ? "See where it's used, copy its path, or delete it if nothing uses it." : "See where it's used and copy its path."}
              </p>
              <p className="mt-3 border-t border-line pt-3 text-[0.78rem] text-faint">
                Drop files anywhere on this page, or paste an image, to upload it into{" "}
                <code className="font-mono text-[0.92em] text-dim">{folderLabel(target)}</code>. {UPLOAD_FORMATS}, up to {MAX_UPLOAD_MB} MB each.
              </p>
            </div>
          )}
          <p className="mt-4 px-1 text-[0.74rem] leading-relaxed text-faint">
            {canDelete ? "Uploads and deletions change" : "Uploads change"} files in /public. With <code className="font-mono text-[0.92em]">npm run dev</code> running they show
            straight away; for the live site, commit them and redeploy.
          </p>
        </aside>
      </div>
    </div>
  );
}

function UploadPrompt({ target, onBrowse }: { target: string; onBrowse: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-panel border border-dashed border-line-strong px-6 py-20 text-center">
      <span className="grid size-14 place-items-center rounded-2xl border border-em/30 bg-em/10 text-em">
        <Upload className="size-6" aria-hidden="true" />
      </span>
      <p className="mt-5 font-display text-xl text-ink">No images yet</p>
      <p className="mt-2 max-w-sm text-[0.86rem] text-muted">
        Drop images here, paste one, or choose files. They&apos;re saved to <code className="font-mono text-[0.9em]">{folderLabel(target)}</code>.
      </p>
      <Btn variant="primary" icon={Upload} onClick={onBrowse} className="mt-6">
        Choose files
      </Btn>
    </div>
  );
}

function MediaTile({ item, index, selected, onSelect }: { item: MediaItem; index: number; selected: boolean; onSelect: () => void }) {
  const [broken, setBroken] = useState(false);
  const used = item.uses.length;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={item.src}
      className={cn(
        "group/tile card flex w-full min-w-0 flex-col overflow-hidden text-left transition-[border-color,box-shadow,translate] duration-300 ease-out-expo motion-safe:animate-rise-in focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-em",
        selected ? "border-em/70 shadow-[0_0_0_3px_rgb(60_228_154/0.18)]" : "hover:-translate-y-0.5 hover:border-line-strong",
      )}
      style={{ animationDelay: `${Math.min(index, 15) * 30}ms` }}
    >
      <span className="relative block aspect-square overflow-hidden border-b border-line bg-surface-2 dot-matrix [--grid-size:0.9rem]">
        {broken ? (
          <span className="absolute inset-0 grid place-items-center text-faint">
            <ImageOff className="size-6" aria-hidden="true" />
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- thumbnails of any format in /public
          <img
            src={fileUrl(item)}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
            className="absolute inset-0 size-full object-contain p-2 transition-transform duration-500 ease-out-expo group-hover/tile:scale-[1.03]"
          />
        )}
        <span className="absolute left-2 top-2 rounded-md border border-white/10 bg-bg/75 px-1.5 py-0.5 font-mono text-[0.58rem] uppercase tracking-[0.12em] text-dim backdrop-blur-md">
          {item.name.split(".").pop()}
        </span>
        {selected && (
          <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-em text-bg">
            <Check className="size-3.5" aria-hidden="true" />
          </span>
        )}
      </span>
      <span className="block p-2.5">
        <span className="block truncate text-[0.8rem] font-medium text-ink">{item.name}</span>
        <span className="mt-1 flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[0.62rem] text-faint">{formatBytes(item.bytes)}</span>
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-px font-mono text-[0.58rem] uppercase tracking-[0.08em]",
              used ? "bg-em/[0.12] text-hot" : "bg-white/[0.05] text-faint",
            )}
          >
            {used ? `Used ${used}×` : "Unused"}
          </span>
        </span>
      </span>
    </button>
  );
}

function MediaDetails({
  item,
  base,
  canDelete,
  deleting,
  onDelete,
  onClose,
}: {
  item: MediaItem;
  base: string;
  canDelete: boolean;
  deleting: boolean;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [size, setSize] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(item.src);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.info("Copy the path by hand", { body: item.src });
    }
  };

  const reason = !item.deletable
    ? "Only images in public/images can be deleted here. The rest of /public belongs to the site's code."
    : item.uses.length > 0
      ? "In use. Pick another image in the places above first."
      : null;

  return (
    <div className="card animate-rise-in overflow-hidden [animation-duration:0.4s]">
      <div className="relative aspect-[4/3] border-b border-line bg-surface-2 dot-matrix [--grid-size:0.9rem]">
        {/* eslint-disable-next-line @next/next/no-img-element -- preview of any format in /public */}
        <img
          src={fileUrl(item)}
          alt=""
          onLoad={(event) => setSize(`${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight}`)}
          className="absolute inset-0 size-full object-contain p-4"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="absolute right-2.5 top-2.5 grid size-8 place-items-center rounded-full border border-white/10 bg-bg/75 text-muted backdrop-blur-md transition-colors hover:text-ink"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-4 p-4">
        <div>
          <p className="break-all text-[0.9rem] font-medium text-ink">{item.name}</p>
          <div className="mt-2 flex items-center gap-1.5">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-white/[0.02] px-2.5 py-1.5 font-mono text-[0.72rem] text-dim" title={item.src}>
              {item.src}
            </code>
            <button
              type="button"
              onClick={() => void copy()}
              aria-label={copied ? "Path copied" : "Copy path"}
              title={copied ? "Copied" : "Copy path"}
              className="grid size-8 shrink-0 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              {copied ? <Check className="size-3.5 text-em" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
            </button>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-[0.78rem]">
          <Fact label="Folder">/{item.folder}</Fact>
          <Fact label="Size">{formatBytes(item.bytes)}</Fact>
          <Fact label="Dimensions">{size ?? "…"}</Fact>
          <Fact label="Changed">
            <TimeAgo at={new Date(item.modified).toISOString()} />
          </Fact>
        </dl>

        <div className="border-t border-line pt-3.5">
          <p className="flex items-center gap-2 text-[0.8rem] font-medium text-dim">
            <Link2 className="size-3.5 text-em" aria-hidden="true" /> Where it&apos;s used
            {item.uses.length > 0 && <Badge tone="em">{item.uses.length}</Badge>}
          </p>
          {item.uses.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {item.uses.map((use) => (
                <li key={`${use.href}|${use.label}`}>
                  <Link
                    href={adminHref(base, use.href)}
                    className="group/use flex items-center gap-2 rounded-lg px-2 py-1.5 text-[0.8rem] text-muted transition-colors hover:bg-white/[0.04] hover:text-ink"
                  >
                    <span className="min-w-0 flex-1 truncate">{use.label}</span>
                    <ArrowRight className="size-3.5 shrink-0 text-faint transition-transform duration-300 group-hover/use:translate-x-0.5 group-hover/use:text-em" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-[0.78rem] leading-relaxed text-faint">Nothing in the content uses this image.</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-line pt-3.5">
          <a href={item.src} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong px-3 text-[0.78rem] text-ink transition-colors hover:border-em/50">
            <ExternalLink className="size-3.5" aria-hidden="true" /> Open
          </a>
          {canDelete && (
            <Btn size="sm" variant="danger" icon={Trash2} onClick={onDelete} loading={deleting} disabled={!!reason} className="ml-auto">
              Delete
            </Btn>
          )}
        </div>
        {canDelete && reason && <p className="-mt-1 text-[0.74rem] leading-relaxed text-faint">{reason}</p>}
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-faint">{label}</dt>
      <dd className="mt-0.5 truncate text-ink">{children}</dd>
    </div>
  );
}
