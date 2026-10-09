"use client";

import type { ReactNode } from "react";
import { CircleAlert, LogIn, RotateCcw, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { adminHref } from "@/lib/admin/config";
import type { ActionResult, FieldIssue, Path } from "@/lib/admin/types";
import { cn } from "@/lib/utils";
import { humanize } from "./form/schema-utils";
import { Btn, BtnLink } from "./ui";

/* ─────────────────────────────────────────────────────────────
   Inline banners for the editors: a failed save (with field
   problems), content changed elsewhere, or a session that ended.
   ───────────────────────────────────────────────────────────── */

export type Failure = Extract<ActionResult, { ok: false }>;

export function Banner({
  tone,
  icon: IconComponent,
  title,
  children,
  actions,
  onDismiss,
}: {
  tone: "danger" | "warn" | "info";
  icon: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  onDismiss?: () => void;
}) {
  const tones = {
    danger: "border-danger/40 bg-danger/[0.06] [--tone:var(--color-danger)]",
    warn: "border-warn/40 bg-warn/[0.06] [--tone:var(--color-warn)]",
    info: "border-info/35 bg-info/[0.05] [--tone:var(--color-info)]",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("animate-rise-in rounded-2xl border p-4 sm:p-5", tones[tone])}>
      <div className="flex items-start gap-3">
        <IconComponent className="mt-0.5 size-[1.1rem] shrink-0 text-(--tone)" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[0.92rem] font-medium text-ink">{title}</p>
          {children && <div className="mt-2 text-[0.84rem] leading-relaxed text-dim">{children}</div>}
          {actions && <div className="mt-3.5 flex flex-wrap gap-2">{actions}</div>}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="grid size-7 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-white/[0.06] hover:text-ink"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

const describePath = (path: Path) =>
  path.map((part) => (typeof part === "number" ? `#${part + 1}` : humanize(part))).join(" › ") || "Document";

/** What went wrong with a save, and the way out: log in again, resolve a conflict, or fix fields. */
export function FailureBanner({
  failure,
  issues = [],
  base,
  onReveal,
  onRetry,
  onForce,
  onDismiss,
}: {
  failure: Failure;
  issues?: FieldIssue[];
  base: string;
  /** Scroll to a field with a problem. */
  onReveal?: (path: Path) => void;
  onRetry: () => void;
  onForce: () => void;
  onDismiss: () => void;
}) {
  if (failure.auth) {
    return (
      <Banner
        tone="danger"
        icon={LogIn}
        title="You've been signed out"
        actions={
          <>
            <BtnLink href={adminHref(base, "/login")} external size="sm" variant="primary" icon={LogIn}>
              Log in (new tab)
            </BtnLink>
            <Btn size="sm" onClick={onRetry}>
              Retry save
            </Btn>
          </>
        }
      >
        {failure.error}
      </Banner>
    );
  }

  if (failure.conflict) {
    return (
      <Banner
        tone="warn"
        icon={TriangleAlert}
        title="Changed somewhere else"
        onDismiss={onDismiss}
        actions={
          <>
            <Btn size="sm" icon={RotateCcw} onClick={() => window.location.reload()}>
              Load the latest (lose my edits)
            </Btn>
            <Btn size="sm" variant="danger" onClick={onForce}>
              Save mine anyway
            </Btn>
          </>
        }
      >
        {failure.error} Saving anyway replaces those changes with yours.
      </Banner>
    );
  }

  return (
    <Banner tone="danger" icon={CircleAlert} title={failure.error} onDismiss={onDismiss}>
      {issues.length > 0 && (
        <ul className="space-y-1">
          {issues.slice(0, 15).map((issue, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => onReveal?.(issue.path)}
                className="group/issue text-left transition-colors hover:text-ink"
              >
                <span className="font-mono text-[0.76rem] text-faint group-hover/issue:text-hot">{describePath(issue.path)}</span>
                <span className="mx-1.5 text-faint">·</span>
                {issue.message}
              </button>
            </li>
          ))}
          {issues.length > 15 && <li className="text-faint">…and {issues.length - 15} more</li>}
        </ul>
      )}
      {failure.errors && failure.errors.length > 0 && (
        <ul className="mt-2 space-y-2">
          {failure.errors.map((error, i) => (
            <li key={i} className="whitespace-pre-wrap rounded-lg bg-bg/40 px-3 py-2 font-mono text-[0.74rem] text-dim">
              {error}
            </li>
          ))}
        </ul>
      )}
    </Banner>
  );
}
