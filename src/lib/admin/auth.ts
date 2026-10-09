import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { createRateLimiter } from "@/lib/leads/rate-limit";
import { adminHref, findUser, getAdminConfig, logAdminProblems, type AdminConfig, type AdminUser } from "./config";
import { SESSION_COOKIE, verifySessionToken, type AdminSession } from "./session";
import type { SessionUser } from "./types";

/* ─────────────────────────────────────────────────────────────
   Server-side admin guards. Every admin page and every server
   action calls one of these itself: the proxy's redirect is only
   a first, optimistic gate.
   ───────────────────────────────────────────────────────────── */

/** The admin config, or a 404 when the admin is switched off (missing or invalid env). */
export function requireAdminConfig(): AdminConfig {
  const config = getAdminConfig();
  logAdminProblems(config);
  if (!config.enabled) notFound();
  return config;
}

export async function getSession(config: AdminConfig = getAdminConfig()): Promise<AdminSession | null> {
  if (!config.enabled) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(token, config);
}

/**
 * For admin layouts and the login screen: the config (or a 404), always decided
 * per request. Never at build time: a build without the env would otherwise
 * bake the admin in as a permanent 404.
 */
export async function requireAdmin(): Promise<AdminConfig> {
  await connection();
  return requireAdminConfig();
}

/** What the screens may know about a user: never the password. */
export const publicUser = ({ name, email, role }: AdminUser): SessionUser => ({ name, email, role });

export interface SignedIn {
  config: AdminConfig;
  session: AdminSession;
  user: SessionUser;
}

/** For admin pages and actions: who's signed in, or a redirect to the login screen. */
export async function requireSession(): Promise<SignedIn> {
  const config = await requireAdmin();
  const session = await getSession(config);
  if (!session) redirect(adminHref(config.base, "/login"));
  return { config, session, user: publicUser(session.user) };
}

/** Constant-time password check (hashing first evens out the lengths). */
export function passwordMatches(input: string, password: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(password, "utf8").digest();
  return timingSafeEqual(a, b);
}

/** Compared against when the email is unknown, so that takes as long as a wrong password. */
const NOBODY = `nobody-${Math.random()}`;

/** True when the studio still runs on the single ADMIN_PASSWORD (no user blocks): the login asks for the password only. */
export const passwordOnly = (config: AdminConfig) => config.users.length === 1 && config.users[0].email === "";

/** Login: the user with this email and password, or null. */
export function checkCredentials(config: AdminConfig, email: string, password: string): AdminUser | null {
  const user = passwordOnly(config) ? config.users[0] : findUser(config.users, email);
  const matches = passwordMatches(password, user?.password ?? NOBODY);
  return user && matches ? user : null;
}

/** Failed logins: 5 per 15 minutes per client, then locked out until the window passes. */
export const loginLimiter = createRateLimiter("admin-login", { windowMs: 15 * 60 * 1000, limit: 5 });

/** Best-effort client identity for rate limiting. */
export async function clientKey(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "local";
}
