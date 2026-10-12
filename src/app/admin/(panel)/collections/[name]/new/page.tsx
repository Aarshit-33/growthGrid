import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocEditor } from "@/components/admin/doc-editor";
import { blankValue, type Raw } from "@/components/admin/form/schema-utils";
import { requireSession } from "@/lib/admin/auth";
import { adminHref } from "@/lib/admin/config";
import { collectionForm } from "@/lib/admin/form-schema";
import { isCollectionName } from "@/lib/admin/lists";
import { COLLECTION_META } from "@/lib/admin/meta";
import { can } from "@/lib/admin/roles";
import { docLocation, readSnapshot } from "@/lib/admin/store";
import { collectionRegistry } from "@/lib/content/registry";

type Props = { params: Promise<{ name: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  return { title: isCollectionName(name) ? `New ${COLLECTION_META[name].singular}` : "Not found" };
}

export default async function NewItemPage({ params }: Props) {
  const { config, user } = await requireSession();
  const { name } = await params;
  if (!isCollectionName(name)) notFound();

  const snapshot = await readSnapshot();
  const meta = COLLECTION_META[name];
  const form = collectionForm(snapshot, name);
  // Every required field, blank. The list decides `order` when it's saved.
  const initial = blankValue(form.schema) as Raw;

  return (
    <DocEditor
      key={`${name}/new`}
      base={config.base}
      target={{ kind: "item", name, id: null, meta, keyField: collectionRegistry[name].key }}
      title={`New ${meta.singular}`}
      eyebrow={meta.label}
      back={{ href: adminHref(config.base, `/collections/${name}`), label: meta.label }}
      file={docLocation({ kind: "collection", name })}
      form={form}
      initial={initial}
      version={null}
      allowed={{ delete: false, layout: can(user.role, "layout") }}
    />
  );
}
