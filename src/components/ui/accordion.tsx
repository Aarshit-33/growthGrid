"use client";

import { Plus } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn, pad } from "@/lib/utils";

export interface AccordionItem {
  id: string;
  title: string;
  content: ReactNode;
}

/**
 * Accessible accordion (WAI-ARIA disclosure pattern). Collapsed panels stay
 * in the DOM — so FAQ answers remain indexable — but are `inert`, so they
 * can't be focused. Height animates with a CSS grid-rows transition.
 */
export function Accordion({
  items,
  defaultOpen = null,
  numbered = true,
  headingLevel = 3,
  className,
}: {
  items: AccordionItem[];
  defaultOpen?: string | null;
  numbered?: boolean;
  headingLevel?: 2 | 3 | 4;
  className?: string;
}) {
  const [open, setOpen] = useState<string | null>(defaultOpen);
  const uid = useId();
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";

  return (
    <div className={cn("border-t border-line", className)}>
      {items.map((item, i) => {
        const isOpen = open === item.id;
        const triggerId = `${uid}-${item.id}-trigger`;
        const panelId = `${uid}-${item.id}-panel`;
        return (
          <div key={item.id} className="group border-b border-line" data-open={isOpen ? "" : undefined}>
            <Heading className="m-0 font-sans text-base font-normal">
              <button
                type="button"
                id={triggerId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : item.id)}
                className="flex w-full items-start gap-5 py-6 text-left transition-colors duration-300 hover:text-hot md:gap-8 md:py-7"
              >
                {numbered && (
                  <span className="label-mono w-7 shrink-0 pt-1.5 text-faint transition-colors group-data-open:text-em">
                    {pad(i + 1)}
                  </span>
                )}
                <span className="text-h4 flex-1 text-ink transition-colors group-hover:text-hot">{item.title}</span>
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-full border border-line-strong text-dim transition-all duration-500 ease-out-expo group-data-open:rotate-45 group-data-open:border-em group-data-open:bg-em group-data-open:text-bg"
                >
                  <Plus className="size-4" strokeWidth={1.8} />
                </span>
              </button>
            </Heading>
            <div
              id={panelId}
              role="region"
              aria-labelledby={triggerId}
              inert={!isOpen}
              className="grid transition-[grid-template-rows,opacity] duration-500 ease-out-expo"
              style={{ gridTemplateRows: isOpen ? "1fr" : "0fr", opacity: isOpen ? 1 : 0 }}
            >
              <div className="overflow-hidden">
                <div className={cn("max-w-3xl pb-7 text-dim", numbered && "pl-12 md:pl-15")}>{item.content}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
