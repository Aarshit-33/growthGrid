"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { resolveHomeSections } from "@/lib/content/home-sections";
import { collectionNames, collectionRegistry, type CollectionName } from "@/lib/content/registry";
import { homeSectionIdSchema, pageSchemas, settingsSchema, type HomeSectionConfig, type PageKey } from "@/lib/schemas";
import { leadStatusSchema } from "@/lib/schemas/lead";
import { checkCredentials, clientKey, getSession, loginLimiter, passwordOnly, publicUser, requireAdminConfig } from "./auth";
import { adminHref, getAdminConfig, safeNextPath } from "./config";
import { sameValue } from "./diff";
import { getHistoryEntry } from "./history";
import { deleteLead, leadsCsv, listLeads, setLeadStatus } from "./leads";
import { isCollectionName, itemTitle } from "./lists";
import { deletePublicImage, listMedia, listPublicImages, saveUpload, UPLOAD_FOLDER } from "./media";
import { COLLECTION_META, HOME_SECTION_META, PAGE_META } from "./meta";
import { can, deniedMessage, type Permission } from "./roles";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "./session";
import { AdminError, itemVersion, layoutVersion, PAGE_KEYS, pageVersion, readSnapshot, updateDoc, versionOf } from "./store";
import { exportContent, runSync, type SyncReport } from "./sync";
import type { ActionResult, FieldIssue, HistoryEntry, HistoryTarget, LeadRow, MediaItem, Path, PublicImage, SessionUser } from "./types";

/* ─────────────────────────────────────────────────────────────
   Admin server actions. Each one checks the session and the
   person's role itself (the proxy is only a first gate),
   validates its input, and answers with an ActionResult the
   editors can display. Every change goes through updateDoc,
   which records it in History with who made it.
   ───────────────────────────────────────────────────────────── */

type Raw = Record<string, unknown>;

/* ── Login / logout ───────────────────────────────────────── */

export interface LoginState {
  error?: string;
  /** What was typed, so a failed attempt doesn't clear the email field. */
  email?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const inMinutes = (seconds: number) => {
  const m = Math.ceil(seconds / 60);
  return m <= 1 ? "a minute" : `${m} minutes`;
};

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const config = requireAdminConfig();
  const client = await clientKey();
  const typed = formData.get("email");
  const email = typeof typed === "string" ? typed.trim().slice(0, 320) : "";

  const gate = loginLimiter.check(client);
  if (!gate.ok) return { error: `Too many attempts. Try again in ${inMinutes(gate.retryAfter)}.`, email };

  const password = formData.get("password");
  const user =
    typeof password === "string" && password.length > 0 && password.length <= 512
      ? checkCredentials(config, email, password)
      : null;

  if (!user) {
    loginLimiter.hit(client);
    await sleep(400 + Math.floor(Math.random() * 400)); // slows down guessing
    const left = loginLimiter.check(client);
    const wrong = passwordOnly(config) ? "That password isn't right." : "That email and password don't match.";
    return {
      error: left.ok
        ? `${wrong} ${left.remaining} ${left.remaining === 1 ? "try" : "tries"} left.`
        : `Too many attempts. Try again in ${inMinutes(left.retryAfter)}.`,
      email,
    };
  }

  loginLimiter.reset(client);
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(config.secret, user), sessionCookieOptions(config.base));
  redirect(adminHref(config.base, safeNextPath(formData.get("next"))));
}

export async function logoutAction(): Promise<void> {
  const config = getAdminConfig();
  (await cookies()).set(SESSION_COOKIE, "", { ...sessionCookieOptions(config.base), maxAge: 0 });
  redirect(adminHref(config.base, "/login"));
}

/* ── Shared plumbing ──────────────────────────────────────── */

const SESSION_ENDED = {
  ok: false,
  error: "Your session has ended. Log in again in another tab, then retry. Your edits are still here.",
  auth: true,
} as const;

const BAD_INPUT = { ok: false, error: "That request didn't look right. Reload the page and try again." } as const;

type Refusal = { ok: false; error: string; auth?: true };

/** Who's asking, when they're signed in and their role allows `permission`; otherwise the refusal to send back. */
async function authorize(permission: Permission): Promise<SessionUser | Refusal> {
  const config = getAdminConfig();
  const session = config.enabled ? await getSession(config) : null;
  if (!session) return SESSION_ENDED;
  const user = publicUser(session.user);
  return can(user.role, permission) ? user : { ok: false, error: deniedMessage(user.role, permission) };
}

const refused = (value: SessionUser | Refusal): value is Refusal => "ok" in value;

const collectionNameSchema = z.enum(collectionNames as [CollectionName, ...CollectionName[]]);
const pageKeySchema = z.enum(PAGE_KEYS as [PageKey, ...PageKey[]]);

/** Fields that identify an item: new flags go right after them. */
const ID_FIELDS = ["slug", "key", "id", "order"];

