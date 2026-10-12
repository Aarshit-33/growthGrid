"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CircleAlert, CircleCheck, DatabaseZap, Download, RefreshCw, X } from "lucide-react";
import { backupContentAction, syncContentAction } from "@/lib/admin/actions";
import type { SyncReport } from "@/lib/admin/sync";
import { cn } from "@/lib/utils";
import { toast } from "./toast";
import { Badge, Btn, IconBtn } from "./ui";

/* ─────────────────────────────────────────────────────────────
   Sidebar "Sync content" (owners): checks the content store,
   creates only missing documents (MongoDB), refreshes the live
   site, and shows the report. Also downloads a JSON backup.
   ───────────────────────────────────────────────────────────── */

const OFFLINE = "Couldn't reach the server. Check your connection and try again.";

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SyncButton({ mongo, className }: { mongo: boolean; className: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [report, setReport] = useState<SyncReport | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);

  const sync = async () => {
    dialog.current?.showModal();
    setSyncing(true);
    setFailure(null);
    try {
      const result = await syncContentAction();
      if (!result.ok) {
        setFailure(result.error);
        return;
      }
      setReport(result.data);
      router.refresh();
    } catch {
      setFailure(OFFLINE);
    } finally {
      setSyncing(false);
    }
  };

  const backup = async () => {
    setSaving(true);
    try {
      const result = await backupContentAction();
      if (!result.ok) return toast.error(result.error);
      download(result.data.filename, result.data.json);
      toast.success("Backup downloaded", { body: `${result.data.filename}: settings, every page and every collection.` });
    } catch {
      toast.error(OFFLINE);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button type="button" onClick={sync} className={className} aria-haspopup="dialog">
        <DatabaseZap className="size-4 shrink-0 text-faint group-hover/nav:text-dim" aria-hidden="true" />
        Sync content
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="sync-title"
        onClick={(event) => event.target === dialog.current && dialog.current?.close()}
        className="m-auto max-h-[min(44rem,92svh)] w-[min(44rem,94vw)] overflow-hidden rounded-2xl border border-line bg-bg p-0 text-ink shadow-panel backdrop:bg-bg/70 backdrop:backdrop-blur-sm"
      >
        <div className="flex max-h-[inherit] flex-col">
          <header className="flex items-start gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 id="sync-title" className="font-display text-[1.05rem] font-medium tracking-[-0.015em]">
                Sync content
              </h2>
              <p className="mt-0.5 text-[0.82rem] leading-relaxed text-muted">
                {mongo
                  ? "Checks MongoDB, creates only missing content from the bundled files (never overwrites or deletes), then refreshes the live site."
                  : "JSON mode (CONTENT_SOURCE=json): validates the files in /content and refreshes the site. Nothing is created."}
              </p>
            </div>
            <IconBtn icon={X} label="Close" onClick={() => dialog.current?.close()} />
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[0.84rem]">
            {syncing ? (
              <p className="flex items-center gap-2 text-muted">
                <RefreshCw className="size-4 animate-spin" aria-hidden="true" /> Syncing…
              </p>
            ) : failure ? (
              <Problem title="Sync couldn't run" lines={[failure]} />
            ) : report ? (
              <Report report={report} />
            ) : null}
          </div>

          <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
            <Btn size="sm" variant="secondary" icon={Download} loading={saving} onClick={backup}>
              Download backup
            </Btn>
            <Btn size="sm" variant="primary" icon={RefreshCw} loading={syncing} onClick={sync} className="ml-auto">
              Sync again
            </Btn>
          </footer>
        </div>
      </dialog>
    </>
  );
}

function Problem({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-xl border border-danger/35 bg-danger/[0.06] px-3.5 py-3">
      <p className="flex items-center gap-2 font-medium text-danger">
        <CircleAlert className="size-4 shrink-0" aria-hidden="true" /> {title}
      </p>
      {lines.map((line, i) => (
        <p key={i} className="mt-1.5 whitespace-pre-wrap break-words font-mono text-[0.74rem] leading-relaxed text-dim">
          {line}
        </p>
      ))}
    </div>
  );
}

function Report({ report }: { report: SyncReport }) {
  const when = new Date(report.at).toLocaleString();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {report.ok ? (
          <Badge tone="em" icon={CircleCheck}>All good</Badge>
        ) : (
          <Badge tone={report.failure ? "danger" : "warn"} icon={CircleAlert}>
            {report.failure ? "Failed" : "Needs attention"}
          </Badge>
        )}
        <Badge tone="info">{report.mode}</Badge>
        <span className="font-mono text-[0.72rem] text-faint">
          {report.where} · {when} · {report.tookMs} ms
        </span>
      </div>

      {report.failure && <Problem title="Couldn't sync" lines={[report.failure]} />}

      {report.created.length > 0 && (
        <section>
          <h3 className="mb-1.5 font-medium">Created</h3>
          <ul className="list-inside list-disc text-dim">
            {report.created.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      {report.invalid.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-medium text-danger">Invalid documents ({report.invalid.length})</h3>
          {report.invalid.map((doc) => (
            <Problem key={doc.label} title={doc.label} lines={[doc.errors.join("\n")]} />
          ))}
        </section>
      )}

      {report.errors.length > 0 && (
        <section>
          <Problem title={`Site checks: ${report.errors.length} error(s)`} lines={report.errors} />
        </section>
      )}

      {report.collections.length > 0 && (
        <section>
          <h3 className="mb-1.5 font-medium">Collections</h3>
          <table className="w-full text-left text-[0.8rem]">
            <thead className="text-faint">
              <tr>
                <th className="py-1 font-normal">Collection</th>
                <th className="py-1 text-right font-normal">Stored</th>
                <th className="py-1 text-right font-normal">Bundled</th>
                <th className="py-1 text-right font-normal">Created</th>
              </tr>
            </thead>
            <tbody>
              {report.collections.map((row) => (
                <tr key={row.name} className="border-t border-line align-top">
                  <td className="py-1.5">
                    {row.label}
                    {row.note && <span className="block text-[0.72rem] text-warn">{row.note}</span>}
                  </td>
                  <td className={cn("py-1.5 text-right tabular-nums", row.count === 0 && row.bundled > 0 && "text-warn")}>{row.count}</td>
                  <td className="py-1.5 text-right tabular-nums text-faint">{row.bundled}</td>
                  <td className={cn("py-1.5 text-right tabular-nums", row.created > 0 && "text-em")}>{row.created || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {report.pages.length > 0 && (
        <section>
          <h3 className="mb-1.5 font-medium">Pages</h3>
          <div className="flex flex-wrap gap-1.5">
            {report.pages.map((page) => (
              <Badge key={page.key} tone={page.status === "ok" ? "muted" : page.status === "created" ? "em" : "danger"}>
                {page.label}
                {page.status !== "ok" && ` · ${page.status}`}
              </Badge>
            ))}
          </div>
        </section>
      )}

      {report.warnings.length > 0 && (
        <details className="text-dim">
          <summary className="cursor-pointer text-faint">{report.warnings.length} warning(s)</summary>
          <ul className="mt-1.5 list-inside list-disc space-y-1 text-[0.78rem]">
            {report.warnings.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
