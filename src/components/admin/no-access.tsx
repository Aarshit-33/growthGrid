import { ArrowLeft, LockKeyhole } from "lucide-react";
import { adminHref } from "@/lib/admin/config";
import { deniedMessage, ROLE_LABELS, type AdminRole, type Permission } from "@/lib/admin/roles";
import { BtnLink } from "./ui";

/** Shown in place of a screen the signed-in role can't use (the server actions refuse it too). */
export function NoAccess({ base, role, permission, screen }: { base: string; role: AdminRole; permission: Permission; screen: string }) {
  return (
    <div className="mx-auto grid max-w-xl animate-rise-in place-items-center py-24 text-center">
      <span className="grid size-12 place-items-center rounded-2xl border border-warn/30 bg-warn/[0.08] text-warn">
        <LockKeyhole className="size-5" aria-hidden="true" />
      </span>
      <p className="label-mono mt-6 text-[0.64rem] text-faint">Signed in as {ROLE_LABELS[role]}</p>
      <h1 className="mt-3 font-display text-[2rem] font-medium tracking-[-0.03em] text-ink">
        {screen} is for {permission === "settings" ? "owners" : "owners and editors"}
      </h1>
      <p className="mt-3 max-w-sm text-[0.95rem] leading-relaxed text-muted">{deniedMessage(role, permission)}</p>
      <BtnLink href={adminHref(base)} variant="primary" icon={ArrowLeft} className="mt-8">
        Back to overview
      </BtnLink>
    </div>
  );
}
