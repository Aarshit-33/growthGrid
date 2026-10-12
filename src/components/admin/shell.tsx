"use client";

import Link from "next/link";
import { useSelectedLayoutSegments } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Database,
  Globe,
  History as HistoryIcon,
  Images,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Palette,
  PanelsTopLeft,
  Settings,
  X,
  type LucideIcon,
} from "lucide-react";
import { BrandMark } from "@/components/layout/logo";
import { logoutAction } from "@/lib/admin/actions";
import { adminHref } from "@/lib/admin/config";
import { AFTERCARE_META, CARDS_META, COLLECTION_META, COLLECTION_ORDER, PAGE_META, PAGE_ORDER } from "@/lib/admin/meta";
import { can } from "@/lib/admin/roles";
import type { SessionUser } from "@/lib/admin/types";
import type { BrandMarkImage } from "@/lib/brand";
import type { CollectionName } from "@/lib/content/registry";
import { cn } from "@/lib/utils";
import { AFTERCARE_ICON, CARDS_ICON, COLLECTION_ICONS, pageIcon } from "./icons";
import { LeaveGuardProvider } from "./leave-guard";
import { Avatar, RoleBadge } from "./people";
import { SyncButton } from "./sync-panel";

/* ─────────────────────────────────────────────────────────────
   The studio frame: a glass sidebar (a drawer on small screens)
   and the main column. The active link comes from the route
   segments, not the URL, so it stays right behind the private
   address rewrite.
   ───────────────────────────────────────────────────────────── */

export interface ShellCounts {
  total: number;
  hidden: number;
}

interface ShellProps {
  base: string;
  siteName: string;
  /** Studio › Branding's mark for the bar (null: the built-in grid mark). */
  mark: BrandMarkImage | null;
  counts: Record<CollectionName, ShellCounts>;
  /** Enquiries still marked new (the Leads badge). */
  newLeads: number;
  /** Content lives in MongoDB (CONTENT_SOURCE=mongo): Sync works on the database. */
  mongo: boolean;
  /** Something about the content store the owner should act on (shown above every screen). */
  notice?: string | null;
  /** Who's signed in: the menu only offers what their role can use. */
  user: SessionUser;
  children: ReactNode;
}

interface NavLink {
  path: string;
  label: string;
  icon: LucideIcon;
  count?: ShellCounts;
  /** Something waiting (new enquiries): an emerald pill. */
  badge?: number;
}

const GROUP_LABELS = { content: "Content", studio: "Studio details" } as const;

function navItemClasses(active: boolean) {
  return cn(
    "group/nav relative flex h-9 w-full items-center gap-3 rounded-xl px-3 text-[0.86rem] transition-[background-color,color] duration-200",
    active ? "bg-white/[0.06] text-ink" : "text-muted hover:bg-white/[0.03] hover:text-ink",
  );
}

function NavItem({ href, link, active, onNavigate }: { href: string; link: NavLink; active: boolean; onNavigate?: () => void }) {
  const { icon: IconComponent, count, badge } = link;
  return (
    <li>
      <Link href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={navItemClasses(active)}>
        <span
          aria-hidden="true"
          className={cn(
            "absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-em shadow-[0_0_10px_rgb(60_228_154/0.8)] transition-[opacity,transform] duration-300 ease-out-expo",
            active ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0",
          )}
        />
        <IconComponent
          className={cn("size-4 shrink-0 transition-colors duration-200", active ? "text-em" : "text-faint group-hover/nav:text-dim")}
          aria-hidden="true"
        />
        <span className="truncate">{link.label}</span>
        {count && (
          <span
            className="ml-auto flex items-center gap-1.5 font-mono text-[0.66rem] text-faint"
            title={`${count.total} total${count.hidden ? ` · ${count.hidden} hidden` : ""}`}
          >
            {count.hidden > 0 && <span className="size-1 rounded-full bg-warn" aria-hidden="true" />}
            {count.total}
          </span>
        )}
        {!!badge && (
          <span className="ml-auto rounded-full bg-em/[0.14] px-1.5 py-px font-mono text-[0.64rem] font-medium tabular-nums text-hot ring-1 ring-inset ring-em/30">
            {badge > 99 ? "99+" : badge}
            <span className="sr-only"> new</span>
          </span>
        )}
      </Link>
    </li>
  );
}

function NavGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-6">
      <p className="label-mono mb-1.5 px-3 text-[0.6rem] text-faint/80">{title}</p>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function Sidebar({
  base,
  siteName,
  mark,
  counts,
  newLeads,
  mongo,
  user,
  segments,
  onNavigate,
}: {
  base: string;
  siteName: string;
  mark: BrandMarkImage | null;
  counts: Record<CollectionName, ShellCounts>;
  newLeads: number;
  mongo: boolean;
  user: SessionUser;
  segments: string[];
  onNavigate?: () => void;
}) {
  const [first, second] = segments;
  const item = (link: NavLink, active: boolean) => (
    <NavItem key={link.path} href={adminHref(base, link.path)} link={link} active={active} onNavigate={onNavigate} />
  );
  const collectionLinks = (group: "content" | "studio") =>
    COLLECTION_ORDER.filter((name) => COLLECTION_META[name].group === group).flatMap((name) => [
      item(
        { path: `/collections/${name}`, label: COLLECTION_META[name].label, icon: COLLECTION_ICONS[name], count: counts[name] },
        first === "collections" && second === name,
      ),
      // What follows every project (warranty, handover, care plans) sits with the services.
      ...(name === "services"
        ? [item({ path: AFTERCARE_META.path, label: AFTERCARE_META.label, icon: AFTERCARE_ICON }, `/${first}` === AFTERCARE_META.path)]
        : []),
      // Everyone's business card is drawn from the team.
      ...(name === "team"
        ? [item({ path: CARDS_META.path, label: CARDS_META.label, icon: CARDS_ICON }, `/${first}` === CARDS_META.path)]
        : []),
    ]);

  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-line px-5">
        <Link href={adminHref(base)} onClick={onNavigate} className="flex min-w-0 items-center gap-2.5 rounded-lg text-ink">
          <BrandMark mark={mark} className="size-[1.35rem] shrink-0" />
          {/* A full logo already spells the name. */}
          <span className={cn("truncate font-display text-[1.08rem] font-semibold leading-none tracking-[-0.045em]", mark?.wide && "sr-only")}>
            {siteName}
          </span>
        </Link>
        <span className="ml-auto rounded-full border border-em/30 bg-em/[0.08] px-2 py-0.5 font-mono text-[0.58rem] uppercase tracking-[0.16em] text-hot">
          Studio
        </span>
      </div>

      <nav aria-label="Studio" className="no-scrollbar flex-1 overflow-y-auto px-3 pb-6 pt-4">
        <ul className="space-y-0.5">
          {item({ path: "/", label: "Overview", icon: LayoutDashboard }, segments.length === 0)}
          {can(user.role, "leads") && item({ path: "/leads", label: "Leads", icon: Inbox, badge: newLeads }, first === "leads")}
          {can(user.role, "layout") && item({ path: "/homepage", label: "Homepage layout", icon: PanelsTopLeft }, first === "homepage")}
          {can(user.role, "settings") && item({ path: "/settings", label: "Site settings", icon: Settings }, first === "settings")}
          {can(user.role, "settings") && item({ path: "/branding", label: "Branding", icon: Palette }, first === "branding")}
          {can(user.role, "content") && item({ path: "/media", label: "Media library", icon: Images }, first === "media")}
          {item({ path: "/history", label: "History", icon: HistoryIcon }, first === "history")}
        </ul>
        <NavGroup title={GROUP_LABELS.content}>{collectionLinks("content")}</NavGroup>
        <NavGroup title="Pages">
          {PAGE_ORDER.map((key) =>
            item({ path: `/pages/${key}`, label: PAGE_META[key].label, icon: pageIcon(key) }, first === "pages" && second === key),
          )}
        </NavGroup>
        <NavGroup title={GROUP_LABELS.studio}>{collectionLinks("studio")}</NavGroup>
      </nav>

      <div className="shrink-0 space-y-0.5 border-t border-line p-3">
        <div className="mb-2 flex items-center gap-3 rounded-xl border border-line bg-white/[0.02] px-3 py-2.5">
          <Avatar user={user} />
          <div className="min-w-0 flex-1">
            {/* The badge sits by the name, so the email gets the full width. */}
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <p className="min-w-0 break-words text-[0.84rem] font-medium leading-tight text-ink">{user.name}</p>
              <RoleBadge role={user.role} />
            </div>
            <p className="mt-0.5 text-[0.72rem] text-faint wrap-anywhere">{user.email || "Studio password"}</p>
          </div>
        </div>
        {user.role === "owner" && <SyncButton mongo={mongo} className={navItemClasses(false)} />}
        <a href="/" target="_blank" rel="noopener noreferrer" className={navItemClasses(false)}>
          <Globe className="size-4 shrink-0 text-faint group-hover/nav:text-dim" aria-hidden="true" />
          View site
          <ArrowUpRight className="ml-auto size-3.5 text-faint transition-transform duration-300 group-hover/nav:-translate-y-0.5 group-hover/nav:translate-x-0.5" aria-hidden="true" />
        </a>
        <form action={logoutAction}>
          <button type="submit" className={cn(navItemClasses(false), "hover:text-danger")}>
            <LogOut className="size-4 shrink-0 text-faint transition-colors group-hover/nav:text-danger" aria-hidden="true" />
            Log out
          </button>
        </form>
      </div>
    </>
  );
}

