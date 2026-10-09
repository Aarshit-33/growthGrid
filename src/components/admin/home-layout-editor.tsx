"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Check,
  EyeOff,
  FileJson,
  GripVertical,
  LayoutList,
  ListRestart,
  LoaderCircle,
  Lock,
  MountainSnow,
  PanelsTopLeft,
  PenLine,
  RotateCcw,
  Save,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { saveHomeLayoutAction } from "@/lib/admin/actions";
import { adminHref } from "@/lib/admin/config";
import { AFTERCARE_META, COLLECTION_META, HOME_SECTION_META } from "@/lib/admin/meta";
import type { ActionResult, HomeSectionStatus } from "@/lib/admin/types";
import type { HomeSectionConfig, HomeSectionId } from "@/lib/schemas";
import { cn, pad } from "@/lib/utils";
import { FailureBanner, type Failure } from "./banners";
import { useModKey, useSaveShortcut, useUnsavedGuard } from "./hooks";
import { AFTERCARE_ICON, COLLECTION_ICONS } from "./icons";
import { useSortable } from "./sortable";
import { toast } from "./toast";
import { Badge, Btn, BtnLink, Dot, Kbd, Panel, Switch } from "./ui";

/* ─────────────────────────────────────────────────────────────
   Homepage layout: the order visitors scroll through and which
   sections show. The hero always opens the page and the closing
   call to action always ends it; everything in between is
   dragged into place and switched on or off, then saved at once.
   ───────────────────────────────────────────────────────────── */

type Section = HomeSectionConfig;

export interface HomeLayoutEditorProps {
  base: string;
  /** The saved layout, resolved: every section once, the pinned one last. */
  sections: Section[];
  /** Code order with every section on (for "Reset to default"). */
  defaults: Section[];
  /** Sections that carry a numbered label ("01", "02"…) on the site. */
  numbered: HomeSectionId[];
  /** The section that always ends the page. */
  pinnedLast: HomeSectionId;
  status: Record<HomeSectionId, HomeSectionStatus>;
  /** Titles of what each section shows, in site order. */
  items: Partial<Record<HomeSectionId, string[]>>;
  /** Plain-text headlines of the hero and the closing section. */
  headlines: { hero?: string; last?: string };
  version: string;
  /** content/… file the layout is stored in. */
  file: string;
}

const sameLayout = (a: readonly Section[], b: readonly Section[]) =>
  a.length === b.length && a.every((section, i) => section.id === b[i].id && section.enabled === b[i].enabled);

const OFFLINE: Failure = { ok: false, error: "Couldn't reach the server. Is `npm run dev` still running?" };

const SECTION_ICONS: Partial<Record<HomeSectionId, LucideIcon>> = { aftercare: AFTERCARE_ICON, cta: MountainSnow };

function sectionIcon(id: HomeSectionId): LucideIcon {
  const collection = HOME_SECTION_META[id].collection;
  return SECTION_ICONS[id] ?? (collection ? COLLECTION_ICONS[collection] : PanelsTopLeft);
}

/** Rough share of the page each section takes, so the map reads like the page. */
const MAP_HEIGHT: Record<HomeSectionId, string> = {
  proof: "h-4",
  problem: "h-7",
  services: "h-8",
  process: "h-7",
  aftercare: "h-6",
  work: "h-9",
  principles: "h-6",
  technology: "h-8",
  audiences: "h-7",
  testimonials: "h-6",
  insights: "h-7",
  faq: "h-6",
  cta: "h-7",
};

