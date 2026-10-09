import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { JsonLd } from "@/components/seo/json-ld";
import { getSettings } from "@/lib/data";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href: string;
}

/**
 * Visible breadcrumb trail + matching BreadcrumbList JSON-LD.
 * The last crumb is the current page.
 */
export async function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  const settings = await getSettings();
  return (
    <>
      <nav aria-label="Breadcrumb" className={cn("load-fade", className)}>
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted">
          {items.map((item, i) => {
            const last = i === items.length - 1;
            return (
              <li key={item.href} className="flex items-center gap-2">
                {last ? (
                  <span aria-current="page" className="text-dim">
                    {item.label}
                  </span>
                ) : (
                  <>
                    <Link href={item.href} className="transition-colors hover:text-hot">
                      {item.label}
                    </Link>
                    <ChevronRight aria-hidden="true" className="size-3 text-faint" />
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <JsonLd data={breadcrumbSchema(items, settings)} />
    </>
  );
}
