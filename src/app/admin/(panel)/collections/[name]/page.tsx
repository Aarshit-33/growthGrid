import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CollectionList } from "@/components/admin/collection-list";
import { requireSession } from "@/lib/admin/auth";
import { isCollectionName, listRows } from "@/lib/admin/lists";
import { COLLECTION_META } from "@/lib/admin/meta";
import { docLocation, readSnapshot } from "@/lib/admin/store";

type Props = { params: Promise<{ name: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  return { title: isCollectionName(name) ? COLLECTION_META[name].label : "Not found" };
}

export default async function CollectionPage({ params }: Props) {
  const { config } = await requireSession();
  const { name } = await params;
  if (!isCollectionName(name)) notFound();

  const snapshot = await readSnapshot();

  return (
    <CollectionList
      key={name}
      base={config.base}
      name={name}
      meta={COLLECTION_META[name]}
      rows={listRows(snapshot, name)}
      file={docLocation({ kind: "collection", name })}
    />
  );
}
