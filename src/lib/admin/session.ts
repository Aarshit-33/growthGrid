/* ─────────────────────────────────────────────────────────────
   Admin session tokens: a small signed cookie, no database.

   token = base64url(payload) "." base64url(HMAC-SHA256(payload))
   payload = { v: 2, u: email, iat, exp, n: nonce }

   The HMAC key is derived from ADMIN_SESSION_SECRET *and* the
   signed-in person's email and password. Changing the secret signs
   everyone out; changing one password signs out only that person;
   removing someone from the env ends their session at once (the
   token's user must still exist). Web Crypto only, so the proxy
   and server code share it.
   ───────────────────────────────────────────────────────────── */

import type { AdminUser } from "./config";

export const SESSION_COOKIE = "gg_admin";
/** A login lasts 12 hours. */
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

export interface AdminSession {
  /** Who's signed in, as configured right now (so a role change applies at once). */
  user: AdminUser;
  /** Issued / expires at (unix seconds). */
  iat: number;
  exp: number;
}

interface KeyMaterial {
  secret: string;
  users: AdminUser[];
}

const encoder = new TextEncoder();

function toBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function signingKey(secret: string, user: AdminUser): Promise<CryptoKey> {
  const material = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`gg-admin\u0000v2\u0000${secret}\u0000${user.email}\u0000${user.password}`),
  );
  return crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createSessionToken(secret: string, user: AdminUser, now = Date.now()): Promise<string> {
  const iat = Math.floor(now / 1000);
  const payload = {
    v: 2,
    u: user.email,
    iat,
    exp: iat + SESSION_TTL_SECONDS,
    n: toBase64url(crypto.getRandomValues(new Uint8Array(12))),
  };
  const body = toBase64url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await signingKey(secret, user), encoder.encode(body));
  return `${body}.${toBase64url(new Uint8Array(signature))}`;
}

/** The session in a token, or null if it's missing, forged, malformed, expired, or its user is gone. */
export async function verifySessionToken(
  token: string | undefined,
  { secret, users }: KeyMaterial,
  now = Date.now(),
): Promise<AdminSession | null> {
  if (!token || token.length > 1024) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [body, signature] = parts;
  try {
    // Read who the token claims to be, then check its signature with that person's key.
    const payload: unknown = JSON.parse(new TextDecoder().decode(fromBase64url(body)));
    if (!payload || typeof payload !== "object") return null;
    const { v, u, iat, exp } = payload as Record<string, unknown>;
    if (v !== 2 || typeof u !== "string" || typeof iat !== "number" || typeof exp !== "number") return null;
    const user = users.find((candidate) => candidate.email === u);
    if (!user) return null;
    // crypto.subtle.verify compares in constant time.
    const valid = await crypto.subtle.verify("HMAC", await signingKey(secret, user), fromBase64url(signature), encoder.encode(body));
    if (!valid || exp * 1000 <= now) return null;
    return { user, iat, exp };
  } catch {
    return null;
  }
}

/** Cookie attributes: httpOnly, strict same-site, scoped to the admin's address. */
export function sessionCookieOptions(base: string) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: base,
    maxAge: SESSION_TTL_SECONDS,
  };
}
