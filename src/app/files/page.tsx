import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { FileLibrary } from "@/components/files/file-library";
import { brandMark, resolveBrand } from "@/lib/brand";
import { getSettings } from "@/lib/data";
import { cameThroughGate, getFilesConfig, logFilesProblem } from "@/lib/files/config";
import { listPublicFiles } from "@/lib/files/list";

/* ─────────────────────────────────────────────────────────────
   File library: everything in /public, with previews, links and
   downloads. Only reachable at the private FILES_PATH address:
   src/proxy.ts rewrites that address here (stamping the request)
   and 404s this folder's own name. Outside the (site) layout, so
   no site chrome and no analytics; never linked, never indexed,
   never cached.
   ───────────────────────────────────────────────────────────── */

export const metadata: Metadata = {
  // `absolute`: the public site's title template doesn't apply here.
  title: { absolute: "Files" },
  description: null,
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  referrer: "no-referrer",
  openGraph: null,
  twitter: null,
};

export default async function FilesPage() {
  // Decided per request (headers() is request-time): a build must not bake in a 404 (or a page).
  const requestHeaders = await headers();
  const config = getFilesConfig();
  logFilesProblem(config);
  // Only for requests the proxy let in through the private address.
  if (!cameThroughGate(config, requestHeaders)) notFound();

  const [files, settings] = await Promise.all([listPublicFiles(), getSettings()]);
  return <FileLibrary files={files} base={config.base} siteName={settings.name} mark={brandMark(resolveBrand(settings))} />;
}
