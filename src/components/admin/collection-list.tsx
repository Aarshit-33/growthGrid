"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition, type ComponentType } from "react";
import { ArrowUpRight, ChevronRight, EyeOff, FileJson, GripVertical, House, Plus, Rows3, Search, SearchX, Star, X } from "lucide-react";
import { Icon, isIconName } from "@/components/ui/icon";
import { reorderAction, setHomeAction, setVisibilityAction } from "@/lib/admin/actions";
import { adminHref } from "@/lib/admin/config";
import { HOME_SECTION_META, HOME_SWITCH_COPY, type CollectionMeta } from "@/lib/admin/meta";
import type { ActionResult, ListRow } from "@/lib/admin/types";
import type { CollectionName } from "@/lib/content/registry";
import { cn, pad } from "@/lib/utils";
import { COLLECTION_ICONS } from "./icons";
import { useSortable } from "./sortable";
import { toast } from "./toast";
import { BtnLink, PageHeader, Switch, inputClasses } from "./ui";

/* ─────────────────────────────────────────────────────────────
   A collection's list: search and filters, instant switches
   (visible on site, on homepage) and drag-to-reorder. Switches
   apply optimistically and roll back if the save fails.
   ───────────────────────────────────────────────────────────── */

type Change =
  | { type: "visible"; id: string; child?: string; value: boolean }
  | { type: "home"; id: string; value: boolean }
  | { type: "order"; ids: string[] };

function applyChange(rows: ListRow[], change: Change): ListRow[] {
  if (change.type === "order") {
    const byId = new Map(rows.map((row) => [row.id, row]));
    const next = change.ids.flatMap((id) => byId.get(id) ?? []);
    return next.length === rows.length ? next : rows;
  }
  return rows.map((row) => {
    if (row.id !== change.id) return row;
    if (change.type === "home") return { ...row, home: change.value };
    if (!change.child) return { ...row, published: change.value };
    return { ...row, children: row.children?.map((c) => (c.id === change.child ? { ...c, published: change.value } : c)) };
  });
}

type Filter = "all" | "visible" | "hidden" | "home";

const OFFLINE: ActionResult<null> = { ok: false, error: "Couldn't reach the server. Is `npm run dev` still running?" };

function Thumb({ row, fallback: Fallback }: { row: ListRow; fallback: ComponentType<{ className?: string }> }) {
  const box = "relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border";
  if (row.image) {
    return (
      <span className={cn(box, "border-line bg-surface-2")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- small admin thumbnail of any /public path */}
        <img src={row.image} alt="" loading="lazy" className="size-full object-cover" />
      </span>
    );
  }
  if (row.accent || (row.icon && isIconName(row.icon))) {
    const color = row.accent ?? "var(--color-em)";
    return (
      <span
        className={box}
        style={{ color, borderColor: `color-mix(in oklab, ${color} 35%, transparent)`, background: `color-mix(in oklab, ${color} 8%, transparent)` }}
      >
        {row.icon && isIconName(row.icon) ? (
          <Icon name={row.icon} className="size-[1.1rem]" aria-hidden="true" />
        ) : (
          <span className="size-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 12px ${color}` }} />
        )}
      </span>
    );
  }
  return (
    <span className={cn(box, "border-line bg-white/[0.02] text-faint")}>
      <Fallback className="size-4" />
    </span>
  );
}

interface CollectionListProps {
  base: string;
  name: CollectionName;
  meta: CollectionMeta;
  rows: ListRow[];
  /** content/… file the collection lives in. */
  file: string;
}

