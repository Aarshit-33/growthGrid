import type { Metadata } from "next";
import { ArchiveRestore, ArrowUpRight, LockKeyhole, Trash2 } from "lucide-react";
import { entryPath, HistoryTabs, Notice } from "@/components/admin/history-view";
import { COLLECTION_ICONS } from "@/components/admin/icons";
import { Avatar } from "@/components/admin/people";
import { RevokeButton } from "@/components/admin/revoke-button";
import { TimeAgo } from "@/components/admin/time-ago";
import { BtnLink, PageHeader } from "@/components/admin/ui";
import { requireSession } from "@/lib/admin/auth";
import { adminHref } from "@/lib/admin/config";
import { deletedItems } from "@/lib/admin/history";
import { hasItem, imageOf, isCollectionName, itemTitle } from "@/lib/admin/lists";
import { COLLECTION_META } from "@/lib/admin/meta";
import { can, deniedMessage } from "@/lib/admin/roles";
import { readSnapshot } from "@/lib/admin/store";

export const metadata: Metadata = { title: "Deleted items" };

export default async function DeletedItemsPage() {
  const { config, user } = await requireSession();
  const snapshot = await readSnapshot();
  const items = await deletedItems((name, id) => hasItem(snapshot, name, id));
  const mayRestore = can(user.role, "revoke");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="History"
        title="Deleted items"
        description="Items taken off the site. Each one keeps a full copy in History for good, so it can be restored exactly as it was."
        className="animate-rise-in"
      />

      <div className="flex animate-rise-in flex-col gap-4 [animation-delay:60ms]">
        <HistoryTabs base={config.base} active="deleted" deleted={items.length} />
        {!mayRestore && items.length > 0 && <Notice icon={LockKeyhole}>{deniedMessage(user.role, "revoke")}</Notice>}
      </div>

      {items.length === 0 ? (
        <div className="card grid animate-rise-in place-items-center px-6 py-16 text-center [animation-delay:120ms]">
          <span className="grid size-12 place-items-center rounded-2xl border border-line bg-white/[0.03] text-em">
            <ArchiveRestore className="size-5" aria-hidden="true" />
          </span>
          <h2 className="mt-5 font-display text-[1.3rem] font-medium tracking-[-0.02em] text-ink">Nothing deleted</h2>
          <p className="mt-2 max-w-sm text-[0.9rem] leading-relaxed text-muted">
            When an item is deleted it lands here, with who deleted it and when, ready to be restored.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {items.map(({ entry, item }, i) => {
            if (entry.target.kind !== "item") return null;
            const { name } = entry.target;
            const known = isCollectionName(name);
            const title = known ? itemTitle(name, item) : entry.target.id;
            const image = imageOf(item);
            const Icon = known ? COLLECTION_ICONS[name] : Trash2;
            return (
              <li
                key={entry.id}
                className="card flex animate-rise-in gap-4 p-4 sm:p-5"
                style={{ animationDelay: `${Math.min(120 + i * 40, 400)}ms` }}
              >
                <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-white/[0.03]">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- admin preview of any /public path
                    <img src={image} alt="" loading="lazy" className="size-full object-cover opacity-80 grayscale-[35%]" />
                  ) : (
                    <Icon className="size-5 text-faint" aria-hidden="true" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="label-mono text-[0.58rem] text-faint">{known ? COLLECTION_META[name].label : name}</p>
                  <h2 className="mt-1 truncate text-[0.98rem] font-medium text-ink">{title}</h2>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.76rem] text-faint">
                    <Avatar user={entry.user} size="sm" />
                    <span>
                      Deleted by <span className="text-dim">{entry.user.name}</span>
                    </span>
                    <span aria-hidden="true">·</span>
                    <TimeAgo at={entry.at} />
                  </p>
                  <div className="mt-3.5 flex flex-wrap gap-2">
                    {mayRestore && (
                      <RevokeButton id={entry.id} kind="restore" title={title} who={entry.user.name} summary={entry.summary} size="sm" variant="primary" />
                    )}
                    <BtnLink href={adminHref(config.base, entryPath(entry.id))} size="sm" variant="ghost" icon={ArrowUpRight}>
                      What was deleted
                    </BtnLink>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
