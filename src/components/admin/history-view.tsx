import Link from "next/link";
import type { ReactNode } from "react";
import { ArchiveRestore, ArrowUpDown, ChevronRight, CopyPlus, Eye, FilePlus2, History, House, PencilLine, Trash2, Undo2, type LucideIcon } from "lucide-react";
import { adminHref } from "@/lib/admin/config";
import { flatten, isImagePath, labelOf, wordDiff, type DiffPart, type FieldChange } from "@/lib/admin/diff";
import type { HistoryAction, HistorySummary, HistoryTarget } from "@/lib/admin/types";
import { cn } from "@/lib/utils";
import { Avatar, RoleBadge } from "./people";
import { TimeAgo } from "./time-ago";
import type { Tone } from "./ui";

/* ─────────────────────────────────────────────────────────────
   History's building blocks: entry rows, and the previous-vs-
   current views of one change. No hooks: server pages render
   them (TimeAgo is the only client piece).
   ───────────────────────────────────────────────────────────── */

export const ACTION_META: Record<HistoryAction, { label: string; icon: LucideIcon; tone: Tone }> = {
  create: { label: "Created", icon: FilePlus2, tone: "em" },
  update: { label: "Edited", icon: PencilLine, tone: "info" },
  delete: { label: "Deleted", icon: Trash2, tone: "danger" },
  duplicate: { label: "Duplicated", icon: CopyPlus, tone: "em" },
  visibility: { label: "Visibility", icon: Eye, tone: "warn" },
  home: { label: "Homepage", icon: House, tone: "em" },
  reorder: { label: "Reordered", icon: ArrowUpDown, tone: "muted" },
  revoke: { label: "Revoked", icon: Undo2, tone: "warn" },
};

const metaOf = (action: HistoryAction) => ACTION_META[action] ?? ACTION_META.update;

const TONE_TILE: Record<Tone, string> = {
  em: "border-em/30 bg-em/[0.08] text-em",
  info: "border-info/30 bg-info/[0.08] text-info",
  warn: "border-warn/30 bg-warn/[0.08] text-warn",
  danger: "border-danger/35 bg-danger/[0.08] text-danger",
  muted: "border-line-strong bg-white/[0.03] text-dim",
};

