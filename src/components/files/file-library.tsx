"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Archive, Check, ChevronDown, Copy, Download, ExternalLink, EyeOff, FolderOpen, Lock, Maximize2, Search, X } from "lucide-react";
import { BrandMark } from "@/components/layout/logo";
import { buttonClasses } from "@/components/ui/button";
import type { BrandMarkImage } from "@/lib/brand";
import { formatBytes, formatDay, KIND_LABELS, type FileKind, type PublicFile } from "@/lib/files/shared";
import { cn } from "@/lib/utils";
import { FilePreview } from "./file-preview";
import { FileThumb } from "./file-thumb";

/* ─────────────────────────────────────────────────────────────
   File library (client): search, filter and sort everything in
   /public; preview a file, copy its link, download it, or zip a
   folder or the lot. `base` is the page's private address, used
   only for its own .zip links.
   ───────────────────────────────────────────────────────────── */

type Sort = "folder" | "name" | "newest" | "largest";

const SORTS: [Sort, string][] = [
  ["folder", "By folder"],
  ["name", "Name A–Z"],
  ["newest", "Newest first"],
  ["largest", "Largest first"],
];

const SORTERS: Record<Exclude<Sort, "folder">, (a: PublicFile, b: PublicFile) => number> = {
  name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
  newest: (a, b) => b.modified - a.modified,
  largest: (a, b) => b.bytes - a.bytes,
};

/** Folder filter value for "everywhere" ("" is /public itself). */
const ALL_FOLDERS = "*";
const KINDS = Object.keys(KIND_LABELS) as FileKind[];

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Copies text, remembering which item was copied for a moment (for its ✓). */
function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async (key: string, text: string) => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // No Clipboard API (e.g. a plain-http LAN address): the old way. Inside an
      // open dialog when there is one, since a modal makes the rest of the page inert.
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      (document.querySelector("dialog[open]") ?? document.body).append(area);
      area.select();
      ok = document.execCommand("copy");
      area.remove();
    }
    if (!ok) return;
    setCopied(key);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 1600);
  }, []);

  return { copied, copy };
}

/* ── Small pieces ───────────────────────────────────────────── */

function Chip({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[0.8rem] transition-[background-color,border-color,color] duration-300",
        active
          ? "border-em/50 bg-em/[0.12] text-ink"
          : "border-line bg-surface/60 text-muted hover:border-line-strong hover:text-ink",
      )}
    >
      {label}
      <span className={cn("font-mono text-[0.68rem] tabular-nums", active ? "text-em" : "text-faint")}>{count}</span>
    </button>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative block min-w-0">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full min-w-0 cursor-pointer appearance-none truncate rounded-full border border-line bg-surface/80 pl-3.5 pr-9 text-[0.8rem] text-dim outline-none transition-colors duration-300 hover:border-line-strong focus-visible:border-em/60 md:w-auto"
      >
        {options.map(([option, text]) => (
          <option key={option} value={option}>
            {text}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
    </label>
  );
}

function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="mt-6 flex flex-col items-center rounded-panel border border-dashed border-line-strong px-6 py-20 text-center">
      <span className="grid size-14 place-items-center rounded-full border border-line bg-surface text-em">{icon}</span>
      <p className="mt-5 font-display text-xl text-ink">{title}</p>
      <div className="mt-2 max-w-sm text-sm text-muted">{children}</div>
    </div>
  );
}

interface CardProps {
  file: PublicFile;
  index: number;
  copied: boolean;
  onCopy: () => void;
  onOpen: () => void;
}