interface RowLinkDef {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Icon button on wide screens, icon and label on narrow ones (the label names it for screen readers either way). */
function RowLink({ href, label, icon: IconComponent }: RowLinkDef) {
  return (
    <Link
      href={href}
      title={label}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[0.74rem] text-muted transition-colors hover:bg-white/[0.06] hover:text-ink focus-visible:outline-2 focus-visible:outline-em sm:w-8 sm:justify-center sm:px-0"
    >
      <IconComponent className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="sm:sr-only">{label}</span>
    </Link>
  );
}

/** A lock where the drag handle would be. */
function Pinned({ title }: { title: string }) {
  return (
    <span title={title} className="-ml-1 grid h-9 w-6 shrink-0 place-items-center text-faint/70">
      <Lock className="size-3.5" aria-hidden="true" />
    </span>
  );
}

/** Inside every row: handle, number, icon, name and contents, links, switch. */
function RowBody({
  grip,
  number,
  icon: IconComponent,
  title,
  badge,
  detail,
  shown,
  links,
  control,
}: {
  grip: ReactNode;
  /** "01", "02"… when the section shows with a number. */
  number?: string;
  icon: LucideIcon;
  title: string;
  badge?: ReactNode;
  detail: ReactNode;
  /** Visitors see this section. */
  shown: boolean;
  links: RowLinkDef[];
  control?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-3 sm:flex-nowrap sm:px-4">
      {grip}
      <span
        title={number ? `Labelled ${number} on the homepage` : shown ? "Shown, without a number" : "Not shown"}
        className={cn("w-6 shrink-0 text-center font-mono text-[0.72rem] transition-colors duration-300", shown ? "text-em" : "text-faint/70")}
      >
        {number ?? (shown ? "•" : "—")}
      </span>
      <span
        className={cn(
          "hidden size-10 shrink-0 place-items-center rounded-xl border transition-colors duration-300 sm:grid",
          shown ? "border-line-strong bg-white/[0.035] text-em" : "border-line bg-white/[0.015] text-faint",
        )}
      >
        <IconComponent className="size-[1.1rem]" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("truncate text-[0.92rem] font-medium transition-colors duration-300", shown ? "text-ink" : "text-dim")}>{title}</span>
          {badge}
        </div>
        <p className="mt-0.5 truncate text-[0.78rem] text-faint">{detail}</p>
      </div>
      {links.length > 0 && (
        <div className="order-last flex basis-full items-center gap-0.5 pl-[3.75rem] sm:order-none sm:basis-auto sm:pl-0">
          {links.map((link) => (
            <RowLink key={link.href} {...link} />
          ))}
        </div>
      )}
      <div className="flex w-11 shrink-0 justify-center">{control}</div>
    </div>
  );
}