export function ActionIcon({ action, className }: { action: HistoryAction; className?: string }) {
  const { icon: Icon, tone } = metaOf(action);
  return (
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl border", TONE_TILE[tone], className)}>
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}

/** The Studio screen for what a change touched (null: nothing to open, e.g. a deleted item). */
export function targetPath(target: HistoryTarget, exists = true): string | null {
  switch (target.kind) {
    case "settings":
      return "/settings";
    case "layout":
      return "/homepage";
    case "page":
      return `/pages/${target.key}`;
    case "list":
      return `/collections/${target.name}`;
    case "item":
      return exists ? `/collections/${target.name}/${encodeURIComponent(target.id)}` : null;
  }
}

export const entryPath = (id: string) => `/history/${encodeURIComponent(id)}`;

/* ── Screen furniture ─────────────────────────────────────── */

export function HistoryTabs({ base, active, deleted }: { base: string; active: "changes" | "deleted"; deleted: number }) {
  const tabs = [
    { key: "changes", label: "All changes", path: "/history", icon: History, count: undefined },
    { key: "deleted", label: "Deleted items", path: "/history/deleted", icon: ArchiveRestore, count: deleted },
  ] as const;
  return (
    <nav aria-label="History views" className="flex flex-wrap gap-2">
      {tabs.map(({ key, label, path, icon: Icon, count }) => {
        const on = active === key;
        return (
          <Link
            key={key}
            href={adminHref(base, path)}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full border px-4 text-[0.84rem] transition-colors duration-200",
              on ? "border-em/40 bg-em/[0.1] text-ink" : "border-line text-muted hover:border-line-strong hover:text-ink",
            )}
          >
            <Icon className={cn("size-4", on ? "text-em" : "text-faint")} aria-hidden="true" />
            {label}
            {count !== undefined && <span className="font-mono text-[0.68rem] text-faint">{count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** An inline note (banners.tsx is a client component, so server pages use this). */
export function Notice({ tone = "info", icon: Icon, children }: { tone?: "info" | "warn"; icon: LucideIcon; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-[0.86rem] leading-relaxed text-dim",
        tone === "warn" ? "border-warn/35 bg-warn/[0.05]" : "border-info/30 bg-info/[0.05]",
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "warn" ? "text-warn" : "text-info")} aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ── Lists of changes ─────────────────────────────────────── */

export function EntryRow({ entry, base, compact = false }: { entry: HistorySummary; base: string; compact?: boolean }) {
  return (
    <li className="group/entry relative flex items-start gap-3.5 rounded-2xl px-3 py-3 transition-colors duration-200 hover:bg-white/[0.03] sm:px-4">
      <ActionIcon action={entry.action} className={compact ? "size-8 rounded-lg" : undefined} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={adminHref(base, entryPath(entry.id))}
            className="min-w-0 break-words text-[0.9rem] font-medium text-ink after:absolute after:inset-0 after:rounded-2xl"
          >
            {entry.title}
          </Link>
          {entry.revokedBy && (
            <span className="shrink-0 rounded-full border border-warn/30 bg-warn/[0.08] px-2 py-px font-mono text-[0.56rem] uppercase tracking-[0.12em] text-warn">
              Revoked
            </span>
          )}
        </div>
        <p className={cn("mt-0.5 text-[0.82rem] leading-snug text-muted", compact ? "line-clamp-1" : "line-clamp-2")}>{entry.summary}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.74rem] text-faint">
          <Avatar user={entry.user} size="sm" />
          <span className="text-dim">{entry.user.name}</span>
          {!compact && <RoleBadge role={entry.user.role} />}
          <span aria-hidden="true">·</span>
          <TimeAgo at={entry.at} />
          {!compact && (
            <>
              <span aria-hidden="true" className="hidden sm:inline">
                ·
              </span>
              <code className="hidden font-mono text-[0.7rem] sm:inline">{entry.file}</code>
            </>
          )}
        </p>
      </div>
      <ChevronRight
        className="mt-2.5 size-4 shrink-0 text-faint transition-[color,transform] duration-300 group-hover/entry:translate-x-0.5 group-hover/entry:text-em"
        aria-hidden="true"
      />
    </li>
  );
}

const dayFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

/** Newest-first changes grouped by day: "Today", "Yesterday", "Fri, 2 Oct 2026". */
export function groupByDay(entries: HistorySummary[]): { label: string; entries: HistorySummary[] }[] {
  const now = new Date();
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const groups: { key: string; label: string; entries: HistorySummary[] }[] = [];
  for (const entry of entries) {
    const date = new Date(entry.at);
    const key = dayKey(date);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: key === today ? "Today" : key === yesterday ? "Yesterday" : dayFormat.format(date), entries: [] };
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

/* ── One value ────────────────────────────────────────────── */

type Side = "before" | "after";

/** On/off flags where a missing key means on. */
const DEFAULT_ON = /(^|\.)(published|home)$/;

const Empty = () => <span className="italic text-faint">Empty</span>;

function Thumb({ src }: { src: string }) {
  return (
    <span className="flex items-center gap-3">
      <span className="h-12 w-16 shrink-0 overflow-hidden rounded-lg border border-line bg-white/[0.03]">
        {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of any /public path */}
        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      </span>
      <code className="min-w-0 break-all font-mono text-[0.74rem] text-muted">{src}</code>
    </span>
  );
}

/** Word-level highlights: what the previous text lost, or what the current text gained. */
function DiffText({ parts, side }: { parts: DiffPart[]; side: Side }) {
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (part.kind === "same") return <span key={i}>{part.text}</span>;
        if (side === "before" && part.kind === "del") {
          return (
            <del key={i} className="rounded-[3px] bg-danger/[0.16] px-px text-[#ffc2c2] decoration-danger/70">
              {part.text}
            </del>
          );
        }
        if (side === "after" && part.kind === "add") {
          return (
            <ins key={i} className="rounded-[3px] bg-em/[0.16] px-px text-hot no-underline">
              {part.text}
            </ins>
          );
        }
        return null;
      })}
    </span>
  );
}

const show = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value));

/**
 * A field's value, readable: text, on/off, numbers, image thumbnails, tags.
 * With `other` and `side`, highlights what changed against the other version.
 */
export function ValueView({
  value,
  path,
  other,
  side,
  parts,
}: {
  value: unknown;
  path: string;
  other?: unknown;
  side?: Side;
  /** Precomputed word diff, when both versions are text. */
  parts?: DiffPart[];
}) {
  const shown = value === undefined && DEFAULT_ON.test(path) ? true : value;
  if (shown === undefined || shown === null || shown === "") return <Empty />;
  if (typeof shown === "boolean") {
    return (
      <span className="inline-flex items-center gap-2">
        <span aria-hidden="true" className={cn("size-1.5 rounded-full", shown ? "bg-em" : "bg-faint")} />
        {shown ? "On" : "Off"}
      </span>
    );
  }
  if (typeof shown === "number") return <span className="font-mono">{shown}</span>;
  if (typeof shown === "string") {
    if (isImagePath(shown)) return <Thumb src={shown} />;
    if (parts && side) return <DiffText parts={parts} side={side} />;
    return <span className="whitespace-pre-wrap break-words">{shown}</span>;
  }
  if (Array.isArray(shown)) {
    if (shown.length === 0) return <Empty />;
    const others = Array.isArray(other) ? new Set(other.map(show)) : null;
    return (
      <span className="flex flex-wrap gap-1.5">
        {shown.map((item, i) => {
          const changed = side && others && !others.has(show(item));
          return (
            <span
              key={i}
              className={cn(
                "rounded-md border px-2 py-0.5 text-[0.76rem]",
                !changed && "border-line bg-white/[0.03] text-dim",
                changed && side === "before" && "border-danger/40 bg-danger/10 text-[#ffc2c2] line-through decoration-danger/70",
                changed && side === "after" && "border-em/40 bg-em/10 text-hot",
              )}
            >
              {show(item)}
            </span>
          );
        })}
      </span>
    );
  }
  return <code className="break-all font-mono text-[0.76rem] text-muted">{JSON.stringify(shown)}</code>;
}

/* ── Previous vs current ──────────────────────────────────── */

const MAX_ROWS = 80;
const COLUMNS = "md:grid-cols-[minmax(9rem,13rem)_minmax(0,1fr)_minmax(0,1fr)]";

function Cell({ side, children }: { side: Side; children: ReactNode }) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border px-3.5 py-3 text-[0.86rem] leading-relaxed text-dim",
        side === "before" ? "border-danger/20 bg-danger/[0.035]" : "border-em/20 bg-em/[0.035]",
      )}
    >
      <span className={cn("label-mono mb-1.5 block text-[0.56rem] md:hidden", side === "before" ? "text-danger/80" : "text-em/90")}>
        {side === "before" ? "Previous" : "Current"}
      </span>
      {children}
    </div>
  );
}