function FileCard({ file, index, copied, onCopy, onOpen }: CardProps) {
  const [dimensions, setDimensions] = useState<string | null>(null);
  return (
    <article
      className="group/card card card-hover @container flex h-full flex-col overflow-hidden motion-safe:animate-rise-in"
      style={{ animationDelay: `${Math.min(index, 11) * 45}ms` }}
    >
      <div className="relative aspect-[4/3] overflow-hidden border-b border-line bg-surface-2">
        <FileThumb file={file} onMeasure={setDimensions} />
        <span className="pointer-events-none absolute left-2.5 top-2.5 z-10 rounded-md border border-white/10 bg-bg/70 px-1.5 py-0.5 font-mono text-[0.6rem] font-medium uppercase tracking-[0.12em] text-dim backdrop-blur-md">
          {file.ext || "file"}
        </span>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-2.5 z-10 grid size-8 place-items-center rounded-full border border-white/10 bg-bg/70 text-ink opacity-0 backdrop-blur-md transition-opacity duration-300 group-hover/card:opacity-100"
        >
          <Maximize2 className="size-3.5" />
        </span>
        <button type="button" onClick={onOpen} className="absolute inset-0 z-[5] cursor-zoom-in [outline-offset:-3px]">
          <span className="sr-only">Preview {file.name}</span>
        </button>
      </div>

      <div className="flex flex-1 flex-col p-3 @min-[13rem]:p-4">
        <p className="truncate text-[0.88rem] font-medium leading-snug text-ink" title={`/${file.path}`}>
          {file.name}
        </p>
        <p className="mt-1 truncate font-mono text-[0.66rem] text-faint">
          {formatBytes(file.bytes)}
          {dimensions && ` · ${dimensions}`}
        </p>
        {/* Sized by the card, not the screen: narrow cards (2-up on phones) get one full-width
            Download; Copy and Open join as it widens (both are always in the preview too). */}
        <div className="mt-auto flex items-center gap-1.5 pt-3">
          <a
            href={file.src}
            download={file.name}
            aria-label={`Download ${file.name}`}
            className="inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-em/10 px-3 text-[0.78rem] font-medium text-em ring-1 ring-inset ring-em/25 transition-[background-color,color,box-shadow] duration-300 hover:bg-em hover:text-bg hover:ring-em"
          >
            <Download aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">Download</span>
          </a>
          <button
            type="button"
            onClick={onCopy}
            aria-label={copied ? "Link copied" : `Copy link to ${file.name}`}
            title={copied ? "Copied" : "Copy link"}
            className="hidden size-9 shrink-0 place-items-center rounded-full border border-line text-muted transition-[border-color,color] duration-300 hover:border-line-strong hover:text-ink @min-[11rem]:grid"
          >
            {copied ? <Check aria-hidden="true" className="size-3.5 text-em" /> : <Copy aria-hidden="true" className="size-3.5" />}
          </button>
          <a
            href={file.src}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${file.name} in a new tab`}
            title="Open in a new tab"
            className="hidden size-9 shrink-0 place-items-center rounded-full border border-line text-muted transition-[border-color,color] duration-300 hover:border-line-strong hover:text-ink @min-[14rem]:grid"
          >
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        </div>
      </div>
    </article>
  );
}

/* ── The page ───────────────────────────────────────────────── */

export function FileLibrary({
  files,
  base,
  siteName,
  mark = null,
}: {
  files: PublicFile[];
  base: string;
  siteName: string;
  /** Studio › Branding's mark (null: the built-in grid mark). */
  mark?: BrandMarkImage | null;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<FileKind | "all">("all");
  const [folder, setFolder] = useState(ALL_FOLDERS);
  const [sort, setSort] = useState<Sort>("folder");
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { copied, copy } = useCopy();

  const summary = useMemo(() => {
    const kinds = new Map<FileKind, number>();
    const direct = new Set<string>();
    const folders = new Set<string>();
    let bytes = 0;
    let latest = 0;
    for (const file of files) {
      bytes += file.bytes;
      latest = Math.max(latest, file.modified);
      kinds.set(file.kind, (kinds.get(file.kind) ?? 0) + 1);
      direct.add(file.folder);
      // The folder and its parents, so "/images" also finds "/images/work".
      for (let path = file.folder; path; path = path.slice(0, Math.max(0, path.lastIndexOf("/")))) folders.add(path);
      if (!file.folder) folders.add("");
    }
    return { bytes, latest, kinds, folderCount: direct.size, folders: [...folders].sort() };
  }, [files]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const inFolder = (file: PublicFile) =>
      folder === ALL_FOLDERS ||
      (folder === "" ? file.folder === "" : file.folder === folder || file.folder.startsWith(`${folder}/`));
    const list = files.filter(
      (file) => (kind === "all" || file.kind === kind) && inFolder(file) && (!needle || file.path.toLowerCase().includes(needle)),
    );
    // "By folder" keeps the server's order: folder, then name.
    return sort === "folder" ? list : [...list].sort(SORTERS[sort]);
  }, [files, query, kind, folder, sort]);

  const groups = useMemo(() => {
    if (sort !== "folder") return null;
    const map = new Map<string, PublicFile[]>();
    for (const file of visible) {
      const list = map.get(file.folder);
      if (list) list.push(file);
      else map.set(file.folder, [file]);
    }
    return [...map];
  }, [visible, sort]);

  const filtered = query.trim() !== "" || kind !== "all" || folder !== ALL_FOLDERS;
  const resetFilters = () => {
    setQuery("");
    setKind("all");
    setFolder(ALL_FOLDERS);
  };

  // "/" jumps to the search box (unless you're already typing somewhere).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof Element && event.target.closest("input, select, textarea, [contenteditable], dialog")) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const position = previewSrc ? visible.findIndex((file) => file.src === previewSrc) : -1;
  const previewFile = position >= 0 ? visible[position] : null;
  const step = useCallback(
    (delta: number) =>
      setPreviewSrc((current) => {
        const at = visible.findIndex((file) => file.src === current);
        return at < 0 ? current : visible[(at + delta + visible.length) % visible.length].src;
      }),
    [visible],
  );
  const showPrev = useCallback(() => step(-1), [step]);
  const showNext = useCallback(() => step(1), [step]);
  const closePreview = useCallback(() => setPreviewSrc(null), []);

  /** Copied links point at the public file itself, never at this page. */
  const copyLink = (file: PublicFile) => copy(file.src, new URL(file.src, window.location.origin).href);
  const zipHref = (only?: string) => (only === undefined ? `${base}/zip` : `${base}/zip?folder=${encodeURIComponent(only)}`);

  const renderGrid = (list: PublicFile[]) => (
    <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-5">
      {list.map((file, index) => (
        <li key={file.src} className="min-w-0">
          <FileCard
            file={file}
            index={index}
            copied={copied === file.src}
            onCopy={() => copyLink(file)}
            onOpen={() => setPreviewSrc(file.src)}
          />
        </li>
      ))}
    </ul>
  );

  const stats: [string, string][] = [
    ["Files", String(files.length)],
    ["Total size", formatBytes(summary.bytes)],
    ["Folders", String(summary.folderCount)],
    ["Last change", files.length ? formatDay(summary.latest) : "—"],
  ];

  return (
    <div className="relative isolate min-h-svh overflow-x-clip">
      {/* The brand grid fading out under a soft emerald glow. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[40rem]">
        <div className="blueprint fade-radial absolute inset-0 opacity-60 [--grid-size:4rem]" />
        <div className="absolute -top-72 left-1/2 h-[36rem] w-[64rem] max-w-[160vw] -translate-x-1/2 rounded-full bg-em/[0.09] blur-3xl" />
      </div>

      <main className="container-x pb-14 pt-5 md:pt-8">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2.5 text-ink transition-colors duration-300 hover:text-hot">
            <BrandMark mark={mark} className="size-5" />
            <span className={cn("font-display text-[1.05rem] font-semibold leading-none tracking-[-0.045em]", mark?.wide && "sr-only")}>
              {siteName}
            </span>
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-muted backdrop-blur-md">
            <EyeOff aria-hidden="true" className="size-3.5 text-em" />
            Private · not indexed
          </span>
        </div>

        <header className="mt-12 md:mt-20">
          <p className="eyebrow motion-safe:animate-rise-in">
            <span aria-hidden="true" className="h-px w-8 bg-em/50" />
            File library
          </p>
          <div className="mt-5 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl motion-safe:animate-rise-in motion-safe:[animation-delay:80ms]">
              <h1 className="text-h2">
                Public <span className="em-serif">files</span>
              </h1>
              <p className="text-lede mt-5 max-w-2xl">
                Everything in the site&apos;s <span className="font-mono text-[0.9em] text-ink">/public</span> folder. Preview any
                file, copy its link, or download it: one at a time, a folder, or all at once.
              </p>
            </div>
            {files.length > 0 && (
              <a
                href={zipHref()}
                download
                className={buttonClasses(
                  "primary",
                  "lg",
                  "w-full shrink-0 justify-between sm:w-auto sm:self-start lg:self-auto motion-safe:animate-rise-in motion-safe:[animation-delay:160ms]",
                )}
              >
                <span>
                  Download all <span className="font-mono text-[0.78rem] font-normal opacity-70">.zip · {formatBytes(summary.bytes)}</span>
                </span>
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-bg/90 text-em">
                  <Download aria-hidden="true" className="size-4" />
                </span>
              </a>
            )}
          </div>

          {/* Two columns until tablets, where four fit with the date on one line. */}
          <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line md:mt-12 md:grid-cols-4">
            {stats.map(([label, value]) => (
              <div key={label} className="bg-bg-2/95 px-3.5 py-4 sm:px-5 md:px-4 md:py-5 lg:px-6">
                <dt className="label-mono">{label}</dt>
                <dd className="mt-2 font-display text-[1.25rem] leading-none tracking-[-0.03em] text-ink tabular-nums sm:text-[1.5rem] md:text-[1.35rem] lg:text-[1.75rem]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </header>

        {/* Toolbar: sticky from tablets up (on phones it would eat the screen). Three rows on
            phones, two on tablets (search; types + menus), one on desktops. */}
        <div className="-mx-[var(--gutter)] mt-10 border-y border-line bg-bg/80 px-[var(--gutter)] py-3 backdrop-blur-xl md:sticky md:top-0 md:z-30 md:mt-12">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center lg:grid-cols-[20rem_minmax(0,1fr)_auto] xl:grid-cols-[24rem_minmax(0,1fr)_auto]">
            <label className="relative block md:col-span-2 lg:col-span-1">
              <span className="sr-only">Search files</span>
              <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-faint" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name or folder"
                autoComplete="off"
                spellCheck={false}
                className="h-11 w-full rounded-full border border-line bg-surface/80 pl-11 pr-11 text-[0.9rem] text-ink outline-none transition-[border-color,box-shadow] duration-300 placeholder:text-faint hover:border-line-strong focus:border-em/60 focus:shadow-[0_0_0_4px_rgb(60_228_154/0.12)] [&::-webkit-search-cancel-button]:appearance-none"
              />
              {query ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                  className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted transition-colors duration-300 hover:bg-white/[0.06] hover:text-ink"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              ) : (
                <kbd
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-line px-1.5 font-mono text-[0.7rem] leading-5 text-faint md:block"
                >
                  /
                </kbd>
              )}
            </label>

            <div
              role="group"
              aria-label="File type"
              className="no-scrollbar -mx-[var(--gutter)] flex min-w-0 gap-2 overflow-x-auto px-[var(--gutter)] md:mx-0 md:px-0"
            >
              <Chip active={kind === "all"} label="All" count={files.length} onClick={() => setKind("all")} />
              {KINDS.filter((each) => summary.kinds.has(each)).map((each) => (
                <Chip
                  key={each}
                  active={kind === each}
                  label={KIND_LABELS[each]}
                  count={summary.kinds.get(each) ?? 0}
                  onClick={() => setKind(each)}
                />
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 md:flex">
              <Select
                label="Folder"
                value={folder}
                onChange={setFolder}
                options={[
                  [ALL_FOLDERS, "All folders"],
                  ...summary.folders.map((each): [string, string] => [each, each ? `/${each}` : "/ (top level)"]),
                ]}
              />
              <Select label="Sort" value={sort} onChange={(value) => setSort(value as Sort)} options={SORTS} />
            </div>
          </div>
        </div>

        <div className="mt-8 flex min-h-8 items-center justify-between gap-4">
          <p className="label-mono tabular-nums" aria-live="polite">
            {filtered ? `${visible.length} of ${plural(files.length, "file")}` : plural(files.length, "file")}
          </p>
          {filtered && (
            <button type="button" onClick={resetFilters} className="text-[0.82rem] text-em transition-colors duration-300 hover:text-hot">
              Clear filters
            </button>
          )}
        </div>

        {files.length === 0 ? (
          <EmptyState icon={<FolderOpen aria-hidden="true" className="size-6" />} title="Nothing in /public yet">
            Files you add to the project&apos;s <span className="font-mono">public</span> folder show up here.
          </EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState icon={<Search aria-hidden="true" className="size-6" />} title="No files match">
            Try another name, or{" "}
            <button type="button" onClick={resetFilters} className="text-em underline-offset-4 hover:underline">
              clear the filters
            </button>
            .
          </EmptyState>
        ) : groups ? (
          <div className="mt-2 flex flex-col gap-12 md:gap-16">
            {groups.map(([name, list]) => (
              <section key={name || "/"} aria-label={`Folder /${name}`}>
                <div className="flex items-end justify-between gap-4 border-b border-line pb-3">
                  <div className="min-w-0">
                    <h2 className="flex min-w-0 items-center gap-2.5 font-mono text-[0.85rem] text-dim">
                      <FolderOpen aria-hidden="true" className="size-4 shrink-0 text-em" />
                      <span className="truncate">/{name}</span>
                    </h2>
                    <p className="mt-1.5 text-[0.78rem] text-faint">
                      {plural(list.length, "file")} · {formatBytes(list.reduce((sum, file) => sum + file.bytes, 0))}
                    </p>
                  </div>
                  <a
                    href={zipHref(name)}
                    download
                    title={`Download every file in /${name} as a .zip`}
                    aria-label={`Download /${name} as a .zip`}
                    className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-line-strong px-3.5 text-[0.78rem] text-ink transition-[border-color,background-color] duration-300 hover:border-em/60 hover:bg-em/[0.07]"
                  >
                    <Archive aria-hidden="true" className="size-3.5 text-em" />
                    <span>
                      Download <span className="font-mono text-[0.72rem] text-muted sm:hidden">.zip</span>
                      <span className="hidden sm:inline">folder</span>
                    </span>
                  </a>
                </div>
                {renderGrid(list)}
              </section>
            ))}
          </div>
        ) : (
          renderGrid(visible)
        )}

        <footer className="mt-24 flex flex-col gap-3 border-t border-line pt-6 text-[0.8rem] leading-relaxed text-faint md:flex-row md:items-start md:justify-between md:gap-10">
          <p className="flex gap-2.5">
            <Lock aria-hidden="true" className="mt-[0.2rem] size-3.5 shrink-0 text-em/80" />
            Only people who have this page&apos;s address can open it. It isn&apos;t linked from the site or listed by search
            engines.
          </p>
          <p className="md:max-w-sm md:text-right">Copied links point to the files themselves, which are public, never to this page.</p>
        </footer>
      </main>

      <FilePreview
        file={previewFile}
        position={Math.max(position, 0)}
        total={visible.length}
        copied={previewFile !== null && copied === previewFile.src}
        onCopy={() => previewFile && copyLink(previewFile)}
        onPrev={showPrev}
        onNext={showNext}
        onClose={closePreview}
      />
    </div>
  );
}
