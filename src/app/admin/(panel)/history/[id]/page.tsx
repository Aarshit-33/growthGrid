import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowUpRight, FileClock, GitCompareArrows, LockKeyhole, Undo2 } from "lucide-react";
import {
  ACTION_META,
  ActionIcon,
  ChangeTable,
  entryPath,
  Notice,
  OrderCompare,
  SnapshotTable,
  targetPath,
  type OrderRow,
} from "@/components/admin/history-view";
import { Avatar, RoleBadge } from "@/components/admin/people";
import { RevokeButton, type RevokeKind } from "@/components/admin/revoke-button";
import { TimeAgo } from "@/components/admin/time-ago";
import { Badge, BtnLink, Panel } from "@/components/admin/ui";
import { requireSession } from "@/lib/admin/auth";
import { adminHref } from "@/lib/admin/config";
import { fieldChanges } from "@/lib/admin/diff";
import { docKey, getHistoryEntry, type HistoryDetail } from "@/lib/admin/history";
import { hasItem } from "@/lib/admin/lists";
import { HOME_SECTION_META } from "@/lib/admin/meta";
import { can, deniedMessage, type Permission } from "@/lib/admin/roles";
import { readSnapshot } from "@/lib/admin/store";
import type { HistoryTarget } from "@/lib/admin/types";

export const metadata: Metadata = { title: "Change" };

type Props = { params: Promise<{ id: string }> };

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object";

/** A collection's order as History stored it ({ id, title } per item). */
const refRows = (value: unknown): OrderRow[] =>
  (Array.isArray(value) ? value : []).filter(isObject).map((ref) => ({ id: String(ref.id), label: String(ref.title ?? ref.id) }));

/** The homepage's sections as History stored them ({ id, enabled }). */
const sectionRows = (value: unknown): OrderRow[] =>
  (Array.isArray(value) ? value : []).filter(isObject).map((section) => {
    const id = String(section.id);
    return { id, label: HOME_SECTION_META[id as keyof typeof HOME_SECTION_META]?.label ?? id, on: section.enabled !== false };
  });

/** Which permission covers changing (and revoking a change to) this target. */
const areaOf = (target: HistoryTarget): Permission => (target.kind === "settings" ? "settings" : target.kind === "layout" ? "layout" : "content");

const absolute = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short" });

function comparison(entry: HistoryDetail): { title: string; description: string; body: ReactNode } {
  const { target, before, after } = entry;
  if (target.kind === "list" || target.kind === "layout") {
    const rows = target.kind === "list" ? refRows : sectionRows;
    return {
      title: target.kind === "list" ? "Previous vs current order" : "Previous vs current layout",
      description: "Rows that moved or switched are highlighted.",
      body: <OrderCompare before={rows(before)} after={rows(after)} />,
    };
  }
  if (before === null) {
    return { title: "What it was created with", description: "There was nothing before this change.", body: <SnapshotTable value={after} /> };
  }
  if (after === null) {
    return {
      title: "What was removed",
      description: "A full copy, kept in History for good. Restoring puts it back exactly like this.",
      body: <SnapshotTable value={before} />,
    };
  }
  const changes = fieldChanges(before, after);
  return {
    title: `${changes.length} ${changes.length === 1 ? "field" : "fields"} changed`,
    description: "Previous on the left, current on the right. Changed words are highlighted.",
    body: <ChangeTable changes={changes} />,
  };
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-white/[0.02] px-4 py-3.5">
      <dt className="label-mono text-[0.58rem] text-faint">{label}</dt>
      <dd className="mt-2 min-w-0 text-[0.86rem] text-dim">{children}</dd>
    </div>
  );
}