const isRecord = (value: unknown): value is Raw => !!value && typeof value === "object" && !Array.isArray(value);

/** Copy of `obj` with `field` set. A new field goes after the last `after` key present (else at the end). */
function withKey(obj: Raw, field: string, value: unknown, after: string[]): Raw {
  if (field in obj) return { ...obj, [field]: value };
  const entries = Object.entries(obj);
  let at = entries.length;
  entries.forEach(([key], i) => {
    if (after.includes(key)) at = i + 1;
  });
  entries.splice(at, 0, [field, value]);
  return Object.fromEntries(entries);
}

function withoutKey(obj: Raw, field: string): Raw {
  const rest = { ...obj };
  delete rest[field];
  return rest;
}

/** Optional on/off flags where missing means on: "on" removes the key, keeping files minimal. */
const withFlag = (obj: Raw, field: string, on: boolean, after: string[]) =>
  on ? withoutKey(obj, field) : withKey(obj, field, false, after);

const nextOrder = (items: Raw[]) =>
  items.reduce((max, item) => Math.max(max, typeof item.order === "number" ? item.order : 0), 0) + 1;

function friendly(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case "invalid_type":
      return /received (undefined|null)/.test(issue.message) ? "Required" : `Expected ${issue.expected}`;
    case "too_small":
      if (issue.origin === "string") return Number(issue.minimum) <= 1 ? "Required" : `At least ${issue.minimum} characters`;
      if (issue.origin === "array") return `Add at least ${issue.minimum}`;
      return `Must be ${issue.inclusive ? "at least" : "more than"} ${issue.minimum}`;
    case "too_big":
      if (issue.origin === "string") return `At most ${issue.maximum} characters`;
      if (issue.origin === "array") return `At most ${issue.maximum} items`;
      return `Must be ${issue.inclusive ? "at most" : "less than"} ${issue.maximum}`;
    case "invalid_format":
      if (issue.format === "email") return "Enter a valid email address";
      if (issue.format === "url") return "Enter a full URL, e.g. https://example.com";
      if (issue.format === "date") return "Use a date like 2026-09-25";
      if (issue.format === "regex" && "pattern" in issue && typeof issue.pattern === "string") {
        if (issue.pattern.includes("[a-z0-9]+(?:-")) return "Use lowercase letters, numbers and dashes, e.g. my-item";
        if (issue.pattern.includes("[0-9a-fA-F]{6}")) return "Use a hex colour like #3ce49a";
      }
      return issue.message;
    case "invalid_value":
      return "Choose one of the options";
    default:
      return issue.message;
  }
}

function issuesOf(error: z.ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map((part) => (typeof part === "symbol" ? String(part) : part)) as Path,
    message: friendly(issue),
  }));
}

function invalid(issues: FieldIssue[]): never {
  throw new AdminError(issues.length === 1 ? "One field needs attention." : `${issues.length} fields need attention.`, {
    issues,
  });
}

const changedElsewhere = (what: string) =>
  new AdminError(`${what} changed since you opened it (in another tab, or in the files).`, { conflict: true });

const gone = (singular: string) =>
  new AdminError(`This ${singular} no longer exists. It may have been renamed or deleted elsewhere.`, { conflict: true });

async function run<T>(task: () => Promise<{ data: T; warnings: string[] }>): Promise<ActionResult<T>> {
  try {
    const { data, warnings } = await task();
    // Refresh every page (public and admin) that read the old content.
    revalidatePath("/", "layout");
    return { ok: true, data, warnings };
  } catch (error) {
    if (error instanceof AdminError) return { ok: false, error: error.message, ...error.details };
    console.error("[admin] Save failed:", error);
    return { ok: false, error: `Something went wrong: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/* ── What History says about a change ─────────────────────── */

/** An item in a list, as History shows a list's order. */
type Ref = { id: string; title: string };

const itemLabel = (name: CollectionName, item: Raw | undefined) =>
  `${COLLECTION_META[name].label} › ${item ? itemTitle(name, item) : "Untitled"}`;

/** The item a change touched, noting its old slug when the change renamed it. */
function itemTarget(name: CollectionName, item: Raw, previous?: Raw): HistoryTarget {
  const { key } = collectionRegistry[name];
  const id = String(item[key]);
  const previousId = previous === undefined ? undefined : String(previous[key]);
  return previousId !== undefined && previousId !== id ? { kind: "item", name, id, previousId } : { kind: "item", name, id };
}

/** A collection in the order the site shows it. */
function displayOrder(name: CollectionName, items: Raw[]): Raw[] {
  if (COLLECTION_META[name].sort !== "order") return items;
  const rank = (item: Raw) => (typeof item.order === "number" ? item.order : Infinity);
  return [...items].sort((a, b) => rank(a) - rank(b));
}

const refsOf = (name: CollectionName, items: Raw[]): Ref[] =>
  displayOrder(name, items).map((item) => ({ id: String(item[collectionRegistry[name].key]), title: itemTitle(name, item) }));

/** "Moved “X” from #3 to #1" when one item moved (a drag), else a general line. */
function describeMove(before: Ref[], after: Ref[]): string {
  const others = (list: Ref[], id: string) =>
    list
      .filter((ref) => ref.id !== id)
      .map((ref) => ref.id)
      .join("\n");
  for (let to = 0; to < after.length; to++) {
    const ref = after[to];
    const from = before.findIndex((other) => other.id === ref.id);
    if (from !== -1 && from !== to && others(before, ref.id) === others(after, ref.id)) {
      return `Moved “${ref.title}” from #${from + 1} to #${to + 1}`;
    }
  }
  return "Changed the order";
}

