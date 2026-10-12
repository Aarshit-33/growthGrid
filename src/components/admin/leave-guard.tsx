"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Save, TriangleAlert, Undo2 } from "lucide-react";
import { toast } from "./toast";
import { Btn } from "./ui";

/* ─────────────────────────────────────────────────────────────
   Leave guard: while any editor has unsaved changes, leaving the
   screen asks first, in the studio's own dialog: Save and
   continue, Discard changes, or Stay. Nothing leaves until one
   of the first two is chosen.

   Caught: in-app links (sidebar, breadcrumbs, link buttons),
   navigation started by studio code (useGuardedNavigate), the
   browser's Back and Forward (the move is undone, then asked
   about), and form submits such as Log out. Closing or reloading
   the tab gets the browser's own prompt (a page can't show its
   own there); the local draft (drafts.ts) covers that case too.
   New-tab clicks (modifier keys, target=_blank, downloads) are
   never blocked.

   Editors register with useLeaveGuard({ dirty, save, discard }).
   A form opts out of the submit guard with data-leave-guard="off".
   ───────────────────────────────────────────────────────────── */

export interface LeaveGuardEntry {
  dirty: boolean;
  /** Save; resolves true once everything is saved. */
  save: () => Promise<boolean>;
  /** Drop the unsaved changes (and their local draft). */
  discard: () => void;
}

type EntryRef = { current: LeaveGuardEntry };

interface LeaveGuardApi {
  register: (entry: EntryRef) => () => void;
  /** Navigate in the app, asking first when there are unsaved changes. */
  navigate: (href: string, options?: { replace?: boolean }) => void;
  /** Run something that leaves the page (a reload, say) without any prompt. */
  leave: (run: () => void) => void;
}

const LeaveGuardContext = createContext<LeaveGuardApi | null>(null);

/** What happens once the user agrees to leave. */
type Proceed = () => void;

/** This page's history entry, put back when Back/Forward is cancelled. */
interface HistorySpot {
  href: string;
  state: unknown;
}

function isNewTabClick(event: MouseEvent) {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function samePage(url: URL) {
  const here = window.location;
  return url.origin === here.origin && url.pathname === here.pathname && url.search === here.search;
}

export function LeaveGuardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const entries = useRef(new Set<EntryRef>());
  const [pending, setPending] = useState<{ proceed: Proceed } | null>(null);
  const asking = useRef(false);
  /** A navigation that's already agreed to (a replayed click or submit) passes once. */
  const bypass = useRef(false);
  /** The Back that follows "Discard"/"Save and continue" after a cancelled Back/Forward. */
  const allowPop = useRef(false);
  /** The user agreed to leave: the tab may unload without the browser's prompt. */
  const leaving = useRef(false);
  const here = useRef<HistorySpot | null>(null);

  const isDirty = useCallback(() => {
    for (const entry of entries.current) if (entry.current.dirty) return true;
    return false;
  }, []);

  const remember = useCallback(() => {
    here.current = { href: window.location.href, state: window.history.state };
  }, []);

  const ask = useCallback((proceed: Proceed) => {
    asking.current = true;
    setPending({ proceed });
  }, []);

  const api = useMemo<LeaveGuardApi>(
    () => ({
      register: (entry) => {
        entries.current.add(entry);
        return () => {
          entries.current.delete(entry);
        };
      },
      navigate: (href, options) => {
        const go = () => (options?.replace ? router.replace(href) : router.push(href));
        if (isDirty()) ask(go);
        else go();
      },
      leave: (run) => {
        leaving.current = true;
        bypass.current = true;
        try {
          run();
        } finally {
          bypass.current = false;
        }
      },
    }),
    [router, isDirty, ask],
  );

  // Each committed route: a fresh entry to restore, and nothing agreed yet. Next
  // writes the history entry in an insertion effect, so it's final by now.
  useEffect(() => {
    leaving.current = false;
    remember();
  }, [pathname, remember]);

  useEffect(() => {
    // Tab close, reload, another site: only the browser's own prompt is possible.
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (leaving.current || !isDirty()) return;
      event.preventDefault();
      event.returnValue = ""; // older browsers need it set to prompt
    };

    // Capture phase on document runs before Next's <Link> handler (React listens on the root).
    const onClick = (event: MouseEvent) => {
      if (bypass.current || event.defaultPrevented || isNewTabClick(event)) return;
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || samePage(url) || !isDirty()) return;
      event.preventDefault();
      event.stopPropagation();
      ask(() => {
        // Replay the click so the link's own behaviour runs too (closing the menu, say).
        if (anchor.isConnected) {
          bypass.current = true;
          try {
            anchor.click();
          } finally {
            bypass.current = false;
          }
        } else {
          router.push(url.pathname + url.search + url.hash);
        }
      });
    };

    // Form submits that leave the screen (Log out).
    const onSubmit = (event: SubmitEvent) => {
      if (bypass.current || event.defaultPrevented || !isDirty()) return;
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form || form.dataset.leaveGuard === "off") return;
      const submitter = event.submitter instanceof HTMLElement && form.contains(event.submitter) ? event.submitter : undefined;
      event.preventDefault();
      event.stopPropagation();
      ask(() => {
        if (!form.isConnected) return;
        leaving.current = true;
        bypass.current = true;
        try {
          form.requestSubmit(submitter);
        } finally {
          bypass.current = false;
        }
      });
    };

    // Back / Forward. The browser has already moved: put this page's entry back
    // (Next's listener never sees the event) and ask. Agreeing goes back once,
    // which lands on the entry that was asked for, Back or Forward alike.
    const onPopState = (event: PopStateEvent) => {
      if (allowPop.current) {
        allowPop.current = false;
        return;
      }
      const spot = here.current;
      if (!spot || !isDirty()) return;
      const to = new URL(window.location.href);
      const from = new URL(spot.href);
      if (to.pathname === from.pathname && to.search === from.search) return; // a #hash move
      event.stopImmediatePropagation();
      window.history.pushState(spot.state, "", spot.href);
      ask(() => {
        allowPop.current = true;
        window.history.back();
      });
    };

    // Next rewrites this page's entry after refreshes: re-read it before any
    // interaction that could be followed by Back (not while asking).
    const onInteract = () => {
      if (!asking.current) remember();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    // Capture on window: capture listeners at the target run before Next's own popstate listener.
    window.addEventListener("popstate", onPopState, true);
    document.addEventListener("pointerdown", onInteract, true);
    document.addEventListener("keydown", onInteract, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("popstate", onPopState, true);
      document.removeEventListener("pointerdown", onInteract, true);
      document.removeEventListener("keydown", onInteract, true);
    };
  }, [router, isDirty, ask, remember]);

  const close = () => {
    asking.current = false;
    setPending(null);
  };

  const saveAll = async () => {
    for (const entry of [...entries.current]) {
      if (entry.current.dirty && !(await entry.current.save())) return false;
    }
    return true;
  };

  const discardAll = () => {
    for (const entry of [...entries.current]) if (entry.current.dirty) entry.current.discard();
  };

  return (
    <LeaveGuardContext.Provider value={api}>
      {children}
      {pending && (
        <LeaveDialog
          onStay={close}
          onDiscard={() => {
            discardAll();
            close();
            pending.proceed();
          }}
          onSave={async () => {
            const ok = await saveAll();
            close();
            if (ok) pending.proceed();
            else toast.warn("Not saved, so you're still here", { body: "Fix what's flagged on the page, then try again." });
          }}
        />
      )}
    </LeaveGuardContext.Provider>
  );
}

