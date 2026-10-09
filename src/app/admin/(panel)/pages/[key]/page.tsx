import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, PanelsTopLeft, type LucideIcon } from "lucide-react";
import { DocEditor } from "@/components/admin/doc-editor";
import type { Raw } from "@/components/admin/form/schema-utils";
import { AFTERCARE_ICON } from "@/components/admin/icons";
import { requireSession } from "@/lib/admin/auth";
import { adminHref } from "@/lib/admin/config";
import { pageForm } from "@/lib/admin/form-schema";
import { editorHistory } from "@/lib/admin/history";
import { AFTERCARE_META, PAGE_META } from "@/lib/admin/meta";
import { can } from "@/lib/admin/roles";
import { fileLabel, PAGE_KEYS, pageVersion, readSnapshot } from "@/lib/admin/store";
import type { PageKey } from "@/lib/schemas";

type Props = { params: Promise<{ key: string }> };

const isPageKey = (key: string): key is PageKey => (PAGE_KEYS as string[]).includes(key);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { key } = await params;
  return { title: isPageKey(key) ? `Page: ${PAGE_META[key].label}` : "Not found" };
}

export default async function PageCopyPage({ params }: Props) {
  const { config, user } = await requireSession();
  const { key } = await params;
  if (!isPageKey(key)) notFound();

  const [snapshot, history] = await Promise.all([readSnapshot(), editorHistory({ kind: "page", key }, config.base)]);
  const data = snapshot.pages[key] as Raw;
  const meta = PAGE_META[key];
  const canLayout = can(user.role, "layout");

  return (
    <DocEditor
      // A fresh editor per page: nothing carries over when switching pages.
      key={key}
      base={config.base}
      target={{ kind: "page", key }}
      title={meta.label}
      eyebrow="Page"
      file={`content/${fileLabel({ kind: "page", key })}`}
      form={pageForm(snapshot, key)}
      initial={data}
      version={pageVersion(data)}
      publicHref={meta.href}
      allowed={{ delete: false, layout: canLayout }}
      history={history}
      intro={
        key === "home" && canLayout ? (
          <TipLink
            href={adminHref(config.base, "/homepage")}
            icon={PanelsTopLeft}
            title="Section order and on/off switches"
            text="This page edits the words. Arrange the sections in Homepage layout."
          />
        ) : key === AFTERCARE_META.page ? (
          <TipLink
            href={adminHref(config.base, AFTERCARE_META.path)}
            icon={AFTERCARE_ICON}
            title="Bug-fix warranty, handover and care plans"
            text={`The after-launch offer has a screen of its own: ${AFTERCARE_META.label}.`}
          />
        ) : undefined
      }
    />
  );
}

/** A card above the form that leads to a related screen. */
function TipLink({ href, icon: Icon, title, text }: { href: string; icon: LucideIcon; title: string; text: string }) {
  return (
    <Link href={href} className="card card-hover group/tip flex items-center gap-4 p-4 sm:px-5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-em/30 bg-em/[0.08] text-em">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.88rem] font-medium text-ink">{title}</span>
        <span className="block text-[0.8rem] text-muted">{text}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-faint transition-[color,transform] duration-300 group-hover/tip:translate-x-0.5 group-hover/tip:text-em" aria-hidden="true" />
    </Link>
  );
}