/** The homepage's sections, in order, from the home page document. */
const sectionsOf = (doc: unknown) => resolveHomeSections(isRecord(doc) ? (doc.sections as HomeSectionConfig[] | undefined) : undefined);

function describeLayout(before: HomeSectionConfig[], after: HomeSectionConfig[]): string {
  const was = new Map(before.map((section) => [section.id, section.enabled]));
  const parts = after
    .filter((section) => was.has(section.id) && was.get(section.id) !== section.enabled)
    .map((section) => `${section.enabled ? "Showed" : "Hid"} ${HOME_SECTION_META[section.id].label}`);
  if (before.map((section) => section.id).join() !== after.map((section) => section.id).join()) parts.push("Changed the section order");
  return parts.join(" · ") || "Updated the layout";
}

/* ── Settings & pages ─────────────────────────────────────── */

const docInput = z.object({ data: z.unknown(), version: z.string(), force: z.boolean().optional() });

export async function saveSettingsAction(raw: unknown): Promise<ActionResult<{ version: string }>> {
  const user = await authorize("settings");
  if (refused(user)) return user;
  const input = docInput.safeParse(raw);
  if (!input.success) return BAD_INPUT;
  const { data, version, force } = input.data;

  return run(async () => {
    const parsed = settingsSchema.safeParse(data);
    if (!parsed.success) invalid(issuesOf(parsed.error));
    const { value, warnings } = await updateDoc<unknown>(
      { kind: "settings" },
      (current) => {
        if (!force && versionOf(current) !== version) throw changedElsewhere("The settings");
        return data;
      },
      { user, record: (before, after) => ({ action: "update", target: { kind: "settings" }, title: "Site settings", before, after }) },
    );
    return { data: { version: versionOf(value) }, warnings };
  });
}

export async function savePageAction(raw: unknown): Promise<ActionResult<{ version: string }>> {
  const user = await authorize("content");
  if (refused(user)) return user;
  const input = docInput.extend({ key: pageKeySchema }).safeParse(raw);
  if (!input.success || !isRecord(input.data.data)) return BAD_INPUT;
  const { key, version, force } = input.data;
  const data = input.data.data as Raw;

  return run(async () => {
    const { value, warnings } = await updateDoc<Raw>(
      { kind: "page", key },
      (current) => {
        if (!force && pageVersion(current) !== version) throw changedElsewhere("This page");
        // The Homepage screen owns the section layout: keep what's on disk.
        let next: Raw = { ...data, key };
        next = isRecord(current) && "sections" in current
          ? withKey(next, "sections", current.sections, ["key", "seo"])
          : withoutKey(next, "sections");
        const parsed = pageSchemas[key].safeParse(next);
        if (!parsed.success) invalid(issuesOf(parsed.error));
        return next;
      },
      {
        user,
        // The copy only: layout changes are recorded by the Homepage screen.
        record: (before, after) => ({
          action: "update",
          target: { kind: "page", key },
          title: `Page › ${PAGE_META[key].label}`,
          before: withoutKey(before, "sections"),
          after: withoutKey(after, "sections"),
        }),
      },
    );
    return { data: { version: pageVersion(value) }, warnings };
  });
}

/* ── Collection items ─────────────────────────────────────── */

const itemInput = z.object({
  name: collectionNameSchema,
  /** null: a new item. */
  id: z.string().nullable(),
  data: z.record(z.string(), z.unknown()),
  version: z.string().nullable(),
  force: z.boolean().optional(),
});

