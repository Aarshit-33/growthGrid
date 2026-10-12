import { isRole, ROLES, type AdminRole } from "./roles";

/* ─────────────────────────────────────────────────────────────
   Admin configuration, read from the environment (.env.local).

   ADMIN_SESSION_SECRET  Required, 32+ characters. Signs the login
                         cookie. Changing it signs everyone out.
   ADMIN_PATH            Optional private address, e.g. "/studio-x8k2".
                         When set, the admin only answers there and
                         /admin itself is a plain 404.

   Users: one numbered block per person (1 to 20, gaps are fine):

   ADMIN_1_NAME          Shown in the Studio and in History.
   ADMIN_1_EMAIL         What they sign in with.
   ADMIN_1_PASSWORD      12+ characters. Changing it signs only
                         this person out.
   ADMIN_1_ROLE          owner | editor | writer (see roles.ts): what
                         they can do in the Studio, not a job title.

   A block with a problem is skipped (and the reason logged), so
   one typo can't lock everyone out. Without any block, the older
   single ADMIN_PASSWORD still works, as one owner account.
   Without a secret or any usable user the admin doesn't exist:
   its URLs 404.

   Also imported by src/proxy.ts, so keep it free of Node-only and
   server-only imports.
   ───────────────────────────────────────────────────────────── */

/** Where the admin routes live in src/app (the public address may differ). */
export const ADMIN_ROUTE = "/admin";
export const MIN_PASSWORD_LENGTH = 12;
export const MIN_SECRET_LENGTH = 32;
/** ADMIN_1_… to ADMIN_20_…. */
export const MAX_USERS = 20;

/** First URL segments the private admin path must not take over. */
export const RESERVED_SEGMENTS = new Set([
  "_next",
  "api",
  "about",
  "contact",
  "insights",
  "services",
  "work",
  "privacy",
  "terms",
  "cards",
  "opengraph-image",
  "sitemap.xml",
  "robots.txt",
  "manifest.webmanifest",
  // The file library's route folder (lib/files/config.ts): always a 404 by name.
  "files",
]);

export interface AdminUser {
  name: string;
  /** Lowercase. "" only for the single-password account (ADMIN_PASSWORD). */
  email: string;
  password: string;
  role: AdminRole;
}

export interface AdminConfig {
  /** False when the env is missing or invalid: every admin URL 404s. */
  enabled: boolean;
  /** Public address of the admin: ADMIN_PATH, or /admin. */
  base: string;
  secret: string;
  /** Everyone who can sign in. */
  users: AdminUser[];
  /** Why the admin is off (logged once on the server). */
  problem?: string;
  /** User blocks that were skipped, and why (logged on the server; shown on the login screen in development). */
  warnings: string[];
}

function resolveBase(raw: string | undefined): { base: string; problem?: string } {
  const value = raw?.trim().replace(/^\/+|\/+$/g, "").toLowerCase();
  if (!value) return { base: ADMIN_ROUTE };
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(value)) {
    return {
      base: ADMIN_ROUTE,
      problem: `ADMIN_PATH must be one URL segment of 3-64 letters, digits or dashes (got "${raw}")`,
    };
  }
  if (RESERVED_SEGMENTS.has(value)) {
    return { base: ADMIN_ROUTE, problem: `ADMIN_PATH "/${value}" would hide a public page` };
  }
  return { base: `/${value}` };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The ADMIN_<n>_… blocks. `defined`: at least one block exists, valid or not. */
function readUsers(): { users: AdminUser[]; warnings: string[]; defined: boolean } {
  const users: AdminUser[] = [];
  const warnings: string[] = [];
  let defined = false;
  for (let n = 1; n <= MAX_USERS; n++) {
    const raw = (field: string) => process.env[`ADMIN_${n}_${field}`] ?? "";
    const name = raw("NAME").trim();
    const email = raw("EMAIL").trim().toLowerCase();
    const password = raw("PASSWORD");
    const role = raw("ROLE").trim().toLowerCase();
    // A role on its own (as in .env.example) isn't a user yet.
    if (!name && !email && !password) continue;
    defined = true;
    const problem = !name
      ? "NAME is empty"
      : !EMAIL.test(email)
        ? "EMAIL isn't a valid email address"
        : password.length < MIN_PASSWORD_LENGTH
          ? `PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`
          : !isRole(role)
            ? role
              ? `ROLE "${raw("ROLE").trim()}" isn't one of ${ROLES.join(", ")} (ROLE sets what they can do in the Studio, not their job title)`
              : `ROLE is empty (use ${ROLES.join(", ")})`
            : users.some((user) => user.email === email)
              ? `${email} is already used by another user`
              : undefined;
    if (problem) warnings.push(`ADMIN_${n} (${name || email || "unnamed"}) can't sign in: ${problem}.`);
    else users.push({ name, email, password, role: role as AdminRole });
  }
  return { users, warnings, defined };
}

export function getAdminConfig(): AdminConfig {
  const secret = process.env.ADMIN_SESSION_SECRET ?? "";
  const { base, problem: pathProblem } = resolveBase(process.env.ADMIN_PATH);
  const listed = readUsers();
  const legacy = process.env.ADMIN_PASSWORD ?? "";

  let users = listed.users;
  let userProblem: string | undefined;
  if (listed.defined) {
    if (users.length === 0) userProblem = "none of the ADMIN_<n>_… users can sign in (see the warnings above)";
  } else if (legacy.length >= MIN_PASSWORD_LENGTH) {
    // No user blocks: the single studio password, as one owner account.
    users = [{ name: "Owner", email: "", password: legacy, role: "owner" }];
  } else {
    userProblem = legacy
      ? `ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`
      : "add a studio user (ADMIN_1_NAME, ADMIN_1_EMAIL, ADMIN_1_PASSWORD, ADMIN_1_ROLE)";
  }

  const problem =
    pathProblem ??
    (secret.length < MIN_SECRET_LENGTH ? `ADMIN_SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters` : userProblem);
  return { enabled: !problem, base, secret, users, problem, warnings: listed.warnings };
}

const logged = globalThis as typeof globalThis & { __ggAdminWarned?: string };

/**
 * Logs the env's problems to the server console, once (not on every request).
 * Called by the proxy too: with ADMIN_PATH set, a switched-off Studio is a 404
 * there, before any admin page could explain why.
 */
export function logAdminProblems(config: AdminConfig) {
  const off = config.problem ? [`Studio is off, so every admin URL is a 404: ${config.problem}. See .env.example.`] : [];
  const messages = [...config.warnings, ...off];
  const key = messages.join("\n");
  if (!key || logged.__ggAdminWarned === key) return;
  logged.__ggAdminWarned = key;
  for (const message of messages) console.warn(`[admin] ${message}`);
}

/** The user with this email (any case), if they can sign in. */
export function findUser(users: AdminUser[], email: string): AdminUser | undefined {
  const wanted = email.trim().toLowerCase();
  return users.find((user) => user.email === wanted);
}

/** Public URL of an admin screen, e.g. adminHref(base, "/collections/projects"). */
export function adminHref(base: string, path = "/") {
  return path === "/" || path === "" ? base : `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** A `?next=` value made safe: only relative admin paths, so a link can never send anyone off-site. */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || !/^\/[a-z0-9/_-]*$/i.test(value) || value.startsWith("//")) return "/";
  return value === "/login" ? "/" : value;
}