export default async function HistoryEntryPage({ params }: Props) {
  const { config, user } = await requireSession();
  const { id } = await params;
  const entry = await getHistoryEntry(decode(id));
  if (!entry) notFound();

  const href = (path: string) => adminHref(config.base, path);
  const snapshot = await readSnapshot();
  const { target } = entry;
  const exists = target.kind !== "item" || hasItem(snapshot, target.name, target.id);
  const area = areaOf(target);
  const open = can(user.role, area) ? targetPath(target, exists) : null;
  const meta = ACTION_META[entry.action] ?? ACTION_META.update;

  const mayRevoke = can(user.role, "revoke") && can(user.role, area);
  const kind: RevokeKind = entry.after === null ? "restore" : entry.before === null ? "create" : "edit";
  const view = comparison(entry);

  return (
    <div className="space-y-7">
      <Link href={href("/history")} className="group/back inline-flex items-center gap-1.5 text-[0.8rem] text-faint transition-colors hover:text-ink">
        <ArrowLeft className="size-3.5 transition-transform duration-300 group-hover/back:-translate-x-0.5" aria-hidden="true" />
        History
      </Link>

      <header className="flex animate-rise-in flex-wrap items-start gap-x-6 gap-y-5">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <ActionIcon action={entry.action} className="size-12 rounded-2xl" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={meta.tone}>{meta.label}</Badge>
              {entry.revokedBy && (
                <Badge tone="warn" icon={Undo2}>
                  Revoked
                </Badge>
              )}
            </div>
            <h1 className="mt-2.5 break-words font-display text-[clamp(1.5rem,1.2rem+1.2vw,2.1rem)] font-medium leading-tight tracking-[-0.03em] text-ink">
              {entry.title}
            </h1>
            <p className="mt-1.5 text-[0.95rem] leading-relaxed text-muted">{entry.summary}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {open && (
            <BtnLink href={href(open)} icon={ArrowUpRight} variant="ghost">
              Open in editor
            </BtnLink>
          )}
          {mayRevoke && !entry.revokedBy && (
            <RevokeButton
              id={entry.id}
              kind={kind}
              title={entry.title}
              who={entry.user.name}
              summary={entry.summary}
              newer={kind === "edit" ? entry.newer : 0}
              variant={kind === "restore" ? "primary" : "secondary"}
            />
          )}
        </div>
      </header>

      <dl className="grid animate-rise-in gap-3 [animation-delay:60ms] sm:grid-cols-3">
        <Fact label="Changed by">
          <span className="flex min-w-0 items-center gap-2.5">
            <Avatar user={entry.user} size="sm" />
            <span className="truncate font-medium text-ink">{entry.user.name}</span>
            <RoleBadge role={entry.user.role} />
          </span>
          {entry.user.email && <span className="mt-1 block truncate text-[0.76rem] text-faint">{entry.user.email}</span>}
        </Fact>
        <Fact label="When">
          <TimeAgo at={entry.at} className="font-medium text-ink" />
          <span className="mt-1 block text-[0.76rem] text-faint">{absolute.format(new Date(entry.at))}</span>
        </Fact>
        <Fact label="File">
          <code className="block break-all font-mono text-[0.8rem] text-ink">{entry.file}</code>
          <span className="mt-1 block text-[0.76rem] text-faint">Change {entry.id}</span>
        </Fact>
      </dl>

      <div className="animate-rise-in space-y-3 [animation-delay:100ms]">
        {entry.revokedBy && (
          <Notice tone="warn" icon={Undo2}>
            Revoked by <strong className="font-medium text-ink">{entry.revokedBy.user.name}</strong>, <TimeAgo at={entry.revokedBy.at} />.{" "}
            <Link href={href(entryPath(entry.revokedBy.id))} className="font-medium text-em transition-colors hover:text-hot">
              View the revoke →
            </Link>
          </Notice>
        )}
        {entry.revokes && (
          <Notice icon={Undo2}>
            This change revoked an earlier one.{" "}
            <Link href={href(entryPath(entry.revokes))} className="font-medium text-em transition-colors hover:text-hot">
              View the original change →
            </Link>
          </Notice>
        )}
        {entry.newer > 0 && (
          <Notice icon={FileClock}>
            Changed {entry.newer === 1 ? "once" : `${entry.newer} times`} after this, so “Current” below is this change&apos;s result, not
            necessarily what&apos;s live now.{" "}
            <Link href={href(`/history?doc=${encodeURIComponent(docKey(target))}`)} className="font-medium text-em transition-colors hover:text-hot">
              See every change to it →
            </Link>
          </Notice>
        )}
        {!mayRevoke && !entry.revokedBy && (
          <Notice icon={LockKeyhole}>{deniedMessage(user.role, can(user.role, "revoke") ? area : "revoke")}</Notice>
        )}
      </div>

      <Panel title={view.title} description={view.description} icon={GitCompareArrows} className="animate-rise-in [animation-delay:140ms]">
        {view.body}
      </Panel>
    </div>
  );
}
