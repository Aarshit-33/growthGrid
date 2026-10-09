import { isRole, ROLE_LABELS, ROLE_SUMMARIES, type AdminRole } from "@/lib/admin/roles";
import type { SessionUser } from "@/lib/admin/types";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────
   People in the Studio: initials avatars and role badges, tinted
   by role. No hooks, so the sidebar (client) and History (server)
   share them.
   ───────────────────────────────────────────────────────────── */

const ROLE_TONES: Record<AdminRole, string> = {
  owner: "border-em/35 bg-em/[0.1] text-hot",
  editor: "border-info/35 bg-info/[0.1] text-info",
  writer: "border-warn/35 bg-warn/[0.1] text-warn",
};

/** A role recorded in History may no longer exist: show it plainly. */
const toneOf = (role: string) => (isRole(role) ? ROLE_TONES[role] : "border-line-strong bg-white/[0.04] text-dim");

/** "Maya Chex" → "MC", "Studio" → "ST", "Sam (Writer)" → "SW": punctuation never becomes an initial. */
export function initials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  const first = (word: string | undefined) => (word ? Array.from(word)[0] : "");
  const letters = words.length > 1 ? first(words[0]) + first(words[words.length - 1]) : Array.from(words[0] ?? "?").slice(0, 2).join("");
  return letters.toUpperCase();
}

export function Avatar({
  user,
  size = "md",
  className,
}: {
  user: Pick<SessionUser, "name" | "role">;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 select-none place-items-center rounded-full border font-mono font-medium tracking-[0.02em]",
        size === "sm" ? "size-6 text-[0.56rem]" : "size-9 text-[0.7rem]",
        toneOf(user.role),
        className,
      )}
    >
      {initials(user.name)}
    </span>
  );
}

export function RoleBadge({ role, className }: { role: string; className?: string }) {
  if (!isRole(role)) return null;
  return (
    <span
      title={ROLE_SUMMARIES[role]}
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full border px-2 font-mono text-[0.56rem] font-medium uppercase tracking-[0.14em]",
        ROLE_TONES[role],
        className,
      )}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}
