"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Btn } from "./ui";

/* ─────────────────────────────────────────────────────────────
   Editor helpers: a leave-without-saving guard, the save shortcut
   and a promise-based confirm dialog (`if (await confirm({...})) …`).
   ───────────────────────────────────────────────────────────── */

const noSubscribe = () => () => {};

/** "⌘" on Apple devices, else "Ctrl" (server and first paint say "Ctrl", so hydration matches). */
export function useModKey() {
  return useSyncExternalStore(
    noSubscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}

/** ⌘S / Ctrl+S calls `onSave`, which always sees the latest state. */
export function useSaveShortcut(onSave: () => void) {
  const onShortcut = useEffectEvent(onSave);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        onShortcut();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** Warn before losing unsaved edits: closing or reloading the tab, and clicking an in-app link. */
export function useUnsavedGuard(dirty: boolean, message = "You have unsaved changes. Leave without saving?") {
  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers need returnValue set to show the prompt.
      event.returnValue = "";
    };

    // Capture phase on document: runs before Next's <Link> handler (React listens on the root).
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, message]);
}

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "default";
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

function ConfirmDialog({ title, body, confirmLabel = "Confirm", tone = "default", onClose }: ConfirmOptions & { onClose: (ok: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="admin-confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose(false);
      }}
      onClick={(event) => event.target === ref.current && onClose(false)}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] animate-rise-in rounded-panel border border-line-strong bg-surface p-0 text-ink shadow-panel [animation-duration:0.45s] backdrop:bg-bg/75 backdrop:backdrop-blur-sm"
    >
      <div className="p-6 sm:p-7">
        <h2 id="admin-confirm-title" className="font-display text-[1.25rem] font-medium tracking-[-0.02em]">
          {title}
        </h2>
        {body && <div className="mt-2.5 text-[0.9rem] leading-relaxed text-muted">{body}</div>}
        <div className="mt-7 flex flex-wrap justify-end gap-2">
          <Btn onClick={() => onClose(false)} autoFocus>
            Cancel
          </Btn>
          <Btn variant={tone === "danger" ? "danger" : "primary"} onClick={() => onClose(true)}>
            {confirmLabel}
          </Btn>
        </div>
      </div>
    </dialog>
  );
}

/** `const [confirm, dialog] = useConfirm()`: render `dialog`, then `await confirm({...})`. */
export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  );

  const dialog = pending ? (
    <ConfirmDialog
      {...pending}
      onClose={(ok) => {
        pending.resolve(ok);
        setPending(null);
      }}
    />
  ) : null;

  return [confirm, dialog] as const;
}