export async function saveItemAction(raw: unknown): Promise<ActionResult<{ id: string; version: string }>> {
  const user = await authorize("content");
  if (refused(user)) return user;
  const input = itemInput.safeParse(raw);
  if (!input.success) return BAD_INPUT;
  const { name, id, data, version, force } = input.data;
  const { schema, key } = collectionRegistry[name];
  const meta = COLLECTION_META[name];

  return run(async () => {
    let saved: Raw = data;
    let previous: Raw | undefined;
    const { warnings } = await updateDoc<Raw[]>(
      { kind: "collection", name },
      (items) => {
        const index = id === null ? -1 : items.findIndex((item) => item[key] === id);
        if (id !== null && index === -1) throw gone(meta.singular);
        const current = index >= 0 ? items[index] : undefined;
        if (current && !force && itemVersion(current) !== version) throw changedElsewhere(`This ${meta.singular}`);

        let next: Raw = { ...data };
        // Position is managed by the list: keep it, or put a new item last.
        if (meta.sort === "order") next = withKey(next, "order", current ? current.order : nextOrder(items), [key]);

        const newId = next[key];
        if (typeof newId === "string" && items.some((item, i) => i !== index && item[key] === newId)) {
          invalid([{ path: [key], message: `Another ${meta.singular} already uses “${newId}”` }]);
        }
        const parsed = schema.safeParse(next);
        if (!parsed.success) invalid(issuesOf(parsed.error));

        if (index >= 0) items[index] = next;
        else items.push(next);
        saved = next;
        previous = current;
        return items;
      },
      {
        user,
        record: () => ({
          action: previous ? "update" : "create",
          target: itemTarget(name, saved, previous),
          title: itemLabel(name, saved),
          ...(previous ? {} : { summary: saved.published === false ? "Created (hidden)" : "Created" }),
          before: previous ?? null,
          after: saved,
        }),
      },
    );
    return { data: { id: String(saved[key]), version: itemVersion(saved) }, warnings };
  });
}

const itemRef = z.object({ name: collectionNameSchema, id: z.string().min(1) });

/**
 * Soft delete: the item leaves the site's files, and its full copy stays in
 * History for good. Deleted items (on the History screen) can restore it.
 */
export async function deleteItemAction(raw: unknown): Promise<ActionResult<null>> {
  const user = await authorize("delete");
  if (refused(user)) return user;
  const input = itemRef.safeParse(raw);
  if (!input.success) return BAD_INPUT;
  const { name, id } = input.data;
  const { key } = collectionRegistry[name];
  const meta = COLLECTION_META[name];

  return run(async () => {
    try {
      let removed: Raw | undefined;
      const { warnings } = await updateDoc<Raw[]>(
        { kind: "collection", name },
        (items) => {
          const index = items.findIndex((item) => item[key] === id);
          if (index === -1) throw gone(meta.singular);
          [removed] = items.splice(index, 1);
          return items;
        },
        {
          user,
          record: () => ({
            action: "delete",
            target: { kind: "item", name, id },
            title: itemLabel(name, removed),
            summary: "Moved to Deleted items",
            before: removed ?? null,
            after: null,
          }),
        },
      );
      return { data: null, warnings };
    } catch (error) {
      if (error instanceof AdminError && error.details.errors) {
        throw new AdminError(`Other content still uses this ${meta.singular}. Remove those references first (or hide it instead).`, error.details);
      }
      throw error;
    }
  });
}

export async function duplicateItemAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await authorize("content");
  if (refused(user)) return user;
  const input = itemRef.safeParse(raw);
  if (!input.success || input.data.name === "technologies") return BAD_INPUT;
  const { name, id } = input.data;
  const { key } = collectionRegistry[name];
  const meta = COLLECTION_META[name];

  return run(async () => {
    let newId = id;
    let original: Raw = {};
    let created: Raw = {};
    const { warnings } = await updateDoc<Raw[]>(
      { kind: "collection", name },
      (items) => {
        const source = items.find((item) => item[key] === id);
        if (!source) throw gone(meta.singular);
        newId = `${id}-copy`;
        for (let n = 2; items.some((item) => item[key] === newId); n++) newId = `${id}-copy-${n}`;

        let copy: Raw = { ...structuredClone(source), [key]: newId };
        const title = meta.titleField;
        if (typeof copy[title] === "string") copy[title] = `${copy[title]} (copy)`;
        if (meta.sort === "order") copy.order = nextOrder(items);
        if (typeof copy.featured === "boolean") copy.featured = false;
        // Copies start hidden, so nothing half-edited reaches the site.
        copy = withFlag(copy, "published", false, ID_FIELDS);
        items.push(copy);
        original = source;
        created = copy;
        return items;
      },
      {
        user,
        record: () => ({
          action: "duplicate",
          target: { kind: "item", name, id: newId },
          title: itemLabel(name, created),
          summary: `Copy of “${itemTitle(name, original)}” (starts hidden)`,
          before: null,
          after: created,
        }),
      },
    );
    return { data: { id: newId }, warnings };
  });
}

/* ── Quick switches & ordering (list views) ───────────────── */

const visibilityInput = itemRef.extend({
  visible: z.boolean(),
  /** A technology inside a technology category. */
  child: z.string().min(1).optional(),
});

