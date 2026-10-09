import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocEditor } from "@/components/admin/doc-editor";
import type { Raw } from "@/components/admin/form/schema-utils";
import { requireSession } from "@/lib/admin/auth";
import { adminHref } from "@/lib/admin/config";
import { collectionForm } from "@/lib/admin/form-schema";
import { editorHistory } from "@/lib/admin/history";
import { isCollectionName } from "@/lib/admin/lists";
import { COLLECTION_META } from "@/lib/admin/meta";
import { can } from "@/lib/admin/roles";
import { fileLabel, itemVersion, readSnapshot } from "@/lib/admin/store";
import { collectionRegistry, type CollectionName } from "@/lib/content/registry";
import type { ContentSnapshot } from "@/lib/content/validate";

type Props = { params: Promise<{ name: string; id: string }> };

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function findItem(snapshot: ContentSnapshot, name: CollectionName, id: string): Raw | null {
  const items = (Array.isArray(snapshot.collections[name]) ? snapshot.collections[name] : []) as Raw[];
  return items.find((item) => item[collectionRegistry[name].key] === id) ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  return { title: isCollectionName(name) ? `Edit ${COLLECTION_META[name].singular}` : "Not found" };
}

export default async function EditItemPage({ params }: Props) {
  const { config, user } = await requireSession();
  const { name, id: rawId } = await params;
  if (!isCollectionName(name)) notFound();

  const id = decode(rawId);
  const [snapshot, history] = await Promise.all([readSnapshot(), editorHistory({ kind: "item", name, id }, config.base)]);
  const meta = COLLECTION_META[name];
  // Missing (renamed or deleted elsewhere): the editor explains, with a way back.
  const item = findItem(snapshot, name, id);

  return (
    <DocEditor
      key={`${name}/${id}`}
      base={config.base}
      target={{ kind: "item", name, id, meta, keyField: collectionRegistry[name].key }}
      title={meta.singular}
      eyebrow={meta.label}
      back={{ href: adminHref(config.base, `/collections/${name}`), label: meta.label }}
      file={`content/${fileLabel({ kind: "collection", name })}`}
      form={collectionForm(snapshot, name)}
      initial={item}
      version={item ? itemVersion(item) : null}
      publicHref={meta.href?.replace("{id}", encodeURIComponent(id))}
      allowed={{ delete: can(user.role, "delete"), layout: can(user.role, "layout") }}
      history={item ? history : null}
    />
  );
}
