"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  FileJson,
  History as HistoryIcon,
  House,
  Info,
  ListTree,
  LoaderCircle,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { deleteItemAction, duplicateItemAction, saveItemAction, savePageAction, saveSettingsAction } from "@/lib/admin/actions";
import { adminHref } from "@/lib/admin/config";
import { HOME_SECTION_META, HOME_SWITCH_COPY, isOnHomepage, type CollectionMeta } from "@/lib/admin/meta";
import type { ActionResult, FieldIssue, FormContext, Path } from "@/lib/admin/types";
import type { CollectionName } from "@/lib/content/registry";
import type { PageKey } from "@/lib/schemas";
import { cn, slugify } from "@/lib/utils";
import { Banner, DraftBanner, FailureBanner, type Failure } from "./banners";
import { draftKey, useLocalDraft } from "./drafts";
import { flaggedSections, formSections, SchemaForm } from "./form/schema-form";
import { fieldId, getIn, humanize, issueMap, keysOf, parsePathKey, pathKey, same, setIn, type Raw } from "./form/schema-utils";
import { useConfirm, useModKey, useSaveShortcut } from "./hooks";
import { useGuardedNavigate, useLeaveGuard } from "./leave-guard";
import { TimeAgo } from "./time-ago";
import { toast } from "./toast";
import { Badge, Btn, BtnLabel, BtnLink, Dot, Kbd, Panel, Switch } from "./ui";

/* ─────────────────────────────────────────────────────────────
   One editor for every document: site settings, a page, or an
   item of a collection. The form comes from the schema; this adds
   saving, conflict handling, visibility and navigation, a local
   draft of unsaved changes (drafts.ts) and the ask-before-leaving
   guard (leave-guard.tsx).
   ───────────────────────────────────────────────────────────── */

export type EditorTarget =
  | { kind: "settings" }
  | { kind: "page"; key: PageKey }
  | { kind: "item"; name: CollectionName; id: string | null; meta: CollectionMeta; keyField: string };

export interface DocEditorProps {
  base: string;
  target: EditorTarget;
  /** Heading when the document has no title of its own. */
  title: string;
  eyebrow: string;
  back?: { href: string; label: string };
  /** content/… file the document lives in. */
  file: string;
  form: FormContext;
  /** null: the item doesn't exist (any more). */
  initial: Raw | null;
  version: string | null;
  /** Public URL, when the document has one. */
  publicHref?: string;
  /** Shown above the form (tips, links to related screens). */
  intro?: ReactNode;
  /** A live preview of the value being edited (saved or not), between the intro and the form. */
  preview?: (value: Raw) => ReactNode;
  /** Re-render the server parts after a save: the Studio's own frame shows this document (the site name, the Branding mark). */
  refreshOnSave?: boolean;
  /** What the signed-in role may do here beyond editing (the server checks again). */
  allowed?: { delete: boolean; layout: boolean };
  /** This document's recorded changes (none for a new item). */
  history?: DocHistory | null;
  /**
   * Tells this screen's local draft apart from another screen editing the same
   * document (Branding and Site settings both edit the settings, say).
   */
  draftScope?: string;
}

function draftDoc(target: EditorTarget, scope?: string) {
  const doc =
    target.kind === "settings" ? "settings" : target.kind === "page" ? `page:${target.key}` : `item:${target.name}:${target.id ?? "new"}`;
  return scope ? `${doc}@${scope}` : doc;
}

const isRaw = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value);

export interface DocHistory {
  /** History, filtered to this document. */
  href: string;
  total: number;
  last: { name: string; at: string; summary: string } | null;
}