function ColumnHeads({ first = "Field" }: { first?: string }) {
  return (
    <div className={cn("hidden gap-4 border-b border-line pb-2.5 md:grid", COLUMNS)}>
      <span className="label-mono text-[0.58rem] text-faint">{first}</span>
      <span className="label-mono text-[0.58rem] text-danger/80">Previous</span>
      <span className="label-mono text-[0.58rem] text-em/90">Current</span>
    </div>
  );
}

const More = ({ count, what }: { count: number; what: string }) =>
  count > 0 ? (
    <p className="pt-3 text-[0.8rem] text-faint">
      …and {count} more {what}.
    </p>
  ) : null;

/** The fields one change touched: previous on the left, current on the right. */
export function ChangeTable({ changes }: { changes: FieldChange[] }) {
  if (changes.length === 0) return <p className="text-[0.86rem] text-muted">No visible differences.</p>;
  return (
    <div>
      <ColumnHeads />
      <ol className="divide-y divide-line">
        {changes.slice(0, MAX_ROWS).map((change) => {
          const { before, after } = change;
          const text = typeof before === "string" && typeof after === "string" && !isImagePath(before) && !isImagePath(after);
          const parts = text ? wordDiff(before, after) : undefined;
          return (
            <li key={change.path} className={cn("grid gap-2.5 py-4 md:gap-4", COLUMNS)}>
              <div className="min-w-0">
                <p className="text-[0.84rem] font-medium text-ink">{change.label}</p>
                <code className="mt-0.5 block font-mono text-[0.66rem] text-faint wrap-anywhere">{change.path}</code>
              </div>
              <Cell side="before">
                <ValueView value={before} path={change.path} other={after} side="before" parts={parts} />
              </Cell>
              <Cell side="after">
                <ValueView value={after} path={change.path} other={before} side="after" parts={parts} />
              </Cell>
            </li>
          );
        })}
      </ol>
      <More count={changes.length - MAX_ROWS} what="fields" />
    </div>
  );
}

