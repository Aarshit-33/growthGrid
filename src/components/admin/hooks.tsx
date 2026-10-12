"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Btn } from "./ui";

/* ─────────────────────────────────────────────────────────────
   Editor helpers: the save shortcut and a promise-based confirm
   dialog (`if (await confirm({...})) …`). Asking before leaving
   with unsaved changes lives in leave-guard.tsx.
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