export function CollectionList({ base, name, meta, rows: savedRows, file }: CollectionListProps) {
  const [rows, apply] = useOptimistic(savedRows, applyChange);
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [settled, setSettled] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const rule = meta.home;
  const homeSwitch = rule === "flag" || rule === "featured" || rule === "scope" ? HOME_SWITCH_COPY[rule] : null;
  const section = meta.homeSection ? HOME_SECTION_META[meta.homeSection].label : "";
  const reorderable = meta.sort !== "date";
  const q = query.trim().toLowerCase();
  const narrowed = q !== "" || filter !== "all";
  const Fallback = COLLECTION_ICONS[name];

  const editHref = (id: string) => adminHref(base, `/collections/${name}/${encodeURIComponent(id)}`);
  const newHref = adminHref(base, `/collections/${name}/new`);
  const siteIndex = meta.href?.replace("/{id}", "");

  /** Show the change now, save it, and let the server's answer settle it (or roll it back). */
  const run = (change: Change, action: () => Promise<ActionResult<null>>, done?: { title: string; body?: string }) =>
    startTransition(async () => {
      apply(change);
      const result = await action().catch(() => OFFLINE);
      if (!result.ok) toast.error(result.error, { body: result.errors });
      else if (result.warnings.length) toast.warn("Saved, with notes", { body: result.warnings });
      else if (done) toast.success(done.title, { body: done.body, duration: 2600 });
    });

  const setVisible = (row: ListRow, value: boolean, child?: { id: string; title: string }) =>
    run(
      { type: "visible", id: row.id, child: child?.id, value },
      () => setVisibilityAction({ name, id: row.id, visible: value, child: child?.id }),
      { title: value ? "Visible on the site" : "Hidden from the site", body: child?.title ?? row.title },
    );

  const setHome = (row: ListRow, value: boolean) =>
    run({ type: "home", id: row.id, value }, () => setHomeAction({ name, id: row.id, value }), {
      title: value ? (rule === "featured" ? "Featured on the homepage" : "Added to the homepage") : "Removed from the homepage",
      body: row.title,
    });

  const commitOrder = (ids: string[], movedId: string) => {
    const moved = rows.find((row) => row.id === movedId);
    setAnnouncement(`${moved?.title ?? "Item"} moved to position ${ids.indexOf(movedId) + 1} of ${ids.length}.`);
    setSettled(movedId);
    setTimeout(() => setSettled((current) => (current === movedId ? null : current)), 1200);
    run({ type: "order", ids }, () => reorderAction({ name, ids }));
  };

  const { order, dragging, handle } = useSortable(
    rows.map((row) => row.id),
    commitOrder,
    reorderable && !narrowed,
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered = order.flatMap((id) => byId.get(id) ?? []);
  const position = new Map(ordered.map((row, i) => [row.id, i + 1]));

  const counts: Record<Filter, number> = {
    all: rows.length,
    visible: rows.filter((row) => row.published).length,
    hidden: rows.filter((row) => !row.published).length,
    home: rows.filter((row) => row.published && row.home).length,
  };
  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "visible", label: "Visible" },
    { id: "hidden", label: "Hidden" },
    ...(rule !== "none" ? [{ id: "home" as const, label: "On homepage" }] : []),
  ];

  const shown = ordered.filter((row) => {
    if (filter === "visible" && !row.published) return false;
    if (filter === "hidden" && row.published) return false;
    if (filter === "home" && !(row.published && row.home)) return false;
    if (!q) return true;
    return [row.title, row.subtitle, row.id, ...(row.chips ?? []), ...(row.children?.map((c) => c.title) ?? [])].some((v) =>
      v?.toLowerCase().includes(q),
    );
  });

  const homeNote = {
    flag: `Switched-on items show in the homepage's ${section} section, and stay on their other pages either way.`,
    featured: `Featured ${meta.label.toLowerCase()} show in the homepage's ${section} section.`,
    scope: "Questions in the Homepage scope show in the homepage FAQ.",
    always: `Every visible ${meta.singular} shows in the homepage's ${section} section.`,
    none: "Not shown on the homepage.",
  }[rule];

  return (
    <div>
      <PageHeader
        eyebrow={meta.group === "content" ? "Content" : "Studio details"}
        title={meta.label}
        description={meta.description}
        className="animate-rise-in"
        actions={
          <>
            {siteIndex && (
              <BtnLink href={siteIndex} external variant="ghost" icon={ArrowUpRight}>
                View on site
              </BtnLink>
            )}
            <BtnLink href={newHref} variant="primary" icon={Plus}>
              New {meta.singular}
            </BtnLink>
          </>
        }
      />

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[0.78rem] text-faint">
        <span className="inline-flex items-center gap-1.5">
          <House className="size-3.5 shrink-0 text-em" aria-hidden="true" />
          {homeNote}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Rows3 className="size-3.5 shrink-0 text-em" aria-hidden="true" />
          {reorderable ? "Drag rows to set their order on the site." : "Newest first, by publish date."}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <FileJson className="size-3.5 shrink-0 text-em" aria-hidden="true" />
          <code className="font-mono text-[0.95em]">{file}</code>
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="card mt-8 grid place-items-center px-6 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-2xl border border-line bg-white/[0.03] text-em">
            <Fallback className="size-5" />
          </span>
          <h2 className="mt-5 font-display text-[1.25rem] font-medium tracking-[-0.02em] text-ink">No {meta.label.toLowerCase()} yet</h2>
          <p className="mt-2 max-w-sm text-[0.88rem] text-muted">{meta.description}</p>
          <BtnLink href={newHref} variant="primary" icon={Plus} className="mt-6">
            New {meta.singular}
          </BtnLink>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1 basis-56 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => event.key === "Escape" && setQuery("")}
                placeholder={`Search ${meta.label.toLowerCase()}`}
                aria-label={`Search ${meta.label.toLowerCase()}`}
                className={inputClasses(false, "h-10 pl-10 pr-9 [&::-webkit-search-cancel-button]:appearance-none")}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-faint transition-colors hover:bg-white/[0.06] hover:text-ink"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
            {/* Wraps on a narrow phone rather than scrolling "On homepage" out of sight. */}
            <div role="group" aria-label="Filter" className="flex max-w-full flex-wrap items-center gap-1 rounded-[1.25rem] border border-line bg-white/[0.02] p-1">
              {filters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[0.78rem] font-medium transition-[background-color,color] duration-200 sm:px-3",
                    filter === f.id ? "bg-white/[0.08] text-ink shadow-[inset_0_0_0_1px_rgb(140_170_190/0.18)]" : "text-muted hover:text-ink",
                  )}
                >
                  {f.label}
                  <span className={cn("font-mono text-[0.66rem]", filter === f.id ? "text-em" : "text-faint")}>{counts[f.id]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Column labels */}
          <div className="mt-6 hidden items-center gap-3 px-4 pb-2 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-faint md:flex">
            {reorderable && <span className="-ml-1 w-6" />}
            {reorderable && <span className="w-6">#</span>}
            <span className="w-10" />
            <span className="flex-1">{meta.singular}</span>
            {homeSwitch && <span className="w-24 text-center">Homepage</span>}
            <span className="w-20 text-center">Visible</span>
            <span className="w-4" />
          </div>

          <p id={`${name}-sort-help`} className="sr-only">
            Arrow keys move this item up or down, Home and End to the start or end. The new order saves straight away.
          </p>
          <p className="sr-only" aria-live="polite">
            {announcement}
          </p>

          {shown.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-line px-6 py-12 text-center">
              <SearchX className="mx-auto size-6 text-faint" aria-hidden="true" />
              <p className="mt-3 text-[0.9rem] text-dim">Nothing matches{q ? ` “${query.trim()}”` : " this filter"}.</p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
                className="mt-3 text-[0.82rem] font-medium text-em transition-colors hover:text-hot"
              >
                Clear search and filter
              </button>
            </div>
          ) : (
            <ol data-sort-list className={cn("mt-2 space-y-2 md:mt-0", dragging && "select-none")}>
              {shown.map((row, i) => {
                const onHome = row.published && row.home;
                return (
                  <li
                    key={row.id}
                    data-sort-id={row.id}
                    className={cn(
                      "group/row relative animate-rise-in rounded-2xl border transition-[border-color,background-color,box-shadow] duration-200 [animation-duration:0.6s]",
                      dragging === row.id
                        ? "z-10 border-em/55 bg-surface-2 shadow-[0_24px_60px_-24px_rgb(0_0_0/0.9),0_0_0_1px_rgb(60_228_154/0.3)]"
                        : "border-line bg-surface/70 hover:border-line-strong hover:bg-surface",
                    )}
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                  >
                    {/* A glow where the row landed (an overlay, so the row's own entrance animation isn't replayed). */}
                    {settled === row.id && <span aria-hidden="true" className="admin-settle pointer-events-none absolute inset-0 rounded-2xl" />}
                    <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                      {reorderable && (
                        <button
                          type="button"
                          {...handle(row.id)}
                          disabled={narrowed}
                          aria-label={`Move ${row.title}`}
                          aria-describedby={`${name}-sort-help`}
                          title={narrowed ? "Clear the search and filter to reorder" : "Drag to reorder, or use the arrow keys"}
                          className="relative z-10 -ml-1 grid h-9 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-md text-faint transition-colors hover:bg-white/[0.05] hover:text-ink focus-visible:outline-2 focus-visible:outline-em active:cursor-grabbing disabled:cursor-default disabled:opacity-25"
                        >
                          <GripVertical className="size-4" aria-hidden="true" />
                        </button>
                      )}
                      {reorderable && (
                        <span className="hidden w-6 shrink-0 font-mono text-[0.68rem] text-faint sm:block">{pad(position.get(row.id) ?? 0)}</span>
                      )}
                      <Thumb row={row} fallback={Fallback} />

                      <div className="min-w-0 flex-1">
                        {/* Titles wrap (a phone leaves ~150px here); the badge drops below a long one. */}
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <Link
                            href={editHref(row.id)}
                            className={cn(
                              "min-w-0 break-words text-[0.92rem] font-medium leading-snug outline-none transition-colors after:absolute after:inset-0 after:rounded-2xl hover:text-hot focus-visible:after:outline-2 focus-visible:after:outline-em",
                              row.published ? "text-ink" : "text-dim",
                            )}
                          >
                            {row.title}
                          </Link>
                          {onHome && rule !== "none" && (
                            <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-em/30 bg-em/[0.08] px-2 font-mono text-[0.6rem] font-medium uppercase tracking-[0.1em] text-hot">
                              {rule === "featured" ? <Star className="size-2.5" aria-hidden="true" /> : <House className="size-2.5" aria-hidden="true" />}
                              {rule === "featured" ? "Featured" : "Homepage"}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.78rem] text-faint">
                          {!row.published && (
                            <span className="inline-flex shrink-0 items-center gap-1 font-medium text-warn">
                              <EyeOff className="size-3" aria-hidden="true" /> Hidden
                            </span>
                          )}
                          {row.subtitle && <span className="min-w-0 break-words">{row.subtitle}</span>}
                          {row.chips?.map((chip) => (
                            <span key={chip} className="hidden shrink-0 rounded-full border border-line px-2 py-px text-[0.68rem] text-muted lg:inline">
                              {chip}
                            </span>
                          ))}
                        </div>
                      </div>

                      {homeSwitch && (
                        <div className="relative z-10 hidden w-24 shrink-0 justify-center md:flex">
                          <Switch
                            size="sm"
                            checked={row.home}
                            disabled={row.homeLocked}
                            onCheckedChange={(value) => setHome(row, value)}
                            label={`${homeSwitch.label}: ${row.title}`}
                            title={row.homeLocked ? "Only on the homepage. Add another page to its scopes first." : homeSwitch.label}
                          />
                        </div>
                      )}
                      <div className="relative z-10 flex shrink-0 justify-center md:w-20">
                        <Switch
                          checked={row.published}
                          onCheckedChange={(value) => setVisible(row, value)}
                          label={`Visible on site: ${row.title}`}
                          title={row.published ? "Visible on the site" : "Hidden from the site"}
                        />
                      </div>
                      <ChevronRight
                        className="hidden size-4 shrink-0 text-faint transition-[color,transform] duration-300 group-hover/row:translate-x-0.5 group-hover/row:text-em sm:block"
                        aria-hidden="true"
                      />
                    </div>

                    {row.children && row.children.length > 0 && (
                      <div className="relative z-10 flex flex-wrap gap-1.5 border-t border-line px-3 py-2.5 sm:px-4 md:pl-[8.5rem]">
                        {row.children.map((child) => (
                          <button
                            key={child.id}
                            type="button"
                            role="switch"
                            aria-checked={child.published}
                            onClick={() => setVisible(row, !child.published, child)}
                            title={child.published ? "Visible. Click to hide." : "Hidden. Click to show."}
                            className={cn(
                              "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[0.74rem] transition-[background-color,border-color,color] duration-200 active:scale-95",
                              child.published
                                ? "border-line-strong bg-white/[0.03] text-dim hover:border-em/50 hover:text-ink"
                                : "border-dashed border-line text-faint line-through decoration-faint/50 hover:text-muted",
                            )}
                          >
                            <span
                              aria-hidden="true"
                              className={cn("size-1.5 rounded-full", child.published ? "bg-em shadow-[0_0_6px_rgb(60_228_154/0.8)]" : "bg-faint/50")}
                            />
                            {child.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {reorderable && narrowed && shown.length > 0 && (
            <p className="mt-3 text-center text-[0.76rem] text-faint">Reordering is paused while a search or filter is on.</p>
          )}
        </>
      )}
    </div>
  );
}