export async function setVisibilityAction(raw: unknown): Promise<ActionResult<null>> {
  const user = await authorize("content");
  if (refused(user)) return user;
  const input = visibilityInput.safeParse(raw);
  if (!input.success || (input.data.child && input.data.name !== "technologies")) return BAD_INPUT;
  const { name, id, visible, child } = input.data;
  const { key } = collectionRegistry[name];
  const meta = COLLECTION_META[name];

  return run(async () => {
    let before: Raw = {};
    let after: Raw = {};
    let childName = "";
    const { warnings } = await updateDoc<Raw[]>(
      { kind: "collection", name },
      (items) => {
        const index = items.findIndex((item) => item[key] === id);
        if (index === -1) throw gone(meta.singular);
        const item = items[index];
        before = item;
        if (!child) {
          items[index] = after = withFlag(item, "published", visible, ID_FIELDS);
          return items;
        }
        const techs = Array.isArray(item.technologies) ? [...(item.technologies as Raw[])] : [];
        const at = techs.findIndex((tech) => tech.slug === child);
        if (at === -1) throw gone("technology");
        childName = typeof techs[at].name === "string" ? techs[at].name : child;
        techs[at] = withFlag(techs[at], "published", visible, ["slug"]);
        items[index] = after = { ...item, technologies: techs };
        return items;
      },
      {
        user,
        record: () => ({
          action: "visibility",
          target: { kind: "item", name, id },
          title: itemLabel(name, after),
          summary: child
            ? `${visible ? "Showed" : "Hid"} “${childName}” ${visible ? "on" : "from"} the site`
            : visible
              ? "Shown on the site"
              : "Hidden from the site",
          before,
          after,
        }),
      },
    );
    return { data: null, warnings };
  });
}

export async function setHomeAction(raw: unknown): Promise<ActionResult<null>> {
  const user = await authorize("content");
  if (refused(user)) return user;
  const input = itemRef.extend({ value: z.boolean() }).safeParse(raw);
  if (!input.success) return BAD_INPUT;
  const { name, id, value } = input.data;
  const { key } = collectionRegistry[name];
  const meta = COLLECTION_META[name];
  if (meta.home === "always" || meta.home === "none") return BAD_INPUT;

  return run(async () => {
    let before: Raw = {};
    let after: Raw = {};
    const { warnings } = await updateDoc<Raw[]>(
      { kind: "collection", name },
      (items) => {
        const index = items.findIndex((item) => item[key] === id);
        if (index === -1) throw gone(meta.singular);
        const item = items[index];
        before = item;
        if (meta.home === "featured") {
          items[index] = { ...item, featured: value };
        } else if (meta.home === "flag") {
          items[index] = withFlag(item, "home", value, [...ID_FIELDS, "published"]);
        } else {
          const scopes = (Array.isArray(item.scopes) ? (item.scopes as string[]) : []).filter((s) => s !== "home");
          if (value) scopes.unshift("home");
          if (scopes.length === 0) {
            throw new AdminError("This question only appears on the homepage. Give it another page in its scopes, or hide it instead.");
          }
          items[index] = { ...item, scopes };
        }
        after = items[index];
        return items;
      },
      {
        user,
        record: () => ({
          action: "home",
          target: { kind: "item", name, id },
          title: itemLabel(name, after),
          summary:
            meta.home === "featured"
              ? value
                ? "Featured on the homepage"
                : "No longer featured on the homepage"
              : value
                ? "Added to the homepage"
                : "Removed from the homepage",
          before,
          after,
        }),
      },
    );
    return { data: null, warnings };
  });
}

export async function reorderAction(raw: unknown): Promise<ActionResult<null>> {
  const user = await authorize("content");
  if (refused(user)) return user;
  const input = z.object({ name: collectionNameSchema, ids: z.array(z.string()).max(2000) }).safeParse(raw);
  if (!input.success) return BAD_INPUT;
  const { name, ids } = input.data;
  const { key } = collectionRegistry[name];
  const meta = COLLECTION_META[name];
  if (meta.sort === "date") return BAD_INPUT;

  return run(async () => {
    const { warnings } = await updateDoc<Raw[]>(
      { kind: "collection", name },
      (items) => {
        const byId = new Map(items.map((item) => [String(item[key]), item]));
        const sameSet = ids.length === items.length && new Set(ids).size === ids.length && ids.every((i) => byId.has(i));
        if (!sameSet) throw new AdminError("The list changed in the meantime. Reload and try again.", { conflict: true });
        // The file follows the display order too, so it reads top to bottom like the site.
        return ids.map((itemId, i) => {
          const item = byId.get(itemId) as Raw;
          return meta.sort === "order" ? { ...item, order: i + 1 } : item;
        });
      },
      {
        user,
        record: (before, after) => {
          const was = refsOf(name, before);
          const now = refsOf(name, after);
          return { action: "reorder", target: { kind: "list", name }, title: meta.label, summary: describeMove(was, now), before: was, after: now };
        },
      },
    );
    return { data: null, warnings };
  });
}

/* ── Homepage layout ──────────────────────────────────────── */

const layoutInput = z.object({
  sections: z.array(z.object({ id: homeSectionIdSchema, enabled: z.boolean() })).max(50),
  version: z.string(),
  force: z.boolean().optional(),
});

