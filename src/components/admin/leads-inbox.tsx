"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Copy, Download, Inbox, RefreshCw, Reply, Search, Trash2, X } from "lucide-react";
import { deleteLeadAction, exportLeadsAction, listLeadsAction, setLeadStatusAction } from "@/lib/admin/actions";
import type { LeadRow, LeadStatus } from "@/lib/admin/types";
import { cn } from "@/lib/utils";
import { useConfirm } from "./hooks";
import { LocalTime, TimeAgo } from "./time-ago";
import { toast } from "./toast";
import { Badge, Btn, Dot, PageHeader, type Tone } from "./ui";

/* ─────────────────────────────────────────────────────────────
   Leads: every contact-form enquiry, newest first. Track each
   one from new to won, reply by email, delete it for good (privacy
   requests) or export the lot as CSV. Changes refresh the sidebar
   badge.
   ───────────────────────────────────────────────────────────── */

interface StatusMeta {
  value: LeadStatus;
  label: string;
  tone: Tone;
  hint: string;
}

const STATUSES: StatusMeta[] = [
  { value: "new", label: "New", tone: "em", hint: "Not answered yet" },
  { value: "contacted", label: "Contacted", tone: "info", hint: "You've replied" },
  { value: "qualified", label: "Qualified", tone: "warn", hint: "A real project, in talks" },
  { value: "won", label: "Won", tone: "em", hint: "Became a client" },
  { value: "lost", label: "Lost", tone: "muted", hint: "Didn't go ahead" },
  { value: "spam", label: "Spam", tone: "danger", hint: "Not a real enquiry" },
];

const STATUS = Object.fromEntries(STATUSES.map((status) => [status.value, status])) as Record<LeadStatus, StatusMeta>;

const enquiries = (count: number) => `${count} ${count === 1 ? "enquiry" : "enquiries"}`;
const OFFLINE = "Couldn't reach the studio server. Check it's running, then try again.";

/** A reply in the visitor's mail app: their name, the site's name and their message quoted (kept short for mailto). */
function replyHref(lead: LeadRow, siteName: string): string {
  const first = lead.name.split(/\s+/)[0] || lead.name;
  const message = lead.message.length > 1200 ? `${lead.message.slice(0, 1200)}…` : lead.message;
  const quoted = message
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  const body = `Hi ${first},\n\nThanks for getting in touch with ${siteName}.\n\n\n\n---\n${quoted}`;
  return `mailto:${lead.email}?subject=${encodeURIComponent(`Re: your enquiry to ${siteName}`)}&body=${encodeURIComponent(body)}`;
}

interface LeadsInboxProps {
  initial: LeadRow[];
  /** Reading the store failed (e.g. MongoDB unreachable). */
  error: string | null;
  /** Where enquiries are kept, for the footnote. */
  store: "mongo" | "file";
  siteName: string;
  /** An enquiry to open on arrival (?open=id, from the Overview). */
  initialOpen?: string | null;
}

