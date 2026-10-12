import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, FileClock, History, X } from "lucide-react";
import { EntryRow, groupByDay, HistoryTabs } from "@/components/admin/history-view";
import { Avatar } from "@/components/admin/people";
import { BtnLink, PageHeader } from "@/components/admin/ui";
import { requireSession } from "@/lib/admin/auth";
import { adminHref } from "@/lib/admin/config";
import { deletedItems, historyLocation, historyPeople, listHistory } from "@/lib/admin/history";
import { hasItem } from "@/lib/admin/lists";
import { readSnapshot } from "@/lib/admin/store";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "History" };

type Param = string | string[] | undefined;
type Props = { searchParams: Promise<{ by?: Param; doc?: Param; limit?: Param }> };

const PAGE = 50;
const one = (value: Param) => (Array.isArray(value) ? value[0] : value);

/** The single-password account has no email: "-" stands for it in links. */
const NO_EMAIL = "-";

export default async function HistoryPage({ searchParams }: Props) {
  const { config } = await requireSession();
  const params = await searchParams;
  const by = one(params.by)?.slice(0, 320);
  const doc = one(params.doc)?.slice(0, 300) || undefined;
  const limit = Math.min(Math.max(Number(one(params.limit)) || PAGE, PAGE), 5000);

  const snapshot = await readSnapshot();
  const [{ entries, total }, people, deleted] = await Promise.all([
    listHistory({ user: by === undefined ? undefined : by === NO_EMAIL ? "" : by, doc, limit }),
    historyPeople(),
    deletedItems((name, id) => hasItem(snapshot, name, id)),
  ]);
  const groups = groupByDay(entries);

  const link = (query: { by?: string; doc?: string; limit?: number }) => {
    const search = new URLSearchParams();
    if (query.by !== undefined) search.set("by", query.by);
    if (query.doc) search.set("doc", query.doc);
    if (query.limit && query.limit > PAGE) search.set("limit", String(query.limit));
    const qs = search.toString();
    return adminHref(config.base, `/history${qs ? `?${qs}` : ""}`);
  };

  const chip = (active: boolean) =>
    cn(
      "inline-flex h-8 items-center gap-2 rounded-full border pl-1.5 pr-3.5 text-[0.8rem] transition-colors duration-200",
      active ? "border-em/40 bg-em/[0.08] text-ink" : "border-line text-muted hover:border-line-strong hover:text-ink",
    );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Studio"
        title="History"
        description="Every change made in the Studio: who made it, when, and what it was before. Revoke a change or restore a deleted item at any time. Nothing here is ever deleted."
        className="animate-rise-in"
      />

      <div className="flex animate-rise-in flex-col gap-4 [animation-delay:60ms]">
        <HistoryTabs base={config.base} active="changes" deleted={deleted.length} />

        {(people.length > 1 || by !== undefined) && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="label-mono mr-1 text-[0.6rem] text-faint">Made by</span>
            <Link href={link({ doc })} aria-current={by === undefined ? "true" : undefined} className={cn(chip(by === undefined), "pl-3.5")}>
              Everyone
            </Link>
            {people.map((person) => {
              const key = person.email || NO_EMAIL;
              return (
                <Link key={key} href={link({ by: key, doc })} aria-current={by === key ? "true" : undefined} className={chip(by === key)}>
                  <Avatar user={person} size="sm" />
                  {person.name}
                </Link>
              );
            })}
          </div>
        )}

        {doc && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-info/30 bg-info/[0.05] px-4 py-3 text-[0.86rem] text-dim">
            <FileClock className="size-4 shrink-0 text-info" aria-hidden="true" />
            <span className="min-w-0">
              Changes to <strong className="font-medium text-ink">{entries[0]?.title ?? doc}</strong>
            </span>
            <Link href={link({ by })} className="ml-auto inline-flex items-center gap-1.5 text-[0.8rem] text-muted transition-colors hover:text-ink">
              <X className="size-3.5" aria-hidden="true" /> Show all changes
            </Link>
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="card grid animate-rise-in place-items-center px-6 py-16 text-center [animation-delay:120ms]">
          <span className="grid size-12 place-items-center rounded-2xl border border-line bg-white/[0.03] text-em">
            <History className="size-5" aria-hidden="true" />
          </span>
          <h2 className="mt-5 font-display text-[1.3rem] font-medium tracking-[-0.02em] text-ink">
            {doc || by !== undefined ? "No matching changes" : "No changes yet"}
          </h2>
          <p className="mt-2 max-w-sm text-[0.9rem] leading-relaxed text-muted">
            Every save in the Studio shows up here, with who made it and what it was before.
          </p>
        </div>
      ) : (
        <div className="space-y-7">
          {groups.map((group, g) => (
            <section key={`${group.label}-${g}`} aria-labelledby={`day-${g}`} className="animate-rise-in" style={{ animationDelay: `${Math.min(120 + g * 50, 400)}ms` }}>
              <h2 id={`day-${g}`} className="label-mono mb-2.5 flex items-center gap-3 px-1 text-[0.62rem] text-faint">
                {group.label}
                <span className="font-mono normal-case tracking-normal text-faint/70">
                  {group.entries.length} {group.entries.length === 1 ? "change" : "changes"}
                </span>
              </h2>
              <ul className="card divide-y divide-line p-1.5">
                {group.entries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} base={config.base} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        {entries.length < total ? (
          <BtnLink href={link({ by, doc, limit: limit + PAGE })} icon={ArrowDown}>
            Show older changes
          </BtnLink>
        ) : (
          <span />
        )}
        <p className="text-[0.76rem] text-faint">
          {total} {total === 1 ? "change" : "changes"}
          {doc || by !== undefined ? " match" : " in all"} · kept in <code className="font-mono text-[0.95em]">{historyLocation()}</code>
        </p>
      </div>
    </div>
  );
}
