"use client";

import { useSyncExternalStore } from "react";

/* ─────────────────────────────────────────────────────────────
   "5 minutes ago", kept fresh while the screen is open. The
   server and the hydration pass can't know the reader's clock or
   time zone, so they print the UTC time from the timestamp
   itself; both match, and the relative time takes over at once.
   ───────────────────────────────────────────────────────────── */

const TICK_MS = 30_000;

function subscribe(onTick: () => void) {
  const id = window.setInterval(onTick, TICK_MS);
  return () => window.clearInterval(id);
}

/** Changes once per tick, so React sees the same value in between. */
const currentTick = () => Math.floor(Date.now() / TICK_MS);
const serverTick = () => null;

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const dateOnly = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const full = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

/** "just now", "12 minutes ago", "yesterday", then a date. Never in the future (clock skew). */
export function relativeTime(at: number, now: number): string {
  const seconds = Math.min(0, Math.round((at - now) / 1000));
  const abs = -seconds;
  if (abs < 45) return "just now";
  if (abs < 3600) return relative.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), "hour");
  if (abs < 7 * 86_400) return relative.format(Math.round(seconds / 86_400), "day");
  return dateOnly.format(at);
}

export function TimeAgo({ at, className }: { at: string; className?: string }) {
  const tick = useSyncExternalStore(subscribe, currentTick, serverTick);
  const time = Date.parse(at);
  if (Number.isNaN(time)) return null;
  return (
    <time dateTime={at} title={tick === null ? undefined : full.format(time)} className={className}>
      {tick === null ? `${at.slice(0, 16).replace("T", " ")} UTC` : relativeTime(time, tick * TICK_MS)}
    </time>
  );
}

const never = () => () => {};
const onClient = () => true;
const onServer = () => false;

/** "5 Oct 2026, 14:05" in the reader's time zone; UTC until hydrated, for the same reason as TimeAgo. */
export function LocalTime({ at, className }: { at: string; className?: string }) {
  const hydrated = useSyncExternalStore(never, onClient, onServer);
  const time = Date.parse(at);
  if (Number.isNaN(time)) return null;
  return (
    <time dateTime={at} className={className}>
      {hydrated ? full.format(time) : `${at.slice(0, 16).replace("T", " ")} UTC`}
    </time>
  );
}