/** What the mobile top bar says you're looking at. */
function screenLabel(segments: string[]): string {
  const [first, second] = segments;
  if (!first) return "Overview";
  if (first === "leads") return "Leads";
  if (first === "homepage") return "Homepage layout";
  if (first === "settings") return "Site settings";
  if (first === "branding") return "Branding";
  if (first === "media") return "Media library";
  if (first === "history") return second === "deleted" ? "Deleted items" : "History";
  if (`/${first}` === AFTERCARE_META.path) return AFTERCARE_META.label;
  if (`/${first}` === CARDS_META.path) return CARDS_META.label;
  if (first === "pages" && second && second in PAGE_META) return PAGE_META[second as keyof typeof PAGE_META].label;
  if (first === "collections" && second && second in COLLECTION_META) return COLLECTION_META[second as CollectionName].label;
  return "Studio";
}

export function AdminShell({ base, siteName, mark, counts, newLeads, mongo, notice, user, children }: ShellProps) {
  // Route groups like "(panel)" can appear in the list: skip them.
  const segments = useSelectedLayoutSegments().filter((segment) => !segment.startsWith("("));
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  // Escape closes the drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const sidebar = { base, siteName, mark, counts, newLeads, mongo, user, segments };

  return (
    <LeaveGuardProvider>
    <div className="relative isolate min-h-svh">
      {/* Ambient backdrop: brand grid at the top, a soft emerald light. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="blueprint absolute inset-x-0 top-0 h-[34rem] opacity-50 [--grid-size:4rem] [mask-image:linear-gradient(to_bottom,#000,transparent)]" />
        <div className="admin-glow absolute -right-40 -top-56 size-[48rem] rounded-full bg-[radial-gradient(circle,rgb(60_228_154/0.09),transparent_62%)]" />
      </div>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[17rem] flex-col border-r border-line bg-bg/75 backdrop-blur-xl lg:flex">
        <Sidebar {...sidebar} />
      </aside>

      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-3 backdrop-blur-xl lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="admin-drawer"
          className="grid size-9 place-items-center rounded-lg text-dim transition-colors hover:bg-white/[0.06] hover:text-ink"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
        <BrandMark mark={mark} className="size-5 text-ink" />
        <span className="truncate text-[0.9rem] font-medium text-ink">{screenLabel(segments)}</span>
      </header>

      {/* Mobile drawer */}
      <div id="admin-drawer" className={cn("fixed inset-0 z-50 lg:hidden", !open && "pointer-events-none")} inert={!open}>
        <div
          onClick={close}
          aria-hidden="true"
          className={cn("absolute inset-0 bg-bg/70 backdrop-blur-sm transition-opacity duration-300", open ? "opacity-100" : "opacity-0")}
        />
        <aside
          aria-label="Menu"
          className={cn(
            "absolute inset-y-0 left-0 flex w-[min(19rem,86vw)] flex-col border-r border-line bg-bg shadow-panel transition-transform duration-500 ease-out-expo",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close menu"
            className="absolute right-3 top-3.5 z-10 grid size-9 place-items-center rounded-lg text-faint transition-colors hover:bg-white/[0.06] hover:text-ink"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
          <Sidebar {...sidebar} onNavigate={close} />
        </aside>
      </div>

      <main className="relative pt-14 [--admin-px:1.25rem] sm:[--admin-px:2rem] lg:pl-[17rem] lg:pt-0 xl:[--admin-px:3rem]">
        <div className="mx-auto w-full max-w-[82rem] px-[var(--admin-px)] pb-20 pt-6 lg:pt-8">
          {notice && (
            <p className="mb-6 flex items-start gap-3 rounded-2xl border border-warn/35 bg-warn/[0.06] px-4 py-3 text-[0.84rem] leading-relaxed text-dim">
              <Database className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
              <span>{notice}</span>
            </p>
          )}
          {children}
        </div>
      </main>
    </div>
    </LeaveGuardProvider>
  );
}
