import { ArrowLeft, Compass, PanelsTopLeft } from "lucide-react";
import { BtnLink } from "@/components/admin/ui";
import { getSession } from "@/lib/admin/auth";
import { adminHref, getAdminConfig } from "@/lib/admin/config";
import { can } from "@/lib/admin/roles";

/** A studio address that doesn't exist (an unknown screen, collection or page), shown inside the studio frame. */
export default async function StudioNotFound() {
  const config = getAdminConfig();
  const { base } = config;
  // Only offer the layout shortcut to roles that can open it.
  const session = await getSession(config);
  const canLayout = session ? can(session.user.role, "layout") : false;
  return (
    <div className="mx-auto grid max-w-xl animate-rise-in place-items-center py-24 text-center">
      <span className="grid size-12 place-items-center rounded-2xl border border-line bg-white/[0.03] text-em shadow-glow">
        <Compass className="size-5" aria-hidden="true" />
      </span>
      <p className="label-mono mt-6 text-[0.64rem] text-faint">404</p>
      <h1 className="mt-3 font-display text-[2rem] font-medium tracking-[-0.03em] text-ink">Nothing here</h1>
      <p className="mt-3 max-w-sm text-[0.95rem] leading-relaxed text-muted">
        This studio screen doesn&apos;t exist. It may have been renamed or deleted, or the address has a typo.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        <BtnLink href={adminHref(base)} variant="primary" icon={ArrowLeft}>
          Back to overview
        </BtnLink>
        {canLayout && (
          <BtnLink href={adminHref(base, "/homepage")} icon={PanelsTopLeft}>
            Homepage layout
          </BtnLink>
        )}
      </div>
    </div>
  );
}