/** The page in miniature: what visitors scroll through, live while dragging. */
function PageMap({
  showing,
  numbers,
  active,
  hidden,
}: {
  showing: Section[];
  numbers: Map<HomeSectionId, string>;
  active: HomeSectionId | null;
  hidden: { id: HomeSectionId; reason: "off" | "empty" }[];
}) {
  return (
    <Panel title="Page map" icon={PanelsTopLeft} bodyClassName="py-4">
      <div aria-hidden="true" className="rounded-xl border border-line bg-bg/60 p-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.03)]">
        <div className="mb-2 flex items-center gap-1 px-0.5">
          <span className="size-1.5 rounded-full bg-white/15" />
          <span className="size-1.5 rounded-full bg-white/15" />
          <span className="size-1.5 rounded-full bg-white/15" />
          <span className="ml-1.5 h-2.5 flex-1 rounded-full bg-white/[0.05]" />
        </div>
        <ol className="space-y-1">
          <li className="flex h-12 items-end rounded-md border border-em/30 bg-[linear-gradient(140deg,rgb(60_228_154/0.24),rgb(60_228_154/0.03)_70%)] px-2 pb-1.5">
            <span className="text-[0.6rem] font-medium text-ink">Hero</span>
          </li>
          {showing.map((section) => (
            <li
              key={section.id}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2 transition-[background-color,border-color,color,box-shadow] duration-200",
                MAP_HEIGHT[section.id],
                active === section.id
                  ? "border-em/60 bg-em/[0.14] text-ink shadow-[0_0_16px_-4px_rgb(60_228_154/0.6)]"
                  : "border-line bg-white/[0.025] text-muted",
              )}
            >
              <span className="w-3.5 shrink-0 font-mono text-[0.52rem] text-em/80">{numbers.get(section.id)}</span>
              <span className="truncate text-[0.6rem]">{HOME_SECTION_META[section.id].label}</span>
            </li>
          ))}
        </ol>
      </div>
      <p className="mt-3 text-[0.76rem] leading-relaxed text-faint">
        What visitors scroll through, top to bottom. Point at a row to find it here.
      </p>
      {hidden.length > 0 && (
        <div className="mt-3.5 border-t border-line pt-3.5">
          <p className="label-mono mb-2 text-[0.6rem] text-faint">Not showing</p>
          <ul className="flex flex-wrap gap-1.5">
            {hidden.map(({ id, reason }) => (
              <li
                key={id}
                title={reason === "off" ? "Switched off" : "Nothing to show yet"}
                className={cn(
                  "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-[0.7rem]",
                  reason === "off" ? "border-line text-faint" : "border-warn/30 bg-warn/[0.05] text-warn",
                )}
              >
                {reason === "off" ? <EyeOff className="size-3" aria-hidden="true" /> : <TriangleAlert className="size-3" aria-hidden="true" />}
                {HOME_SECTION_META[id].label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

export function HomeLayoutEditor({
  base,
  sections,
  defaults,
  numbered,
  pinnedLast,
  status,
  items,
  headlines,
  version: initialVersion,
  file,
}: HomeLayoutEditorProps) {
  const mod = useModKey();
  // The editor owns its copy once mounted: the refresh after a save never resets the screen.
  const [layout, setLayout] = useState(sections);
  const [saved, setSaved] = useState(sections);
  const [version, setVersion] = useState(initialVersion);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [settled, setSettled] = useState<HomeSectionId | null>(null);
  const [hovered, setHovered] = useState<HomeSectionId | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const dirty = !sameLayout(layout, saved);
  const isDefault = sameLayout(layout, defaults);
  useUnsavedGuard(dirty);

  const href = (path: string) => adminHref(base, path);
  const labelOf = (id: HomeSectionId) => HOME_SECTION_META[id].label;
  const shows = (section: Section) => section.enabled && !status[section.id].empty;

  // Everything but the pinned section is sortable; the pinned one stays last.
  const commitOrder = (ids: string[], movedId: string) => {
    const moved = movedId as HomeSectionId;
    setLayout((previous) => {
      const byId = new Map<string, Section>(previous.map((section) => [section.id, section]));
      return [...ids.flatMap((id) => byId.get(id) ?? []), ...previous.filter((section) => section.id === pinnedLast)];
    });
    setAnnouncement(`${labelOf(moved)} moved to position ${ids.indexOf(movedId) + 1} of ${ids.length}. Save to publish.`);
    setSettled(moved);
    setTimeout(() => setSettled((current) => (current === moved ? null : current)), 1200);
  };

  const movable = layout.filter((section) => section.id !== pinnedLast);
  const last = layout.find((section) => section.id === pinnedLast);
  const { order, dragging, handle } = useSortable(
    movable.map((section) => section.id),
    commitOrder,
  );
  const byId = new Map<string, Section>(layout.map((section) => [section.id, section]));
  const ordered = order.flatMap((id) => byId.get(id) ?? []);
  /** The page from top to bottom (the live order while dragging). */
  const page = last ? [...ordered, last] : ordered;

  // "01", "02"… follow the sections that show, exactly as the homepage numbers them.
  const numberedIds = new Set(numbered);
  const numbers = new Map<HomeSectionId, string>();
  for (const section of page) {
    if (shows(section) && numberedIds.has(section.id)) numbers.set(section.id, pad(numbers.size + 1));
  }
  const showing = page.filter(shows);
  const hidden = page
    .filter((section) => !shows(section))
    .map((section) => ({ id: section.id, reason: section.enabled ? ("empty" as const) : ("off" as const) }));

  const toggle = (id: HomeSectionId, enabled: boolean) =>
    setLayout((previous) => previous.map((section) => (section.id === id ? { ...section, enabled } : section)));

  const save = async (force = false) => {
    if (saving) return;
    setSaving(true);
    const next = layout;
    let result: ActionResult<{ version: string }>;
    try {
      result = await saveHomeLayoutAction({ sections: next, version, force });
    } catch {
      result = OFFLINE;
    }
    setSaving(false);

    if (!result.ok) {
      setFailure(result);
      if (!result.conflict && !result.auth) toast.error(result.error, { body: result.errors });
      return;
    }
    setSaved(next);
    setVersion(result.data.version);
    setFailure(null);
    if (result.warnings.length) toast.warn("Layout saved, with notes", { body: result.warnings });
    else toast.success("Homepage layout saved", { body: `${showing.length + 1} sections showing. Written to ${file}.` });
  };

  useSaveShortcut(() => {
    if (dirty) void save();
  });

  const discard = () => {
    setLayout(saved);
    setFailure(null);
  };

  /** Second line of a row: what the section shows right now. */
  const detailOf = (section: Section): ReactNode => {
    const { units, description } = HOME_SECTION_META[section.id];
    const { count, empty } = status[section.id];
    if (empty) return "Nothing to show yet, so the homepage skips it.";
    if (count === null || count === 0 || !units) return description;
    const titles = items[section.id] ?? [];
    const more = count - Math.min(titles.length, 3);
    return (
      <>
        <span className="text-muted">
          {count} {units[count === 1 ? 0 : 1]}
        </span>
        {titles.length > 0 && (
          <>
            {" · "}
            {titles.slice(0, 3).join(", ")}
            {more > 0 && ` +${more}`}
          </>
        )}
      </>
    );
  };

  const badgeOf = (section: Section) => {
    if (!section.enabled) return <Badge icon={EyeOff}>Off</Badge>;
    if (status[section.id].empty) {
      return (
        <Badge tone="warn" icon={TriangleAlert} title="Nothing to show, so the homepage skips this section">
          Empty
        </Badge>
      );
    }
    return null;
  };

  /** Where to change what a section shows: its items, then its words. */
  const linksOf = (id: HomeSectionId): RowLinkDef[] => {
    const collection = HOME_SECTION_META[id].collection;
    return [
      ...(collection ? [{ href: href(`/collections/${collection}`), label: COLLECTION_META[collection].label, icon: COLLECTION_ICONS[collection] }] : []),
      ...(id === "aftercare" ? [{ href: href(AFTERCARE_META.path), label: "Warranty & care plans", icon: AFTERCARE_ICON }] : []),
      { href: href(`/pages/home#sec-${id}`), label: "Edit text", icon: PenLine },
    ];
  };

  const switchFor = (section: Section) => (
    <Switch
      checked={section.enabled}
      onCheckedChange={(on) => toggle(section.id, on)}
      label={`Show ${labelOf(section.id)} on the homepage`}
      title={section.enabled ? "Shown on the homepage" : "Hidden from the homepage"}
    />
  );

  const statusLine = saving ? (
    <span className="inline-flex items-center gap-2 text-[0.78rem] text-muted">
      <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> Saving…
    </span>
  ) : dirty ? (
    <span className="inline-flex items-center gap-2 text-[0.78rem] text-warn">
      <Dot tone="warn" pulse /> Unsaved changes
    </span>
  ) : (
    <span className="inline-flex items-center gap-2 text-[0.78rem] text-muted">
      <Check className="size-3.5 text-em" aria-hidden="true" /> All changes saved
    </span>
  );

  return (
    <div className="pb-28">
      {/* Sticky action bar */}
      <div className="sticky top-14 z-30 -mx-[var(--admin-px)] border-b border-line bg-bg/80 px-[var(--admin-px)] backdrop-blur-xl lg:top-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[0.76rem] text-faint">
              <span className="label-mono text-[0.64rem]">Homepage</span>
              <span aria-hidden="true">·</span>
              <span aria-live="polite">{statusLine}</span>
            </div>
            <h1 className="mt-1 truncate font-display text-[1.35rem] font-medium tracking-[-0.025em] text-ink sm:text-[1.6rem]">Homepage layout</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BtnLink href="/" external size="sm" variant="ghost" icon={ArrowUpRight}>
              View homepage
            </BtnLink>
            <Btn
              size="sm"
              variant="ghost"
              icon={ListRestart}
              onClick={() => setLayout(defaults)}
              disabled={isDefault || saving}
              title="The original order with every section on. Nothing changes until you save."
            >
              Reset to default
            </Btn>
            {dirty && (
              <Btn size="sm" variant="ghost" icon={RotateCcw} onClick={discard} disabled={saving}>
                Discard
              </Btn>
            )}
            <Btn variant="primary" icon={Save} onClick={() => save()} loading={saving} disabled={!dirty} title={`Save (${mod}+S)`}>
              Save layout
              <span className="hidden xl:inline-flex">
                <Kbd onAccent>{mod === "⌘" ? "⌘S" : "Ctrl S"}</Kbd>
              </span>
            </Btn>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_17.5rem]">
        <div className="min-w-0 space-y-5">
          <div className="animate-rise-in">
            <p className="max-w-2xl text-[0.95rem] leading-relaxed text-muted">
              The order visitors scroll through. Drag a section to move it, switch it off to hide it. Nothing changes on the site until you
              save.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[0.78rem] text-faint">
              <span className="inline-flex items-center gap-1.5">
                <LayoutList className="size-3.5 shrink-0 text-em" aria-hidden="true" />
                <span>
                  <span className="text-ink">{showing.length + 1}</span> of {page.length + 1} sections showing
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <TriangleAlert className="size-3.5 shrink-0 text-em" aria-hidden="true" />
                Empty sections are skipped on their own
              </span>
              <span className="inline-flex items-center gap-1.5">
                <FileJson className="size-3.5 shrink-0 text-em" aria-hidden="true" />
                <code className="font-mono text-[0.95em]">{file}</code>
              </span>
            </div>
          </div>

          {failure && (
            <FailureBanner failure={failure} base={base} onRetry={() => save()} onForce={() => save(true)} onDismiss={() => setFailure(null)} />
          )}

          <p id="home-sort-help" className="sr-only">
            Arrow keys move this section up or down, Home and End to the start or end. Save to publish the new order.
          </p>
          <p className="sr-only" aria-live="polite">
            {announcement}
          </p>

          <div>
            {/* Column labels */}
            <div className="hidden items-center gap-3 px-4 pb-2 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-faint md:flex">
              <span className="-ml-1 w-6" />
              <span className="w-6 text-center">#</span>
              <span className="w-10" />
              <span className="flex-1">Section</span>
              <span className="w-11 text-center">Show</span>
            </div>

            <div className="space-y-2">
              {/* Always first */}
              <div className="relative animate-rise-in rounded-2xl border border-em/20 bg-[linear-gradient(90deg,rgb(60_228_154/0.06),transparent_60%)] [animation-duration:0.6s]">
                <RowBody
                  grip={<Pinned title="The hero always opens the page" />}
                  icon={Sparkles}
                  title="Hero"
                  badge={<Badge>Always first</Badge>}
                  detail={headlines.hero ? `“${headlines.hero}”` : "Headline, intro and the two buttons"}
                  shown
                  links={[{ href: href("/pages/home#sec-hero"), label: "Edit text", icon: PenLine }]}
                />
              </div>

              <ol data-sort-list className={cn("space-y-2", dragging && "select-none")}>
                {ordered.map((section, i) => {
                  const label = labelOf(section.id);
                  const leave = () => setHovered((current) => (current === section.id ? null : current));
                  return (
                    <li
                      key={section.id}
                      data-sort-id={section.id}
                      onPointerEnter={() => setHovered(section.id)}
                      onPointerLeave={leave}
                      onFocus={() => setHovered(section.id)}
                      onBlur={leave}
                      className={cn(
                        "relative animate-rise-in rounded-2xl border transition-[border-color,background-color,box-shadow] duration-200 [animation-duration:0.6s]",
                        dragging === section.id
                          ? "z-10 border-em/55 bg-surface-2 shadow-[0_24px_60px_-24px_rgb(0_0_0/0.9),0_0_0_1px_rgb(60_228_154/0.3)]"
                          : "border-line bg-surface/70 hover:border-line-strong hover:bg-surface",
                      )}
                      style={{ animationDelay: `${40 + Math.min(i, 12) * 30}ms` }}
                    >
                      {/* A glow where the row landed (an overlay, so the row's entrance animation isn't replayed). */}
                      {settled === section.id && <span aria-hidden="true" className="admin-settle pointer-events-none absolute inset-0 rounded-2xl" />}
                      <RowBody
                        grip={
                          <button
                            type="button"
                            {...handle(section.id)}
                            aria-label={`Move ${label}`}
                            aria-describedby="home-sort-help"
                            title="Drag to reorder, or use the arrow keys"
                            className="-ml-1 grid h-9 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-md text-faint transition-colors hover:bg-white/[0.05] hover:text-ink focus-visible:outline-2 focus-visible:outline-em active:cursor-grabbing"
                          >
                            <GripVertical className="size-4" aria-hidden="true" />
                          </button>
                        }
                        number={numbers.get(section.id)}
                        icon={sectionIcon(section.id)}
                        title={label}
                        badge={badgeOf(section)}
                        detail={detailOf(section)}
                        shown={shows(section)}
                        links={linksOf(section.id)}
                        control={switchFor(section)}
                      />
                    </li>
                  );
                })}
              </ol>

              {/* Always last */}
              {last && (
                <div
                  className="relative animate-rise-in rounded-2xl border border-em/20 bg-[linear-gradient(90deg,rgb(60_228_154/0.06),transparent_60%)] [animation-duration:0.6s]"
                  style={{ animationDelay: `${40 + Math.min(ordered.length, 12) * 30}ms` }}
                  onPointerEnter={() => setHovered(last.id)}
                  onPointerLeave={() => setHovered((current) => (current === last.id ? null : current))}
                >
                  <RowBody
                    grip={<Pinned title="Always the last section" />}
                    number={numbers.get(last.id)}
                    icon={sectionIcon(last.id)}
                    title={labelOf(last.id)}
                    badge={badgeOf(last) ?? <Badge>Always last</Badge>}
                    detail={headlines.last ? `“${headlines.last}”` : HOME_SECTION_META[last.id].description}
                    shown={shows(last)}
                    links={linksOf(last.id)}
                    control={switchFor(last)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="no-scrollbar hidden xl:sticky xl:top-28 xl:block xl:max-h-[calc(100svh-8rem)] xl:self-start xl:overflow-y-auto xl:pb-4">
          <PageMap showing={showing} numbers={numbers} active={dragging ? (dragging as HomeSectionId) : hovered} hidden={hidden} />
        </aside>
      </div>
    </div>
  );
}
