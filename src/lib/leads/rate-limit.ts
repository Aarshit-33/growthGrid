import "server-only";

/* ─────────────────────────────────────────────────────────────
   In-memory sliding-window rate limiter for the contact endpoint
   (and the admin login). Per-process by design: fine for one Node
   instance and for dev.
   Swap for a shared store (Redis, Upstash…) when running several
   instances. Kept on globalThis so dev hot reloads don't reset it.
   ───────────────────────────────────────────────────────────── */

const MAX_KEYS = 10_000;

const globalStore = globalThis as typeof globalThis & { __ggRateLimits?: Map<string, Map<string, number[]>> };
const stores = (globalStore.__ggRateLimits ??= new Map<string, Map<string, number[]>>());

export type RateLimitResult = { ok: true; remaining: number } | { ok: false; retryAfter: number };

export interface RateLimiter {
  /** Is another attempt allowed? (doesn't count one) */
  check(key: string, now?: number): RateLimitResult;
  /** Count an attempt. */
  hit(key: string, now?: number): void;
  /** Check and count in one go: the classic "N per window" limiter. */
  consume(key: string, now?: number): RateLimitResult;
  /** Forget a key's attempts (e.g. after a successful login). */
  reset(key: string): void;
}

/** A named limiter allowing `limit` attempts per `windowMs` for each key. */
export function createRateLimiter(name: string, { windowMs, limit }: { windowMs: number; limit: number }): RateLimiter {
  let hits = stores.get(name);
  if (!hits) stores.set(name, (hits = new Map<string, number[]>()));
  const table = hits;

  const recentFor = (key: string, now: number) => (table.get(key) ?? []).filter((t) => now - t < windowMs);

  const check = (key: string, now = Date.now()): RateLimitResult => {
    const recent = recentFor(key, now);
    table.set(key, recent);
    if (recent.length >= limit) {
      return { ok: false, retryAfter: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
    }
    return { ok: true, remaining: limit - recent.length };
  };

  const hit = (key: string, now = Date.now()) => {
    const recent = recentFor(key, now);
    recent.push(now);
    table.set(key, recent);

    // Opportunistic sweep so the map can't grow without bound.
    if (table.size > MAX_KEYS) {
      for (const [k, times] of table) {
        if (times.every((t) => now - t >= windowMs)) table.delete(k);
      }
    }
  };

  return {
    check,
    hit,
    consume(key, now = Date.now()) {
      const result = check(key, now);
      if (!result.ok) return result;
      hit(key, now);
      return { ok: true, remaining: result.remaining - 1 };
    },
    reset(key) {
      table.delete(key);
    },
  };
}

/** Contact form: 5 submissions per 10 minutes per client. */
const contactLimiter = createRateLimiter("contact", { windowMs: 10 * 60 * 1000, limit: 5 });

export function rateLimit(key: string, now = Date.now()): RateLimitResult {
  return contactLimiter.consume(key, now);
}
