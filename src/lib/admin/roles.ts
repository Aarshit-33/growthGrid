/* ─────────────────────────────────────────────────────────────
   Studio roles: who can do what. Plain data with no imports, so
   the proxy, the server actions and the client screens all share
   it. The server actions enforce it; the screens only hide what a
   role can't use.
   ───────────────────────────────────────────────────────────── */

export const ROLES = ["owner", "editor", "writer"] as const;
export type AdminRole = (typeof ROLES)[number];

/**
 * content   create, edit, duplicate, show/hide and reorder items; edit page copy;
 *           upload images
 * delete    move items to Deleted items (nothing is ever destroyed); remove unused images
 * revoke    undo a change from History, restore deleted items
 * layout    the homepage's section order and switches
 * settings  site settings and branding
 * leads     read and manage contact-form enquiries (they hold personal data)
 */
export type Permission = "content" | "delete" | "revoke" | "layout" | "settings" | "leads";

const GRANTS: Record<AdminRole, readonly Permission[]> = {
  owner: ["content", "delete", "revoke", "layout", "settings", "leads"],
  editor: ["content", "delete", "revoke", "layout", "leads"],
  writer: ["content"],
};

export const ROLE_LABELS: Record<AdminRole, string> = { owner: "Owner", editor: "Editor", writer: "Writer" };

/** One line per role, for the env docs and the login screen's hints. */
export const ROLE_SUMMARIES: Record<AdminRole, string> = {
  owner: "Everything, including site settings and branding.",
  editor: "Everything except site settings and branding.",
  writer: "Creates and edits content and page copy, and uploads images. Can't delete, revoke, read enquiries, or change the homepage layout or settings.",
};

export const isRole = (value: string): value is AdminRole => (ROLES as readonly string[]).includes(value);

export function can(role: AdminRole, permission: Permission): boolean {
  return GRANTS[role].includes(permission);
}

const DENIED: Record<Permission, string> = {
  content: "edit content",
  delete: "delete items",
  revoke: "revoke changes or restore deleted items",
  layout: "change the homepage layout",
  settings: "change site settings or branding",
  leads: "read or manage enquiries",
};

/** Why an action was refused, in words the person can act on. */
export function deniedMessage(role: AdminRole, permission: Permission): string {
  const who = permission === "settings" ? "an owner" : "an owner or editor";
  return `Your role (${ROLE_LABELS[role]}) can't ${DENIED[permission]}. Ask ${who} to do it.`;
}
