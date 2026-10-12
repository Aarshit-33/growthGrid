import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { BrandingEditor } from "@/components/admin/branding-editor";
import type { Raw } from "@/components/admin/form/schema-utils";
import { NoAccess } from "@/components/admin/no-access";
import { BtnLink } from "@/components/admin/ui";
import { requireSession } from "@/lib/admin/auth";
import { adminHref } from "@/lib/admin/config";
import { brandForm } from "@/lib/admin/form-schema";
import { editorHistory } from "@/lib/admin/history";
import { BRAND_META } from "@/lib/admin/meta";
import { can } from "@/lib/admin/roles";
import { docLocation, readSnapshot, versionOf } from "@/lib/admin/store";

export const metadata: Metadata = { title: BRAND_META.label };

/**
 * Branding: the logo, the favicon and app icon, and the browser colour.
 * Stored in the site settings (`brand`), so saving, conflicts and History
 * work exactly as on Site settings, and only owners can change it.
 */
export default async function BrandingPage() {
  const { config, user } = await requireSession();
  if (!can(user.role, "settings")) {
    return <NoAccess base={config.base} role={user.role} permission="settings" screen={BRAND_META.label} />;
  }
  const target = { kind: "settings" } as const;
  const [snapshot, history] = await Promise.all([readSnapshot(), editorHistory(target, config.base)]);

  return (
    <BrandingEditor
      base={config.base}
      target={target}
      title={BRAND_META.label}
      eyebrow="Site"
      file={docLocation(target)}
      form={brandForm(snapshot)}
      initial={snapshot.settings as Raw}
      version={versionOf(snapshot.settings)}
      publicHref="/"
      history={history}
      intro={<BrandingIntro base={config.base} />}
    />
  );
}

/** Where the brand shows, and where the name itself is edited. */
function BrandingIntro({ base }: { base: string }) {
  return (
    <div className="card animate-rise-in flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-[0.88rem] font-medium text-ink">One logo, everywhere it appears</p>
        <p className="mt-0.5 text-[0.8rem] leading-relaxed text-muted">
          The header, footer, page transition, social cards, search results and this studio all use what you set here. Upload a new file
          straight from the image picker (drag it in, or paste it).
        </p>
      </div>
      <BtnLink href={adminHref(base, "/settings")} size="sm" variant="ghost" icon={Settings} className="sm:shrink-0">
        Name &amp; wordmark
      </BtnLink>
    </div>
  );
}