export function LeadsInbox({ initial, error, store, siteName, initialOpen = null }: LeadsInboxProps) {
  const router = useRouter();
  const [leads, setLeads] = useState(initial);
  const [filter, setFilter] = useState<LeadStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(() => (initialOpen && initial.some((lead) => lead.id === initialOpen) ? initialOpen : null));
  const [pending, setPending] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const searchRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    const map = Object.fromEntries(STATUSES.map((status) => [status.value, 0])) as Record<LeadStatus, number>;
    for (const lead of leads) map[lead.status] += 1;
    return map;
  }, [leads]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return leads.filter(
      (lead) =>
        (filter === "all" || lead.status === filter) &&
        (!needle ||
          [lead.name, lead.email, lead.company, lead.message, lead.timeline, ...lead.services].some((field) => field.toLowerCase().includes(needle))),
    );
  }, [leads, filter, query]);

  // "/" jumps to the search box.
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

  // Opened from the Overview: bring that enquiry into view.
  useEffect(() => {
    if (initialOpen) document.getElementById(`lead-row-${initialOpen}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [initialOpen]);

  const reload = async () => {
    setRefreshing(true);
    try {
      const result = await listLeadsAction();
      if (!result.ok) return toast.error(result.error);
      setLeads(result.data);
      router.refresh();
    } catch {
      toast.error(OFFLINE);
    } finally {
      setRefreshing(false);
    }
  };

  const setStatus = async (lead: LeadRow, status: LeadStatus) => {
    if (lead.status === status || pending) return;
    const revert = () => setLeads((list) => list.map((other) => (other.id === lead.id ? lead : other)));
    setLeads((list) => list.map((other) => (other.id === lead.id ? { ...other, status } : other)));
    setPending(lead.id);
    try {
      const result = await setLeadStatusAction({ id: lead.id, status });
      if (!result.ok) {
        revert();
        toast.error(result.error);
        if (result.conflict) void reload();
        return;
      }
      setLeads((list) => list.map((other) => (other.id === lead.id ? result.data : other)));
      router.refresh(); // the sidebar's new-enquiry badge
    } catch {
      revert();
      toast.error(OFFLINE);
    } finally {
      setPending(null);
    }
  };

  const remove = async (lead: LeadRow) => {
    const ok = await confirm({
      title: "Delete this enquiry?",
      body: (
        <>
          <p>
            <strong className="text-ink">{lead.name}</strong>&apos;s enquiry is deleted for good. There&apos;s no undo.
          </p>
          <p className="mt-2.5">Use this for privacy requests. To set it aside, mark it Lost or Spam instead.</p>
        </>
      ),
      confirmLabel: "Delete for good",
      tone: "danger",
    });
    if (!ok) return;
    setPending(lead.id);
    try {
      const result = await deleteLeadAction({ id: lead.id });
      if (!result.ok) {
        toast.error(result.error);
        if (result.conflict) void reload();
        return;
      }
      setLeads((list) => list.filter((other) => other.id !== lead.id));
      setOpenId(null);
      toast.success("Enquiry deleted");
      router.refresh();
    } catch {
      toast.error(OFFLINE);
    } finally {
      setPending(null);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const result = await exportLeadsAction();
      if (!result.ok) return toast.error(result.error);
      const url = URL.createObjectURL(new Blob([result.data.csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = result.data.filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Export ready", { body: `${result.data.filename}: every enquiry, whatever the filter. Opens in Excel, Numbers or Sheets.` });
    } catch {
      toast.error(OFFLINE);
    } finally {
      setExporting(false);
    }
  };

  const filtered = filter !== "all" || query.trim() !== "";

  return (
    <div className="space-y-7">
      {confirmDialog}
      <PageHeader
        eyebrow="Studio"
        title="Leads"
        description="Every enquiry from the contact form, newest first. Track each one from new to won, reply by email, or export them all."
        actions={
          <>
            <Btn variant="ghost" size="sm" icon={RefreshCw} onClick={() => void reload()} loading={refreshing}>
              Refresh
            </Btn>
            <Btn icon={Download} onClick={() => void exportCsv()} loading={exporting} disabled={leads.length === 0}>
              Export CSV
            </Btn>
          </>
        }
        className="animate-rise-in"
      />

      {error && (
        <p role="alert" className="flex items-start gap-3 rounded-2xl border border-danger/35 bg-danger/[0.06] px-4 py-3 text-[0.84rem] leading-relaxed text-dim">
          <X className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          {error}
        </p>
      )}

      {/* Filters. The chips wrap rather than scroll, so no status is ever hidden off the edge. */}
      <div className="flex animate-rise-in flex-col gap-3 [animation-delay:60ms] lg:flex-row lg:items-start">
        <div role="group" aria-label="Status" className="flex min-w-0 flex-1 flex-wrap gap-1.5 sm:gap-2">
          <FilterChip active={filter === "all"} label="All" count={leads.length} onClick={() => setFilter("all")} />
          {STATUSES.map((status) => (
            <FilterChip
              key={status.value}
              active={filter === status.value}
              label={status.label}
              count={counts[status.value]}
              highlight={status.value === "new" && counts.new > 0}
              onClick={() => setFilter(status.value)}
            />
          ))}
        </div>
        <label className="relative block lg:w-64 lg:shrink-0 xl:w-72">
          <span className="sr-only">Search enquiries (name, email, company or message)</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search enquiries"
            autoComplete="off"
            className={cn(
              "h-10 w-full rounded-full border border-line bg-surface/80 pl-10 text-[0.86rem] text-ink outline-none transition-[border-color,box-shadow] duration-300 placeholder:text-faint hover:border-line-strong focus:border-em/60 focus:shadow-[0_0_0_4px_rgb(60_228_154/0.12)] [&::-webkit-search-cancel-button]:appearance-none",
              query ? "pr-10" : "pr-4",
            )}
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
      </div>

      {/* The count and the list: one group, so the label can't be overlapped. */}
      <div className="space-y-4">
        <p className="label-mono tabular-nums" aria-live="polite">
          {filtered ? `${visible.length} of ${enquiries(leads.length)}` : enquiries(leads.length)}
        </p>

        {leads.length === 0 ? (
          <div className="flex flex-col items-center rounded-panel border border-dashed border-line-strong px-6 py-20 text-center">
            <span className="grid size-14 place-items-center rounded-2xl border border-em/30 bg-em/10 text-em">
              <Inbox className="size-6" aria-hidden="true" />
            </span>
            <p className="mt-5 font-display text-xl text-ink">No enquiries yet</p>
            <p className="mt-2 max-w-sm text-[0.86rem] text-muted">When someone sends the contact form, their enquiry shows up here, marked new.</p>
            <a href="/contact" target="_blank" rel="noopener noreferrer" className="mt-5 text-[0.86rem] text-em underline-offset-4 hover:underline">
              Open the contact page
            </a>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center rounded-panel border border-dashed border-line-strong px-6 py-16 text-center">
            <Search className="size-6 text-em" aria-hidden="true" />
            <p className="mt-4 font-display text-lg text-ink">No enquiries match</p>
            <button
              type="button"
              onClick={() => {
                setFilter("all");
                setQuery("");
              }}
              className="mt-2 text-[0.86rem] text-em underline-offset-4 hover:underline"
            >
              Clear the filters
            </button>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {visible.map((lead, index) => (
              <li key={lead.id} id={`lead-row-${lead.id}`} className="scroll-mt-24 motion-safe:animate-rise-in" style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}>
                <LeadCard
                  lead={lead}
                  open={openId === lead.id}
                  busy={pending === lead.id}
                  locked={pending !== null}
                  siteName={siteName}
                  onToggle={() => setOpenId(openId === lead.id ? null : lead.id)}
                  onStatus={(status) => void setStatus(lead, status)}
                  onDelete={() => void remove(lead)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[0.74rem] leading-relaxed text-faint">
        {store === "mongo" ? (
          <>Enquiries are kept in MongoDB (the leads collection), so the live site and this studio see the same list.</>
        ) : (
          <>
            Enquiries are kept on this server in <code className="font-mono text-[0.92em]">.data/leads.ndjson</code>, which isn&apos;t committed.
            Set <code className="font-mono text-[0.92em]">MONGODB_URI</code> to keep them in MongoDB instead.
          </>
        )}
      </p>
    </div>
  );
}

function FilterChip({
  active,
  label,
  count,
  highlight = false,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  highlight?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[0.78rem] transition-[background-color,border-color,color] duration-300 sm:h-10 sm:gap-2 sm:px-3.5 sm:text-[0.8rem]",
        active ? "border-em/50 bg-em/[0.12] text-ink" : "border-line bg-surface/60 text-muted hover:border-line-strong hover:text-ink",
      )}
    >
      {highlight && <Dot pulse />}
      {label}
      <span className={cn("font-mono text-[0.68rem] tabular-nums", active ? "text-em" : "text-faint")}>{count}</span>
    </button>
  );
}

function LeadCard({
  lead,
  open,
  busy,
  locked,
  siteName,
  onToggle,
  onStatus,
  onDelete,
}: {
  lead: LeadRow;
  open: boolean;
  busy: boolean;
  /** Another change is on its way: wait for it. */
  locked: boolean;
  siteName: string;
  onToggle: () => void;
  onStatus: (status: LeadStatus) => void;
  onDelete: () => void;
}) {
  const status = STATUS[lead.status];
  const fresh = lead.status === "new";
  const panelId = `lead-${lead.id}`;
  const [copied, setCopied] = useState(false);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(lead.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.info("Copy the address by hand", { body: lead.email });
    }
  };

  const when = lead.createdAt ? <TimeAgo at={lead.createdAt} /> : "—";

  return (
    <article className={cn("card overflow-hidden transition-[border-color,box-shadow] duration-300", open ? "border-line-strong" : "hover:border-line-strong", fresh && "border-l-2 border-l-em/70")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="group/lead flex w-full items-start gap-3 px-4 py-3.5 text-left sm:gap-4 sm:px-5"
      >
        <span className="mt-1.5 hidden sm:block">
          <Dot tone={status.tone} pulse={fresh} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <span className={cn("break-words text-[0.94rem] text-ink", fresh ? "font-semibold" : "font-medium")}>{lead.name}</span>
              {lead.company && <span className="hidden break-words text-[0.82rem] text-muted sm:inline">{lead.company}</span>}
            </span>
            {/* Phones: the status sits in the name row, so the details below get the card's full width. */}
            <Badge tone={status.tone} className="sm:hidden">
              {status.label}
            </Badge>
          </span>
          <span className="mt-0.5 block text-[0.8rem] text-muted sm:hidden">
            {lead.company && (
              <>
                <span className="break-words">{lead.company}</span>
                <span aria-hidden="true" className="px-1.5 text-faint">
                  ·
                </span>
              </>
            )}
            <span className="whitespace-nowrap text-faint">{when}</span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.76rem] text-faint sm:mt-0.5">
            <span className="min-w-0 wrap-anywhere">{lead.email}</span>
            {lead.services.slice(0, 3).map((service) => (
              <span key={service} className="rounded-full border border-line px-2 py-px text-[0.68rem] text-dim">
                {service}
              </span>
            ))}
            {lead.services.length > 3 && <span className="text-[0.68rem]">+{lead.services.length - 3}</span>}
          </span>
          {!open && <span className="mt-1.5 line-clamp-2 text-[0.82rem] leading-relaxed text-muted">{lead.message}</span>}
        </span>
        <span className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
          <Badge tone={status.tone}>{status.label}</Badge>
          <span className="text-[0.72rem] text-faint">{when}</span>
        </span>
        <ChevronDown
          className={cn("mt-1 size-4 shrink-0 text-faint transition-transform duration-300 group-hover/lead:text-dim", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div id={panelId} className="animate-rise-in border-t border-line px-4 pb-4 pt-4 [animation-duration:0.35s] sm:px-5">
          <blockquote className="whitespace-pre-wrap break-words rounded-xl border border-line bg-white/[0.02] px-4 py-3.5 text-[0.88rem] leading-relaxed text-dim">
            {lead.message}
          </blockquote>

          <dl className="mt-4 grid gap-x-6 gap-y-3 text-[0.8rem] sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Email">
              <a href={`mailto:${lead.email}`} className="break-all text-em underline-offset-4 hover:underline">
                {lead.email}
              </a>
            </Detail>
            {lead.company && <Detail label="Company">{lead.company}</Detail>}
            {lead.services.length > 0 && <Detail label="Services">{lead.services.join(", ")}</Detail>}
            {lead.timeline && <Detail label="Timeline">{lead.timeline}</Detail>}
            {lead.budget && <Detail label="Budget">{lead.budget}</Detail>}
            {lead.source && (
              <Detail label="Sent from">
                <span className="break-all font-mono text-[0.92em]">{lead.source}</span>
              </Detail>
            )}
            <Detail label="Received">{lead.createdAt ? <LocalTime at={lead.createdAt} /> : "Unknown"}</Detail>
            {lead.updatedAt && (
              <Detail label="Status changed">
                <LocalTime at={lead.updatedAt} />
              </Detail>
            )}
          </dl>

          <div className="mt-5 border-t border-line pt-4">
            <p className="label-mono mb-2 text-[0.6rem] text-faint">Status</p>
            <div role="radiogroup" aria-label={`Status of ${lead.name}'s enquiry`} className="flex flex-wrap gap-1.5">
              {STATUSES.map((option) => {
                const active = option.value === lead.status;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    title={option.hint}
                    disabled={locked && !busy}
                    onClick={() => onStatus(option.value)}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[0.76rem] transition-[background-color,border-color,color] duration-200 disabled:opacity-50",
                      active ? "border-em/55 bg-em/[0.12] text-ink" : "border-line text-muted hover:border-line-strong hover:text-ink",
                    )}
                  >
                    {active && <Check className="size-3 text-em" aria-hidden="true" />}
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <a
              href={replyHref(lead, siteName)}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-em px-4 text-[0.82rem] font-medium text-bg shadow-[0_0_0_1px_rgb(60_228_154/0.35),0_10px_30px_-12px_rgb(60_228_154/0.7)] transition-colors hover:bg-hot"
            >
              <Reply className="size-3.5" aria-hidden="true" /> Reply by email
            </a>
            <Btn size="sm" variant="ghost" icon={copied ? Check : Copy} onClick={() => void copyEmail()}>
              {copied ? "Copied" : "Copy email"}
            </Btn>
            {fresh && (
              <Btn size="sm" variant="ghost" onClick={() => onStatus("contacted")} disabled={locked}>
                Mark contacted
              </Btn>
            )}
            <Btn size="sm" variant="danger" icon={Trash2} onClick={onDelete} loading={busy} disabled={locked && !busy} className="ml-auto">
              Delete
            </Btn>
          </div>
        </div>
      )}
    </article>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-faint">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}