export function DocEditor({
  base,
  target,
  title,
  eyebrow,
  back,
  file,
  form,
  initial,
  version: initialVersion,
  publicHref,
  intro,
  preview,
  refreshOnSave = false,
  allowed = { delete: true, layout: true },
  history = null,
  draftScope,
}: DocEditorProps) {
  const router = useRouter();
  const nav = useGuardedNavigate();
  const mod = useModKey();
  const [confirm, confirmDialog] = useConfirm();
  const item = target.kind === "item" ? target : null;
  const isNew = item?.id === null;

  // The editor owns its copy once mounted: refreshed props (after a save
  // elsewhere, or a rename) never overwrite what's being edited.
  const [missing] = useState(initial === null);
  const [opened] = useState<Raw>(() => initial ?? {});
  const [value, setValue] = useState<Raw>(() => initial ?? {});
  const [saved, setSaved] = useState<Raw>(() => initial ?? {});
  const [version, setVersion] = useState(initialVersion);
  const [formKey, setFormKey] = useState(0);
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<"delete" | "duplicate" | null>(null);

  const dirty = useMemo(() => !same(value, saved), [value, saved]);

  // Unsaved changes are copied to this browser; a copy left by an earlier visit is offered back.
  const draft = useLocalDraft<Raw>({ key: draftKey(base, draftDoc(target, draftScope)), value, dirty, version, enabled: !missing });
  const offered = draft.pending && isRaw(draft.pending.value) && !same(draft.pending.value, opened) ? draft.pending : null;
  const { pending: found, clear: clearDraft } = draft;
  useEffect(() => {
    // Nothing to offer (it matches what's saved, or can't be read): drop it.
    if (found && !offered) clearDraft();
  }, [found, offered, clearDraft]);

  const issuesByPath = useMemo(() => issueMap(issues), [issues]);
  const sections = useMemo(() => formSections(form), [form]);
  const flagged = useMemo(() => flaggedSections(sections, issuesByPath), [sections, issuesByPath]);
  const order = keysOf(form.schema);

  const titleField = item?.meta.titleField;
  const keyField = item?.keyField;
  const liveTitle = titleField ? getIn(value, parsePathKey(titleField)) : undefined;
  const heading = typeof liveTitle === "string" && liveTitle.trim() ? liveTitle : item ? `New ${item.meta.singular}` : title;
  const published = value.published !== false;

  /** Field edits. New items get their slug from the title until it's edited by hand. */
  const onChange = useCallback(
    (update: (previous: Raw) => Raw) =>
      setValue((previous) => {
        let next = update(previous);
        if (isNew && titleField && keyField) {
          const before = getIn(previous, parsePathKey(titleField));
          const after = getIn(next, parsePathKey(titleField));
          const slug = previous[keyField];
          const auto = !slug || slug === slugify(typeof before === "string" ? before : "");
          if (after !== before && auto && typeof after === "string") next = setIn(next, [keyField], slugify(after), keysOf(form.schema)) as Raw;
        }
        return next;
      }),
    [isNew, titleField, keyField, form.schema],
  );

  const itemHref = (id: string) => adminHref(base, `/collections/${item?.name}/${encodeURIComponent(id)}`);

  /** Resolves true once saved. */
  const save = async (force = false): Promise<boolean> => {
    if (saving || missing) return false;
    setSaving(true);
    const data = value;
    let result: ActionResult<{ version: string; id?: string }>;
    try {
      result =
        target.kind === "settings"
          ? await saveSettingsAction({ data, version: version ?? "", force })
          : target.kind === "page"
            ? await savePageAction({ key: target.key, data, version: version ?? "", force })
            : await saveItemAction({ name: target.name, id: target.id, data, version, force });
    } catch {
      result = { ok: false, error: "Couldn't reach the server. Is `npm run dev` still running?" };
    }
    setSaving(false);

    if (!result.ok) {
      setFailure(result);
      setIssues(result.issues ?? []);
      if (!result.issues?.length && !result.conflict && !result.auth) toast.error(result.error, { body: result.errors });
      if (result.issues?.length) window.scrollTo({ top: 0, behavior: "smooth" });
      return false;
    }

    setSaved(data);
    setVersion(result.data.version);
    setIssues([]);
    setFailure(null);
    setNotes(result.warnings);
    draft.clear();
    draft.settle();
    toast.success(isNew ? `${humanize(item?.meta.singular ?? "item")} created` : "Changes saved", {
      body: result.warnings.length
        ? `Saved with ${result.warnings.length} note${result.warnings.length === 1 ? "" : "s"}: see the top of the page.`
        : `Written to ${file}.`,
    });
    const newId = result.data.id;
    if (item && newId && (isNew || newId !== item.id)) router.replace(itemHref(newId));
    // The editor keeps its own copy, so refreshed props never overwrite what's being edited.
    else if (refreshOnSave) router.refresh();
    return true;
  };

  // ⌘S / Ctrl+S saves (when there's something to save).
  useSaveShortcut(() => {
    if (dirty || isNew || failure?.conflict) void save();
  });

  const discard = () => {
    setValue(saved);
    setIssues([]);
    setFailure(null);
    setFormKey((k) => k + 1);
    draft.clear();
  };

  // Leaving with unsaved changes asks first: save, discard, or stay.
  useLeaveGuard({ dirty: dirty && !missing, save: () => save(), discard });

  const restoreDraft = () => {
    if (!offered) return;
    setValue(offered.value);
    setIssues([]);
    setFailure(null);
    setFormKey((k) => k + 1);
    draft.settle();
    toast.info("Changes restored", { body: "They're not saved yet: review them, then Save." });
  };

  const dismissDraft = () => {
    draft.settle();
    // Edits made since opening have their own copy (written on the next autosave); keep it.
    if (!dirty) draft.clear();
  };

  const remove = async () => {
    if (!item?.id) return;
    const ok = await confirm({
      title: `Delete this ${item.meta.singular}?`,
      body: (
        <>
          <p>
            <strong className="text-ink">{heading}</strong> comes off the site and moves to <em>Deleted items</em> in History, with a full
            copy. An owner or editor can restore it at any time.
          </p>
          <p className="mt-2.5">
            To take it off the site for now, switch off <em>Visible on site</em> instead.
          </p>
        </>
      ),
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    setBusy("delete");
    const result = await deleteItemAction({ name: item.name, id: item.id });
    setBusy(null);
    if (!result.ok) return toast.error(result.error, { body: result.errors });
    toast.success(`${humanize(item.meta.singular)} moved to Deleted items`, { body: "Restore it any time from History › Deleted items." });
    setSaved(value); // nothing left to guard
    draft.clear();
    router.replace(adminHref(base, `/collections/${item.name}`));
  };

  const duplicate = async () => {
    if (!item?.id) return;
    if (dirty) {
      const ok = await confirm({
        title: "Duplicate the saved version?",
        body: "The copy is made from what's saved, without your unsaved edits. Before it opens, you'll be asked whether to save or discard them.",
        confirmLabel: "Duplicate",
      });
      if (!ok) return;
    }
    setBusy("duplicate");
    const result = await duplicateItemAction({ name: item.name, id: item.id });
    setBusy(null);
    if (!result.ok) return toast.error(result.error, { body: result.errors });
    toast.success("Copy created", { body: "It starts hidden, so you can finish it before it goes live." });
    nav.push(itemHref(result.data.id));
  };

  const setFlag = (flag: "published" | "home", on: boolean) =>
    onChange((previous) => {
      if (flag === "published") return setIn(previous, ["published"], on ? undefined : false, order) as Raw;
      switch (item?.meta.home) {
        case "flag":
          return setIn(previous, ["home"], on ? undefined : false, order) as Raw;
        case "featured":
          return setIn(previous, ["featured"], on, order) as Raw;
        case "scope": {
          const scopes = (Array.isArray(previous.scopes) ? (previous.scopes as string[]) : []).filter((s) => s !== "home");
          return setIn(previous, ["scopes"], on ? ["home", ...scopes] : scopes, order) as Raw;
        }
        default:
          return previous;
      }
    });

  const reveal = (path: Path) => {
    const key = pathKey(path);
    requestAnimationFrame(() => {
      const el =
        document.getElementById(fieldId(key)) ??
        document.querySelector(`[data-field="${fieldId(key)}"]`) ??
        document.getElementById(`sec-${path[0]}`) ??
        document.getElementById("sec-details");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (el instanceof HTMLElement && el.matches("input, textarea, select, button")) el.focus({ preventScroll: true });
    });
  };

  if (missing) {
    return (
      <div className="mx-auto max-w-xl py-24 text-center">
        <p className="eyebrow justify-center">Not found</p>
        <h1 className="mt-4 font-display text-[2rem] font-medium tracking-[-0.03em]">This {item?.meta.singular ?? "document"} doesn&apos;t exist</h1>
        <p className="mt-3 text-muted">It may have been renamed or deleted, here or in the files.</p>
        {back && (
          <BtnLink href={back.href} icon={ArrowLeft} variant="primary" className="mt-8">
            Back to {back.label}
          </BtnLink>
        )}
      </div>
    );
  }

  const status = saving ? (
    <span className="inline-flex items-center gap-2 text-[0.78rem] text-muted">
      <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> Saving…
    </span>
  ) : dirty ? (
    <span className="inline-flex items-center gap-2 text-[0.78rem] text-warn">
      <Dot tone="warn" pulse /> Unsaved changes
    </span>
  ) : (
    <span className="inline-flex items-center gap-2 text-[0.78rem] text-muted">
      <Check className="size-3.5 text-em" aria-hidden="true" /> {isNew ? "Not saved yet" : "All changes saved"}
    </span>
  );

  return (
    <div className="pb-28">
      {confirmDialog}

      {/* Sticky action bar. The title asks for 16rem, so on a phone the buttons take their own row instead of crushing it. */}
      <div className="sticky top-14 z-30 -mx-[var(--admin-px)] border-b border-line bg-bg/80 px-[var(--admin-px)] backdrop-blur-xl lg:top-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3.5">
          <div className="min-w-0 grow basis-64">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.76rem] text-faint">
              {back ? (
                <Link href={back.href} className="group/back inline-flex items-center gap-1.5 transition-colors hover:text-ink">
                  <ArrowLeft className="size-3.5 transition-transform duration-300 group-hover/back:-translate-x-0.5" aria-hidden="true" />
                  {back.label}
                </Link>
              ) : (
                <span className="label-mono text-[0.64rem]">{eyebrow}</span>
              )}
              <span aria-hidden="true">·</span>
              <span aria-live="polite" className="whitespace-nowrap">
                {status}
              </span>
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-2.5">
              <h1 className="line-clamp-2 min-w-0 break-words font-display text-[1.35rem] font-medium leading-tight tracking-[-0.025em] text-ink sm:text-[1.6rem]">
                {heading}
              </h1>
              {item && !published && (
                <Badge tone="warn" icon={EyeOff}>
                  Hidden
                </Badge>
              )}
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {publicHref && !isNew && published && (
              <BtnLink href={publicHref} external size="sm" variant="ghost" icon={ExternalLink}>
                <BtnLabel>View on site</BtnLabel>
              </BtnLink>
            )}
            {item && !isNew && (
              <>
                <Btn size="sm" variant="ghost" icon={Copy} onClick={duplicate} loading={busy === "duplicate"} disabled={!!busy || saving}>
                  <BtnLabel>Duplicate</BtnLabel>
                </Btn>
                {allowed.delete && (
                  <Btn size="sm" variant="danger" icon={Trash2} onClick={remove} loading={busy === "delete"} disabled={!!busy || saving}>
                    <BtnLabel>Delete</BtnLabel>
                  </Btn>
                )}
              </>
            )}
            {dirty && !isNew && (
              <Btn size="sm" variant="ghost" icon={RotateCcw} onClick={discard} disabled={saving}>
                <BtnLabel>Discard</BtnLabel>
              </Btn>
            )}
            <Btn variant="primary" icon={Save} onClick={() => save()} loading={saving} disabled={!dirty && !isNew} title={`Save (${mod}+S)`}>
              {isNew ? `Create ${item?.meta.singular}` : "Save"}
              <span className="hidden xl:inline-flex">
                <Kbd onAccent>{mod === "⌘" ? "⌘S" : "Ctrl S"}</Kbd>
              </span>
            </Btn>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_17.5rem]">
        <div className="min-w-0 space-y-6">
          {intro}
          {offered && <DraftBanner at={offered.at} stale={offered.version !== initialVersion} onRestore={restoreDraft} onDiscard={dismissDraft} />}
          {failure && (
            <FailureBanner
              failure={failure}
              issues={issues}
              base={base}
              onReveal={reveal}
              onRetry={() => save()}
              onForce={() => save(true)}
              onDismiss={() => setFailure(null)}
              onReload={() =>
                nav.leave(() => {
                  draft.clear();
                  window.location.reload();
                })
              }
            />
          )}
          {notes.length > 0 && !failure && (
            <Banner tone="info" icon={Info} title="Saved, with notes" onDismiss={() => setNotes([])}>
              <ul className="list-disc space-y-1 pl-4">
                {notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </Banner>
          )}
          {preview?.(value)}
          <SchemaForm key={formKey} form={form} value={value} onChange={onChange} issues={issuesByPath} sections={sections} />
        </div>

        <aside className="space-y-4 xl:sticky xl:top-28 xl:max-h-[calc(100svh-8rem)] xl:self-start xl:overflow-y-auto xl:pb-4 no-scrollbar">
          {item && <VisibilityPanel base={base} meta={item.meta} value={value} onFlag={setFlag} canLayout={allowed.layout} />}
          {sections.length > 1 && <SectionNav sections={sections} flagged={flagged} />}
          {history && <HistoryPanel history={history} />}
          <Panel bodyClassName="space-y-2 py-4">
            <p className="flex items-center gap-2 text-[0.8rem] font-medium text-dim">
              <FileJson className="size-4 text-em" aria-hidden="true" /> Stored in
            </p>
            <code className="block break-all font-mono text-[0.76rem] text-muted">{file}</code>
            <p className="text-[0.74rem] leading-relaxed text-faint">
              Saving writes this file directly and checks the whole site first, so a change that would break a page is never saved. Every
              save is recorded in History.
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

/* ── Side panels ──────────────────────────────────────────── */

function ToggleRow({
  id,
  label,
  detail,
  checked,
  onChange,
  muted = false,
}: {
  id: string;
  label: string;
  detail: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  muted?: boolean;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 transition-opacity", muted && "opacity-55")}>
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-[0.84rem] font-medium text-ink">
          {label}
        </label>
        <p id={`${id}-detail`} className="mt-0.5 text-[0.74rem] leading-snug text-faint">
          {detail}
        </p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} aria-describedby={`${id}-detail`} className="mt-0.5" />
    </div>
  );
}

function VisibilityPanel({
  base,
  meta,
  value,
  onFlag,
  canLayout,
}: {
  base: string;
  meta: CollectionMeta;
  value: Raw;
  onFlag: (flag: "published" | "home", on: boolean) => void;
  /** The role can open Homepage layout. */
  canLayout: boolean;
}) {
  const published = value.published !== false;
  const rule = meta.home;
  const onHome = isOnHomepage(rule, value);
  const section = meta.homeSection ? HOME_SECTION_META[meta.homeSection].label : null;

  return (
    <Panel title="Visibility" icon={published ? Eye : EyeOff} bodyClassName="space-y-4 py-4">
      <ToggleRow
        id="visibility-published"
        label="Visible on site"
        detail={published ? "Live everywhere it appears." : "Hidden everywhere. Nothing is deleted."}
        checked={published}
        onChange={(on) => onFlag("published", on)}
      />
      {(rule === "flag" || rule === "featured" || rule === "scope") && (
        <ToggleRow
          id="visibility-home"
          label={HOME_SWITCH_COPY[rule].label}
          detail={!published ? "Takes effect once it's visible." : onHome ? HOME_SWITCH_COPY[rule].on : HOME_SWITCH_COPY[rule].off}
          checked={onHome}
          onChange={(on) => onFlag("home", on)}
          muted={!published}
        />
      )}
      {rule === "always" && section && (
        <p className="flex items-start gap-2 text-[0.76rem] leading-snug text-faint">
          <House className="mt-px size-3.5 shrink-0 text-em" aria-hidden="true" />
          Every visible {meta.singular} shows in the homepage&apos;s {section} section.
        </p>
      )}
      <div className="space-y-2 border-t border-line pt-3.5">
        <p className="text-[0.72rem] leading-relaxed text-faint">
          <span className="text-muted">Appears on:</span> {meta.appearsOn}
        </p>
        {section && canLayout && (
          <Link
            href={adminHref(base, "/homepage")}
            className="group/link inline-flex items-center gap-1.5 text-[0.76rem] font-medium text-em transition-colors hover:text-hot"
          >
            <House className="size-3.5" aria-hidden="true" />
            Homepage layout · {section}
            <span aria-hidden="true" className="transition-transform duration-300 group-hover/link:translate-x-0.5">
              →
            </span>
          </Link>
        )}
      </div>
    </Panel>
  );
}

function HistoryPanel({ history }: { history: DocHistory }) {
  const { last, total, href } = history;
  return (
    <Panel bodyClassName="space-y-2.5 py-4">
      <p className="flex items-center gap-2 text-[0.8rem] font-medium text-dim">
        <HistoryIcon className="size-4 text-em" aria-hidden="true" /> History
      </p>
      {last ? (
        <div className="text-[0.78rem] leading-relaxed text-muted">
          <p>
            Last change by <span className="font-medium text-ink">{last.name}</span>, <TimeAgo at={last.at} />
          </p>
          <p className="mt-0.5 line-clamp-2 text-faint">{last.summary}</p>
        </div>
      ) : (
        <p className="text-[0.76rem] leading-relaxed text-faint">No changes recorded yet. Every save from now on is kept, with who made it.</p>
      )}
      {total > 0 && (
        <Link
          href={href}
          className="group/link inline-flex items-center gap-1.5 text-[0.76rem] font-medium text-em transition-colors hover:text-hot"
        >
          {total === 1 ? "See the change" : `See all ${total} changes`}
          <span aria-hidden="true" className="transition-transform duration-300 group-hover/link:translate-x-0.5">
            →
          </span>
        </Link>
      )}
    </Panel>
  );
}

function SectionNav({ sections, flagged }: { sections: { id: string; label: string }[]; flagged: Set<string> }) {
  const [active, setActive] = useState<string | null>(sections[0]?.id ?? null);

  useEffect(() => {
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
          else visible.delete(entry.target.id);
        }
        const first = [...visible.entries()].sort((a, b) => a[1] - b[1])[0];
        if (first) setActive(first[0]);
      },
      { rootMargin: "-120px 0px -45% 0px" },
    );
    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <Panel bodyClassName="py-4">
      <p className="mb-2.5 flex items-center gap-2 text-[0.8rem] font-medium text-dim">
        <ListTree className="size-4 text-em" aria-hidden="true" /> On this page
      </p>
      <nav aria-label="Sections of this form">
        <ul className="relative space-y-0.5 border-l border-line">
          {sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  setActive(section.id);
                }}
                aria-current={active === section.id ? "location" : undefined}
                className={cn(
                  "-ml-px flex items-center justify-between gap-2 border-l py-1 pl-3 text-[0.8rem] transition-colors duration-200",
                  active === section.id ? "border-em text-ink" : "border-transparent text-muted hover:border-line-strong hover:text-ink",
                )}
              >
                <span className="truncate">{section.label}</span>
                {flagged.has(section.id) && <Dot tone="danger" />}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </Panel>
  );
}