export async function saveHomeLayoutAction(raw: unknown): Promise<ActionResult<{ version: string }>> {
  const user = await authorize("layout");
  if (refused(user)) return user;
  const input = layoutInput.safeParse(raw);
  if (!input.success) return BAD_INPUT;
  const { sections, version, force } = input.data;

  return run(async () => {
    const { value, warnings } = await updateDoc<Raw>(
      { kind: "page", key: "home" },
      (doc) => {
        if (!force && layoutVersion(doc) !== version) throw changedElsewhere("The homepage layout");
        return withKey(doc, "sections", resolveHomeSections(sections), ["key", "seo"]);
      },
      {
        user,
        record: (before, after) => {
          const was = sectionsOf(before);
          const now = sectionsOf(after);
          return { action: "update", target: { kind: "layout" }, title: "Homepage layout", summary: describeLayout(was, now), before: was, after: now };
        },
      },
    );
    return { data: { version: layoutVersion(value) }, warnings };
  });
}

/* ── History: revoke a change, restore a deleted item ─────── */

const revokeInput = z.object({ id: z.string().min(1).max(64), force: z.boolean().optional() });

/** What the new entry says about the change it undid. */
function revokeSummary(entry: HistoryEntry): string {
  if (entry.after === null) return entry.action === "delete" ? "Restored from Deleted items" : "Brought back";
  if (entry.before === null) return "Undid its creation (moved to Deleted items)";
  return `Undid “${entry.summary}” by ${entry.user.name}`;
}

const changedSince = (what: string) =>
  new AdminError(`${what} was changed again after this. Revoking puts back the previous version, which also undoes those later changes.`, {
    conflict: true,
  });

const cannotRevoke = (why: string) => new AdminError(`This change can't be revoked: ${why}.`);

type RevokeBase = { action: "revoke"; summary: string; revokes: string };

/** Puts an item back the way it was before `entry` (re-adding it, or taking it out again when `entry` created it). */
async function revokeItem(
  entry: HistoryEntry,
  target: Extract<HistoryTarget, { kind: "item" }>,
  user: SessionUser,
  force: boolean,
  base: RevokeBase,
) {
  if (!isCollectionName(target.name)) throw cannotRevoke("its collection no longer exists");
  const name = target.name;
  const { key } = collectionRegistry[name];
  const meta = COLLECTION_META[name];
  const was = isRecord(entry.before) ? entry.before : null;
  const became = isRecord(entry.after) ? entry.after : null;
  let previous: Raw | undefined;
  let next: Raw | undefined;

  try {
    return await updateDoc<Raw[]>(
      { kind: "collection", name },
      (items) => {
        const index = became ? items.findIndex((item) => item[key] === became[key]) : -1;
        const current = index >= 0 ? items[index] : undefined;
        if (became && !force) {
          if (!current) throw new AdminError(`This ${meta.singular} was renamed or deleted after this change.`, { conflict: true });
          if (itemVersion(current) !== itemVersion(became)) throw changedSince(`This ${meta.singular}`);
        }
        if (was && items.some((item, i) => i !== index && item[key] === was[key])) {
          throw new AdminError(`Another ${meta.singular} uses “${String(was[key])}” now. Rename or delete that one first, then try again.`);
        }

        if (!was) {
          // This change created it: revoking takes it out again (it moves to Deleted items).
          if (!current) throw gone(meta.singular);
          previous = current;
          items.splice(index, 1);
          return items;
        }
        let restored: Raw = structuredClone(was);
        // Its place stays as it is now (the list owns `order`); a returning item goes last.
        if (meta.sort === "order") restored = withKey(restored, "order", current ? current.order : nextOrder(items), [key]);
        if (current) items[index] = restored;
        else items.push(restored);
        previous = current;
        next = restored;
        return items;
      },
      {
        user,
        record: () => ({
          ...base,
          target: next ? itemTarget(name, next, previous) : { kind: "item", name, id: String(previous?.[key] ?? target.id) },
          title: itemLabel(name, next ?? previous),
          before: previous ?? null,
          after: next ?? null,
        }),
      },
    );
  } catch (error) {
    if (!was && error instanceof AdminError && error.details.errors) {
      throw new AdminError(`Other content uses this ${meta.singular} now, so it can't be taken out. Remove those references first (or hide it instead).`, error.details);
    }
    throw error;
  }
}