/**
 * For an editor: ask before leaving while `dirty`. `save` and `discard` always
 * see the editor's latest state.
 */
export function useLeaveGuard(entry: LeaveGuardEntry) {
  const api = useContext(LeaveGuardContext);
  const ref = useRef<LeaveGuardEntry>(entry);

  useEffect(() => {
    ref.current = entry;
  });

  useEffect(() => api?.register(ref), [api]);
}

/** push/replace for studio code, through the leave guard. */
export function useGuardedNavigate() {
  const api = useContext(LeaveGuardContext);
  const router = useRouter();
  return useMemo(
    () => ({
      push: (href: string) => (api ? api.navigate(href) : router.push(href)),
      replace: (href: string) => (api ? api.navigate(href, { replace: true }) : router.replace(href)),
      /** Leave without asking: the user already agreed (e.g. "lose my edits"). */
      leave: (run: () => void) => (api ? api.leave(run) : run()),
    }),
    [api, router],
  );
}

/* ── The dialog ───────────────────────────────────────────── */

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

function LeaveDialog({ onStay, onDiscard, onSave }: { onStay: () => void; onDiscard: () => void; onSave: () => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [saving, setSaving] = useState(false);
  const titleId = useId();
  const bodyId = useId();

  // A modal (the page behind goes inert); Stay has focus, and focus returns on close.
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    dialog?.querySelector<HTMLElement>("[data-stay]")?.focus();
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  // Tab and Shift+Tab cycle inside the dialog.
  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab" || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const stay = () => {
    if (!saving) onStay();
  };

  return (
    <dialog
      ref={ref}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onKeyDown={onKeyDown}
      onCancel={(event) => {
        event.preventDefault(); // Esc means Stay
        stay();
      }}
      onClick={(event) => event.target === ref.current && stay()}
      className="m-auto w-[min(30rem,calc(100vw-2rem))] animate-rise-in rounded-panel border border-line-strong bg-surface p-0 text-ink shadow-panel [animation-duration:0.45s] backdrop:bg-bg/75 backdrop:backdrop-blur-sm"
    >
      <div className="p-6 sm:p-7">
        <div className="flex items-start gap-3.5">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl border border-warn/35 bg-warn/[0.08] text-warn">
            <TriangleAlert className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-[1.25rem] font-medium tracking-[-0.02em]">
              You have unsaved changes
            </h2>
            <div id={bodyId} className="mt-2 space-y-1.5 text-[0.9rem] leading-relaxed text-muted">
              <p>Save them before you go, or discard them. Stay keeps everything as it is.</p>
              <p className="text-[0.8rem] text-faint">Until you decide, a copy is kept in this browser.</p>
            </div>
          </div>
        </div>
        <div className="mt-7 flex flex-wrap justify-end gap-2">
          <Btn data-stay onClick={stay} disabled={saving}>
            Stay
          </Btn>
          <Btn variant="danger" icon={Undo2} onClick={onDiscard} disabled={saving}>
            Discard changes
          </Btn>
          <Btn
            variant="primary"
            icon={Save}
            loading={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave();
              } finally {
                setSaving(false);
              }
            }}
          >
            Save and continue
          </Btn>
        </div>
      </div>
    </dialog>
  );
}
