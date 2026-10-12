"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/* ─────────────────────────────────────────────────────────────
   Local drafts: while an editor has unsaved changes, a copy goes
   to localStorage (debounced), so a closed tab, a crash or a lost
   session never loses work. The next time the editor opens it
   offers the copy back (see DraftBanner). Saving or discarding
   removes it; copies older than DRAFT_TTL_MS are dropped.

   Keys: `gg-admin-draft:<admin base>:<document>`, e.g.
   `gg-admin-draft:/studio:item:projects:acme`. Storage that is
   full, blocked or missing (private mode) is ignored silently:
   drafts are a safety net, never a requirement.
   ───────────────────────────────────────────────────────────── */

export const DRAFT_PREFIX = "gg-admin-draft:";
export const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEBOUNCE_MS = 500;
const FORMAT = 1;

export interface LocalDraft<T> {
  v: typeof FORMAT;
  /** The edited value, as it was in the form. */
  value: T;
  /** Version of the saved document the edits started from (null: a new item). */
  version: string | null;
  /** When the copy was taken (ISO). */
  at: string;
}

export function draftKey(base: string, doc: string) {
  return `${DRAFT_PREFIX}${base || "/"}:${doc}`;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // access itself can throw (blocked cookies / storage)
  }
}

function readRaw(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function parse<T>(raw: string | null): LocalDraft<T> | null {
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as Partial<LocalDraft<T>> | null;
    if (!draft || draft.v !== FORMAT || !("value" in draft) || typeof draft.at !== "string") return null;
    const at = Date.parse(draft.at);
    if (Number.isNaN(at) || Date.now() - at > DRAFT_TTL_MS) return null;
    return { v: FORMAT, value: draft.value as T, version: typeof draft.version === "string" ? draft.version : null, at: draft.at };
  } catch {
    return null;
  }
}

export function writeDraft<T>(key: string, value: T, version: string | null) {
  const draft: LocalDraft<T> = { v: FORMAT, value, version, at: new Date().toISOString() };
  try {
    storage()?.setItem(key, JSON.stringify(draft));
  } catch {
    // Quota exceeded or storage disabled: nothing to do.
  }
}

export function removeDraft(key: string) {
  try {
    storage()?.removeItem(key);
  } catch {
    // ignore
  }
}

let purged = false;

/** Drops expired or unreadable drafts (once per page load). */
function purgeExpired() {
  if (purged) return;
  purged = true;
  const store = storage();
  if (!store) return;
  try {
    const stale: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key?.startsWith(DRAFT_PREFIX) && !parse(store.getItem(key))) stale.push(key);
    }
    stale.forEach((key) => store.removeItem(key));
  } catch {
    // ignore
  }
}

const noSubscribe = () => () => {};

/**
 * The draft found when the editor opened: read once on the client (null on the
 * server and during hydration, so markup matches), then frozen for the life of
 * the editor, so autosaves of new edits never replace what's being offered.
 */
function useDraftAtOpen<T>(key: string, enabled: boolean): LocalDraft<T> | null {
  const [cache] = useState(() => new Map<string, LocalDraft<T> | null>());
  const snapshot = useCallback(() => {
    if (!enabled) return null;
    if (!cache.has(key)) cache.set(key, parse<T>(readRaw(key)));
    return cache.get(key) ?? null;
  }, [cache, key, enabled]);
  return useSyncExternalStore(noSubscribe, snapshot, () => null);
}

export interface UseLocalDraftOptions<T> {
  /** From draftKey(). */
  key: string;
  /** What's in the editor now. */
  value: T;
  /** Unsaved changes: only then is a copy kept. */
  dirty: boolean;
  /** Version of the saved document the edits are based on. */
  version: string | null;
  /** Off: nothing is read or written (a missing document, say). */
  enabled?: boolean;
}

export interface UseLocalDraft<T> {
  /** A copy left from an earlier visit, until it's restored or dismissed. */
  pending: LocalDraft<T> | null;
  /** Hide the offer (after Restore, or Discard). */
  settle: () => void;
  /** Remove the stored copy now (saved or discarded) and cancel a pending write. */
  clear: () => void;
}

export function useLocalDraft<T>({ key, value, dirty, version, enabled = true }: UseLocalDraftOptions<T>): UseLocalDraft<T> {
  const atOpen = useDraftAtOpen<T>(key, enabled);
  const [settled, setSettled] = useState(false);
  const timer = useRef<number | null>(null);
  const latest = useRef({ key, value, version, dirty, enabled });
  /** A copy written in this visit, still in storage. */
  const wrote = useRef(false);

  useEffect(() => {
    latest.current = { key, value, version, dirty, enabled };
  });

  useEffect(() => {
    if (enabled) purgeExpired();
  }, [enabled]);

  const cancel = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  // While dirty: write a copy shortly after the last edit.
  useEffect(() => {
    if (!enabled) return;
    if (!dirty) {
      // Back to the saved value by hand: the copy written earlier is stale.
      if (wrote.current) {
        removeDraft(key);
        wrote.current = false;
      }
      return;
    }
    cancel();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      writeDraft(key, value, version);
      wrote.current = true;
    }, DEBOUNCE_MS);
    return cancel;
  }, [key, value, version, dirty, enabled, cancel]);

  // Closing or hiding the tab inside the debounce window: write at once.
  useEffect(() => {
    const flush = () => {
      const { key, value, version, dirty, enabled } = latest.current;
      if (!enabled || !dirty || timer.current === null) return;
      cancel();
      writeDraft(key, value, version);
      wrote.current = true;
    };
    const onVisibility = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [cancel]);

  const clear = useCallback(() => {
    cancel();
    removeDraft(latest.current.key);
    wrote.current = false;
  }, [cancel]);

  const settle = useCallback(() => setSettled(true), []);

  return { pending: settled ? null : atOpen, settle, clear };
}