/** Applies the reverse of `entry`. */
function revoke(entry: HistoryEntry, user: SessionUser, force: boolean) {
  const target = entry.target;
  const base: RevokeBase = { action: "revoke", summary: revokeSummary(entry), revokes: entry.id };

  switch (target.kind) {
    case "item":
      return revokeItem(entry, target, user, force, base);

    case "settings":
      return updateDoc<unknown>(
        { kind: "settings" },
        (current) => {
          if (!force && !sameValue(current, entry.after)) throw changedSince("Site settings");
          return structuredClone(entry.before);
        },
        { user, record: (before, after) => ({ ...base, target, title: "Site settings", before, after }) },
      );

    case "page": {
      if (!(PAGE_KEYS as string[]).includes(target.key) || !isRecord(entry.before)) throw cannotRevoke("its page no longer exists");
      const key = target.key as PageKey;
      const copy = entry.before;
      return updateDoc<Raw>(
        { kind: "page", key },
        (doc) => {
          if (!force && pageVersion(doc) !== versionOf(entry.after)) throw changedSince("This page");
          const next: Raw = { ...structuredClone(copy), key };
          // The Homepage screen owns the section layout: keep what's on disk.
          return "sections" in doc ? withKey(next, "sections", doc.sections, ["key", "seo"]) : withoutKey(next, "sections");
        },
        {
          user,
          record: (before, after) => ({
            ...base,
            target,
            title: `Page › ${PAGE_META[key].label}`,
            before: withoutKey(before, "sections"),
            after: withoutKey(after, "sections"),
          }),
        },
      );
    }

    case "layout": {
      if (!Array.isArray(entry.before)) throw cannotRevoke("it has no earlier layout");
      const earlier = resolveHomeSections(entry.before as HomeSectionConfig[]);
      return updateDoc<Raw>(
        { kind: "page", key: "home" },
        (doc) => {
          if (!force && !sameValue(sectionsOf(doc), entry.after)) throw changedSince("The homepage layout");
          return withKey(doc, "sections", earlier, ["key", "seo"]);
        },
        { user, record: (before, after) => ({ ...base, target, title: "Homepage layout", before: sectionsOf(before), after: sectionsOf(after) }) },
      );
    }

    case "list": {
      if (!isCollectionName(target.name) || !Array.isArray(entry.before)) throw cannotRevoke("its collection no longer exists");
      const name = target.name;
      const { key } = collectionRegistry[name];
      const meta = COLLECTION_META[name];
      const wanted = (entry.before as Ref[]).map((ref) => ref.id);
      const rank = new Map(wanted.map((refId, i) => [refId, i]));
      const then = Array.isArray(entry.after) ? (entry.after as Ref[]).map((ref) => ref.id).join("\n") : "";
      return updateDoc<Raw[]>(
        { kind: "collection", name },
        (items) => {
          const now = refsOf(name, items)
            .map((ref) => ref.id)
            .join("\n");
          if (!force && now !== then) throw changedSince(`The order of ${meta.label}`);
          // Items added since keep their place after the others.
          const sorted = displayOrder(name, items)
            .map((item, i) => ({ item, rank: rank.get(String(item[key])) ?? wanted.length + i }))
            .sort((a, b) => a.rank - b.rank)
            .map(({ item }) => item);
          return sorted.map((item, i) => (meta.sort === "order" ? { ...item, order: i + 1 } : item));
        },
        { user, record: (before, after) => ({ ...base, target, title: meta.label, before: refsOf(name, before), after: refsOf(name, after) }) },
      );
    }
  }
}

/**
 * Revoke: puts back what a change replaced (an edit), removed (a delete:
 * this is how deleted items are restored) or added (a create: the item
 * moves to Deleted items). Recorded as a new change, so it can be revoked
 * too. `force` goes ahead even when the thing was changed again since.
 */
export async function revokeChangeAction(raw: unknown): Promise<ActionResult<{ entry: string | null }>> {
  const user = await authorize("revoke");
  if (refused(user)) return user;
  const input = revokeInput.safeParse(raw);
  if (!input.success) return BAD_INPUT;
  const { id, force = false } = input.data;

  const entry = await getHistoryEntry(id);
  if (!entry) return { ok: false, error: "That change isn't in the history." };
  const area: Permission = entry.target.kind === "settings" ? "settings" : entry.target.kind === "layout" ? "layout" : "content";
  if (!can(user.role, area)) return { ok: false, error: deniedMessage(user.role, area) };
  if (entry.revokedBy) return { ok: false, error: `This change was already revoked by ${entry.revokedBy.user.name}.` };

  return run(async () => {
    const { entry: written, warnings } = await revoke(entry, user, force);
    return { data: { entry: written?.id ?? null }, warnings };
  });
}

/* ── Images & enquiries ───────────────────────────────────── */

/**
 * For actions that change nothing in /content (image files, enquiries):
 * no public page shows them, so nothing is revalidated. The screens
 * update themselves from the result.
 */
