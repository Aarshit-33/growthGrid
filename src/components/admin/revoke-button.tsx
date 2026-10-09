"use client";

import { useState } from "react";
import { ArchiveRestore, Undo2 } from "lucide-react";
import { revokeChangeAction } from "@/lib/admin/actions";
import type { ActionResult } from "@/lib/admin/types";
import { useConfirm } from "./hooks";
import { toast } from "./toast";
import { Btn, type BtnSize, type BtnVariant } from "./ui";

/* ─────────────────────────────────────────────────────────────
   Revoke a change (or restore a deleted item, which is revoking
   its delete). Asks first, in words that say exactly what will
   happen; the server records the revoke as a new History entry.
   ───────────────────────────────────────────────────────────── */

/** edit: undo an edit · create: undo a creation (the item moves to Deleted items) · restore: undo a delete. */
export type RevokeKind = "edit" | "create" | "restore";

interface RevokeButtonProps {
  id: string;
  kind: RevokeKind;
  /** What the change touched ("Insights › Design around what changes"). */
  title: string;
  /** Who made the change. */
  who: string;
  /** Its one-line summary. */
  summary: string;
  /** Later changes to the same thing: revoking puts back the version from before this one, undoing those too. */
  newer?: number;
  size?: BtnSize;
  variant?: BtnVariant;
  className?: string;
}

type Result = ActionResult<{ entry: string | null }>;

export function RevokeButton({ id, kind, title, who, summary, newer = 0, size = "md", variant = "secondary", className }: RevokeButtonProps) {
  const [confirm, confirmDialog] = useConfirm();
  const [busy, setBusy] = useState(false);
  const restore = kind === "restore";
  const verb = restore ? "Restore" : "Revoke";

  const call = async (force: boolean): Promise<Result> => {
    try {
      return await revokeChangeAction({ id, force });
    } catch {
      return { ok: false, error: "Couldn't reach the server. Is `npm run dev` still running?" };
    }
  };

  const run = async () => {
    const ok = await confirm({
      title: restore ? "Restore this item?" : "Revoke this change?",
      body: restore ? (
        <p>
          <strong className="text-ink">{title}</strong> comes back exactly as it was when {who} deleted it. The restore is recorded in
          History.
        </p>
      ) : kind === "create" ? (
        <p>
          This change created <strong className="text-ink">{title}</strong>. Revoking takes it off the site and moves it to Deleted items,
          where it can be restored later.
        </p>
      ) : (
        <>
          <p>
            Puts <strong className="text-ink">{title}</strong> back the way it was before {who}&apos;s change: <em>{summary}</em>.
          </p>
          {newer > 0 && (
            <p className="mt-2.5 text-warn">
              It was changed {newer === 1 ? "once" : `${newer} times`} after this. Revoking also undoes {newer === 1 ? "that change" : "those changes"}.
            </p>
          )}
          <p className="mt-2.5">The revoke is recorded in History, so it can be undone too.</p>
        </>
      ),
      confirmLabel: verb,
      tone: restore ? "default" : "danger",
    });
    if (!ok) return;

    setBusy(true);
    // Later changes were spelled out above, so going ahead over them was the choice made.
    let result = await call(kind === "edit" && newer > 0);
    if (!result.ok && result.conflict) {
      const again = await confirm({
        title: "It changed since",
        body: <p>{result.error} Go ahead anyway?</p>,
        confirmLabel: `${verb} anyway`,
        tone: "danger",
      });
      if (!again) {
        setBusy(false);
        return;
      }
      result = await call(true);
    }
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error, { body: result.errors });
      return;
    }
    toast.success(restore ? "Restored" : "Change revoked", {
      body: restore ? `${title} is back, exactly as it was.` : "Recorded in History as a new change, so it can be undone too.",
    });
  };

  return (
    <>
      {confirmDialog}
      <Btn variant={variant} size={size} icon={restore ? ArchiveRestore : Undo2} onClick={run} loading={busy} disabled={busy} className={className}>
        {verb}
      </Btn>
    </>
  );
}
