/* ─────────────────────────────────────────────────────────────
   Types shared by the admin's server code and client components.
   Keep this file free of runtime imports.
   ───────────────────────────────────────────────────────────── */

import type { AdminRole } from "./roles";

export type Path = (string | number)[];

/** A problem with one field, from Zod: shown inline under the field. */
export interface FieldIssue {
  path: Path;
  message: string;
}

/** Who's signed in, as the screens see it (never the password). */
export interface SessionUser {
  name: string;
  /** "" for the single-password account (ADMIN_PASSWORD). */
  email: string;
  role: AdminRole;
}

/* History: every change made in the Studio, append-only. */

export type HistoryAction =
  | "create"
  | "update"
  | "delete"
  | "duplicate"
  | "visibility"
  | "home"
  | "reorder"
  /** Undid an earlier change (restoring a deleted item is one too). */
  | "revoke";

/** What a change touched. */
export type HistoryTarget =
  | { kind: "settings" }
  | { kind: "page"; key: string }
  /** The homepage's section order and switches. */
  | { kind: "layout" }
  /** `previousId`: the item was renamed by this change. */
  | { kind: "item"; name: string; id: string; previousId?: string }
  /** A collection's order. */
  | { kind: "list"; name: string };

/** One recorded change, without its before/after copies (what lists show). */
export interface HistorySummary {
  id: string;
  /** ISO time. */
  at: string;
  /** Who made it, as they were then. */
  user: SessionUser;
  action: HistoryAction;
  target: HistoryTarget;
  /** "Insights › Design around what changes". */
  title: string;
  /** The content/… file it changed. */
  file: string;
  /** One line, e.g. "Changed Title and Summary". */
  summary: string;
  /** Paths of the fields that changed ("seo.title", "body[2].text"). */
  changes: string[];
  /** For a revoke: the change it undid. */
  revokes?: string;
  /** Worked out when reading: the later change that undid this one. */
  revokedBy?: { id: string; at: string; user: SessionUser };
}

/** A full entry: the summary plus the target as it was before and after (null: didn't exist). */
export interface HistoryEntry extends Omit<HistorySummary, "revokedBy"> {
  before: unknown;
  after: unknown;
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T; warnings: string[] }
  | {
      ok: false;
      /** Headline for the toast / banner. */
      error: string;
      /** Site-wide problems the change would cause (broken references, duplicate slugs…). */
      errors?: string[];
      /** Field-level problems. */
      issues?: FieldIssue[];
      /** The content changed since the editor loaded it. */
      conflict?: boolean;
      /** The session ended: log in again (in another tab) and retry. */
      auth?: boolean;
    };

/** The subset of JSON Schema that z.toJSONSchema emits and the form renderer understands. */
export interface JsonSchema {
  type?: "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  prefixItems?: JsonSchema[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  enum?: (string | number | boolean | null)[];
  const?: string | number | boolean | null;
  format?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minItems?: number;
  maxItems?: number;
  default?: unknown;
  description?: string;
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
}

/** A choice for a field that points at other content (a service slug, an author…). */
export interface RefOption {
  value: string;
  label: string;
  /** Grouping label, e.g. a technology's category. */
  group?: string;
  /** The target is hidden from the site. */
  hidden?: boolean;
}

/** Field name (dot path, `[]` for list items) → its choices. */
export type RefMap = Record<string, RefOption[]>;

/** Title and guidance of one panel of a schema form. */
export interface PanelCopy {
  label: string;
  description?: string;
}

/** Everything a schema-driven editor needs besides the value. */
export interface FormContext {
  schema: JsonSchema;
  refs: RefMap;
  /** Internal URLs, suggested in link fields. */
  links: string[];
  /** Top-level fields managed elsewhere in the admin (not rendered). */
  hidden: string[];
  /**
   * Edit only this top-level object, laid out like a document of its own: its
   * simple fields share a panel, each nested object or list gets one. The rest
   * of the document is kept as it is and saved with it.
   */
  focus?: string;
  /** Panel titles by path key ("aftercare.plans"; the focused object's own fields: its key). Default: the field name. */
  panels?: Record<string, PanelCopy>;
}

/** One row of a collection list: what the list shows, not the whole item. */
export interface ListRow {
  id: string;
  title: string;
  subtitle?: string;
  /** Visible on the site. */
  published: boolean;
  /** Picked for the homepage by the collection's rule (whether or not it's visible). */
  home: boolean;
  /** The homepage switch can't go off from the list (an FAQ whose only page is the homepage). */
  homeLocked?: boolean;
  /** Thumbnail (an image path), or the item's site icon and accent colour. */
  image?: string;
  icon?: string;
  accent?: string;
  /** Short labels after the subtitle (FAQ pages, an article's category…). */
  chips?: string[];
  /** Technologies inside a technology category. */
  children?: { id: string; title: string; published: boolean }[];
}

/** What one homepage section shows right now. */
export interface HomeSectionStatus {
  /** Items the section shows; null for copy-only sections. */
  count: number | null;
  /** The section has nothing to show, so the homepage skips it. */
  empty: boolean;
}

/** An image file in /public, as the image picker lists it. */
export interface PublicImage {
  /** Its path on the site, e.g. "/images/work/cover.jpg". */
  src: string;
  /** Folder inside /public ("images/work"); "" for files at the top. */
  folder: string;
  name: string;
  /** File size in bytes. */
  bytes: number;
  /** Last change (ms since epoch), so previews skip a stale cached copy after a file is replaced. */
  modified: number;
}

/** One place in the content that shows an image. */
export interface ImageUse {
  /** "Work › CareFlow", "Branding › Logo". */
  label: string;
  /** Its Studio screen, without the admin base ("/collections/projects/careflow"). */
  href: string;
}

/** An image on the Media screen: the file and where the content uses it. */
export interface MediaItem extends PublicImage {
  uses: ImageUse[];
  /** Under public/images, so the Studio may delete it (when unused). */
  deletable: boolean;
}

/* Leads: contact-form enquiries. */

export type LeadStatus = "new" | "contacted" | "qualified" | "won" | "lost" | "spam";

/** One enquiry as the Leads screen shows it. */
export interface LeadRow {
  id: string;
  name: string;
  email: string;
  company: string;
  services: string[];
  timeline: string;
  message: string;
  status: LeadStatus;
  /** The page it was sent from (path and query). */
  source?: string;
  /** Older enquiries asked for a budget. */
  budget?: string;
  /** ISO times. */
  createdAt: string;
  updatedAt?: string;
}
