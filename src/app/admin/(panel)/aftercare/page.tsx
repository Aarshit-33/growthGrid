import type { Metadata } from "next";
import { PanelsTopLeft, PenLine } from "lucide-react";
import { DocEditor } from "@/components/admin/doc-editor";
import type { Raw } from "@/components/admin/form/schema-utils";
import { AFTERCARE_ICON } from "@/components/admin/icons";
import { BtnLink } from "@/components/admin/ui";
import { requireSession } from "@/lib/admin/auth";
import { adminHref } from "@/lib/admin/config";
import { aftercareForm } from "@/lib/admin/form-schema";
import { editorHistory } from "@/lib/admin/history";
import { AFTERCARE_META } from "@/lib/admin/meta";
import { can } from "@/lib/admin/roles";
import { fileLabel, pageVersion, readSnapshot } from "@/lib/admin/store";

export const metadata: Metadata = { title: AFTERCARE_META.label };

/**
 * After launch: the bug-fix warranty, handover list and care plans that follow
 * every project. Stored once in the services page (`aftercare`), so saving,
 * conflicts and History work exactly as they do for that page.
 */
export default async function AftercarePage() {
  const { config, user } = await requireSession();
  const target = { kind: "page", key: AFTERCARE_META.page } as const;
  const [snapshot, history] = await Promise.all([readSnapshot(), editorHistory(target, config.base)]);
  const data = snapshot.pages[target.key] as Raw;
  const canLayout = can(user.role, "layout");

  return (
    <DocEditor
      base={config.base}
      target={target}
      title={AFTERCARE_META.label}
      eyebrow="Homepage · Service pages"
      file={`content/${fileLabel(target)}`}
      form={aftercareForm(snapshot)}
      initial={data}
      version={pageVersion(data)}
      publicHref={AFTERCARE_META.href}
      allowed={{ delete: false, layout: canLayout }}
      history={history}
      intro={<AftercareIntro base={config.base} canLayout={canLayout} />}
    />
  );
}

/** Where the offer shows, and the related screens: the homepage section's own heading and its place on the page. */
function AftercareIntro({ base, canLayout }: { base: string; canLayout: boolean }) {
  const Icon = AFTERCARE_ICON;
  return (
    <div className="card animate-rise-in flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:px-5">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-em/30 bg-em/[0.08] text-em">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-[0.88rem] font-medium text-ink">One offer, shown in two places</span>
          <span className="block text-[0.8rem] leading-relaxed text-muted">
            The homepage&apos;s After launch section and the block on every service page both read this, so a save updates them together.
          </span>
        </span>
      </div>
      <div className="flex flex-wrap gap-2 sm:shrink-0">
        <BtnLink href={adminHref(base, "/pages/home#sec-aftercare")} size="sm" variant="ghost" icon={PenLine}>
          Homepage heading
        </BtnLink>
        {canLayout && (
          <BtnLink href={adminHref(base, "/homepage")} size="sm" variant="ghost" icon={PanelsTopLeft}>
            Section order
          </BtnLink>
        )}
      </div>
    </div>
  );
}
