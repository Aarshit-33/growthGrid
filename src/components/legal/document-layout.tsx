import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { SectionNav } from "@/components/services/section-nav";
import { cn, pad } from "@/lib/utils";

export type TocItem = { id: string; label: string };

/**
 * Collapsible contents for small screens. Native <details>, so it opens,
 * closes and is keyboard/AT accessible with zero JavaScript.
 */
export function MobileToc({ label, items, className }: { label: string; items: TocItem[]; className?: string }) {
  return (
    <details className={cn("group/toc card overflow-hidden", className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition-colors duration-300 hover:bg-white/[0.02] [&::-webkit-details-marker]:hidden">
        <span className="label-mono text-dim">{label}</span>
        <span aria-hidden="true" className="flex items-center gap-3">
          <span className="font-mono text-[0.68rem] tabular-nums text-faint">{pad(items.length)}</span>
          <ChevronDown className="size-4 text-muted transition-transform duration-300 ease-out-expo group-open/toc:rotate-180" />
        </span>
      </summary>
      <nav aria-label={label} className="border-t border-line px-5 pb-3 pt-2">
        <ol>
          {items.map((item, i) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="flex items-baseline gap-3 py-2.5 text-[0.95rem] text-dim transition-colors duration-300 hover:text-ink"
              >
                <span className="font-mono text-[0.68rem] text-faint">{pad(i + 1)}</span>
                {item.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </details>
  );
}

/**
 * Long-form layout shared by articles and legal pages: a sticky
 * scroll-spy contents rail (plus optional extras) on desktop, a
 * collapsible contents block above the text on mobile.
 */
export function DocumentLayout({
  toc,
  tocLabel,
  rail,
  children,
  className,
}: {
  toc: TocItem[];
  tocLabel: string;
  /** Extra desktop-rail content under the contents (e.g. share links). */
  rail?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const hasToc = toc.length > 0;
  return (
    <div className={cn("container-x grid gap-10 lg:grid-cols-12", className)}>
      {(hasToc || rail) && (
        <div className="hidden lg:col-span-3 lg:block">
          <div className="sticky top-[calc(var(--header-h)+2.5rem)] space-y-12">
            {hasToc && <SectionNav label={tocLabel} items={toc} />}
            {rail}
          </div>
        </div>
      )}
      <div className="min-w-0 lg:col-span-8 lg:col-start-5">
        {hasToc && <MobileToc label={tocLabel} items={toc} className="mb-12 lg:hidden" />}
        {children}
      </div>
    </div>
  );
}