/** A whole item, field by field (what a change created, or what a delete removed). */
export function SnapshotTable({ value }: { value: unknown }) {
  const rows = [...flatten(value).entries()];
  if (rows.length === 0) return <p className="text-[0.86rem] text-muted">Empty.</p>;
  return (
    <div>
      <dl className="divide-y divide-line">
        {rows.slice(0, MAX_ROWS).map(([path, item]) => (
          <div key={path} className="grid gap-1.5 py-3 md:grid-cols-[minmax(9rem,13rem)_minmax(0,1fr)] md:gap-4">
            <dt className="min-w-0">
              <span className="block text-[0.82rem] font-medium text-dim">{labelOf(path)}</span>
              <code className="mt-0.5 block font-mono text-[0.66rem] text-faint wrap-anywhere">{path}</code>
            </dt>
            <dd className="min-w-0 text-[0.86rem] leading-relaxed text-muted">
              <ValueView value={item} path={path} />
            </dd>
          </div>
        ))}
      </dl>
      <More count={rows.length - MAX_ROWS} what="fields" />
    </div>
  );
}

/* ── Orders: a collection's order, the homepage's sections ── */

export interface OrderRow {
  id: string;
  label: string;
  /** Homepage sections: switched on. */
  on?: boolean;
}

/** Ids outside the longest common subsequence: the ones that moved (empty when the lists are too long to compare). */
function movedIds(before: string[], after: string[]): Set<string> {
  const n = before.length;
  const m = after.length;
  if (n * m > 250_000) return new Set();
  const width = m + 1;
  const table = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] = before[i] === after[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const kept = new Set<string>();
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (before[i] === after[j]) {
      kept.add(before[i]);
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) i++;
    else j++;
  }
  return new Set([...before, ...after].filter((id) => !kept.has(id)));
}

function OrderColumn({ side, rows, marked }: { side: Side; rows: OrderRow[]; marked: Set<string> }) {
  return (
    <div className={cn("rounded-2xl border p-2", side === "before" ? "border-danger/20 bg-danger/[0.02]" : "border-em/20 bg-em/[0.02]")}>
      <p className={cn("label-mono px-2.5 pb-2 pt-1.5 text-[0.58rem]", side === "before" ? "text-danger/80" : "text-em/90")}>
        {side === "before" ? "Previous" : "Current"}
      </p>
      <ol className="space-y-0.5">
        {rows.map((row, i) => {
          const hit = marked.has(row.id);
          return (
            <li
              key={row.id}
              className={cn(
                "flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-[0.84rem]",
                hit && side === "before" && "bg-danger/[0.08] text-[#ffc2c2]",
                hit && side === "after" && "bg-em/[0.08] text-hot",
                !hit && "text-dim",
              )}
            >
              <span className="w-6 shrink-0 text-right font-mono text-[0.7rem] text-faint">{String(i + 1).padStart(2, "0")}</span>
              <span className={cn("min-w-0 flex-1 break-words", row.on === false && !hit && "text-faint line-through decoration-faint/60")}>{row.label}</span>
              {row.on !== undefined && (
                <span className={cn("shrink-0 font-mono text-[0.6rem] uppercase tracking-[0.12em]", row.on ? "text-em" : "text-faint")}>
                  {row.on ? "On" : "Off"}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Two orders side by side; moved, added, removed or switched rows are lit. */
export function OrderCompare({ before, after }: { before: OrderRow[]; after: OrderRow[] }) {
  const marked = movedIds(
    before.map((row) => row.id),
    after.map((row) => row.id),
  );
  const was = new Map(before.map((row) => [row.id, row.on]));
  for (const row of after) if (was.has(row.id) && was.get(row.id) !== row.on) marked.add(row.id);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <OrderColumn side="before" rows={before} marked={marked} />
      <OrderColumn side="after" rows={after} marked={marked} />
    </div>
  );
}