async function runFiles<T>(failure: string, task: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await task(), warnings: [] };
  } catch (error) {
    if (error instanceof AdminError) return { ok: false, error: error.message, ...error.details };
    console.error(`[admin] ${failure}:`, error);
    return { ok: false, error: `${failure}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** Every image in /public, for the image picker. Changes nothing, so nothing to revalidate. */
export async function listImagesAction(): Promise<ActionResult<PublicImage[]>> {
  const user = await authorize("content");
  if (refused(user)) return user;
  try {
    return { ok: true, data: await listPublicImages(), warnings: [] };
  } catch (error) {
    console.error("[admin] Listing images failed:", error);
    return { ok: false, error: "Couldn't read the images in /public. Check the folder exists and is readable." };
  }
}

/** The Media screen: every image and where the content uses it. */
export async function listMediaAction(): Promise<ActionResult<MediaItem[]>> {
  const user = await authorize("content");
  if (refused(user)) return user;
  return runFiles("Couldn't read the images in /public", async () => listMedia(await readSnapshot()));
}

/**
 * Saves one uploaded image into /public. FormData: `file`, and optionally
 * `folder` (public/images or a folder inside it; default images/uploads).
 * Anyone who can edit content can upload: it changes no content by itself.
 */
export async function uploadImageAction(formData: FormData): Promise<ActionResult<PublicImage>> {
  const user = await authorize("content");
  if (refused(user)) return user;
  const file = formData.get("file");
  const folder = formData.get("folder");
  if (!(file instanceof File) || (folder !== null && typeof folder !== "string")) return BAD_INPUT;
  return runFiles("Upload failed", async () => {
    const image = await saveUpload(file, folder || UPLOAD_FOLDER);
    console.info(`[admin] ${user.name} uploaded ${image.src} (${image.bytes} bytes)`);
    return image;
  });
}

const imageInput = z.object({ src: z.string().min(2).max(500) });

/** Takes an unused image under public/images off the site (it's kept in .data/deleted-media). */
export async function deleteImageAction(raw: unknown): Promise<ActionResult<{ kept: string }>> {
  const user = await authorize("delete");
  if (refused(user)) return user;
  const input = imageInput.safeParse(raw);
  if (!input.success) return BAD_INPUT;
  return runFiles("Couldn't delete the image", async () => {
    const kept = await deletePublicImage(input.data.src, await readSnapshot());
    console.info(`[admin] ${user.name} deleted ${input.data.src} (kept at ${kept})`);
    return { kept };
  });
}

/** Every contact-form enquiry, newest first. */
export async function listLeadsAction(): Promise<ActionResult<LeadRow[]>> {
  const user = await authorize("leads");
  if (refused(user)) return user;
  return runFiles("Couldn't read the enquiries", listLeads);
}

const leadId = z.string().min(1).max(100);
const leadStatusInput = z.object({ id: leadId, status: leadStatusSchema });

export async function setLeadStatusAction(raw: unknown): Promise<ActionResult<LeadRow>> {
  const user = await authorize("leads");
  if (refused(user)) return user;
  const input = leadStatusInput.safeParse(raw);
  if (!input.success) return BAD_INPUT;
  return runFiles("Couldn't update the enquiry", () => setLeadStatus(input.data.id, input.data.status));
}

/** Deletes an enquiry for good (a privacy request): there's no undo. */
export async function deleteLeadAction(raw: unknown): Promise<ActionResult<null>> {
  const user = await authorize("leads");
  if (refused(user)) return user;
  const input = z.object({ id: leadId }).safeParse(raw);
  if (!input.success) return BAD_INPUT;
  return runFiles("Couldn't delete the enquiry", async () => {
    await deleteLead(input.data.id);
    console.info(`[admin] ${user.name} deleted enquiry ${input.data.id}`);
    return null;
  });
}

/** Every enquiry as a CSV file (the screen downloads it). */
export async function exportLeadsAction(): Promise<ActionResult<{ filename: string; csv: string }>> {
  const user = await authorize("leads");
  if (refused(user)) return user;
  return runFiles("Couldn't export the enquiries", async () => ({
    filename: `enquiries-${new Date().toISOString().slice(0, 10)}.csv`,
    csv: leadsCsv(await listLeads()),
  }));
}

/* ── Sync & backup (owner only) ───────────────────────────── */

/** Owners only: Sync can create content, and the backup holds all of it. */
async function authorizeOwner(): Promise<SessionUser | Refusal> {
  const user = await authorize("settings");
  if (refused(user)) return user;
  return user.role === "owner" ? user : { ok: false, error: "Only an owner can sync or back up the content." };
}

/**
 * Checks the content store, creates only what's missing (MongoDB) and
 * refreshes the whole site. Never overwrites or deletes stored content.
 */
export async function syncContentAction(): Promise<ActionResult<SyncReport>> {
  const user = await authorizeOwner();
  if (refused(user)) return user;
  return runFiles("Sync failed", async () => {
    const report = await runSync(user);
    // The live site shows the latest stored content, created or not.
    revalidatePath("/", "layout");
    if (report.created.length > 0) console.info(`[admin] ${user.name} synced: created ${report.created.join(", ")}`);
    return report;
  });
}

/** All content as one JSON file, in the shape of /content (the screen downloads it). */
export async function backupContentAction(): Promise<ActionResult<{ filename: string; json: string }>> {
  const user = await authorizeOwner();
  if (refused(user)) return user;
  return runFiles("Couldn't build the backup", async () => ({
    filename: `content-backup-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`,
    json: `${JSON.stringify(await exportContent(), null, 2)}\n`,
  }));
}
