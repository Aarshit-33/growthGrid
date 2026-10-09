import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowSwap } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { Service } from "@/lib/schemas";
import { pad } from "@/lib/utils";
import { OutcomeValue } from "./outcome-value";

const arrowChip =
  "grid size-11 shrink-0 place-items-center rounded-full border border-line-strong text-ink transition-colors duration-500 group-hover/card:border-em group-hover/card:bg-em group-hover/card:text-bg";

/**
 * One row of the services index. The title link is stretched over the
 * whole row, so the row is a single, crawlable, keyboard-friendly target.
 */
export function ServiceRow({
  service,
  index,
  viewLabel,
}: {
  service: Service;
  /** 1-based position. */
  index: number;
  /** Custom-cursor label, e.g. "Explore service". */
  viewLabel: string;
}) {
  const lead = service.outcomes[0];
  return (
    <article
      className="group/card relative grid gap-x-8 gap-y-5 py-9 sm:py-10 lg:grid-cols-12 lg:items-center lg:px-6 lg:py-12"
      style={{ "--accent": service.accent } as CSSProperties}
    >
      <div className="flex items-center justify-between lg:col-span-1 lg:self-start lg:pt-3">
        <span className="font-mono text-xs text-faint transition-colors duration-500 group-hover/card:text-em">
          {pad(index)}
        </span>
        <span aria-hidden="true" className={`${arrowChip} lg:hidden`}>
          <ArrowSwap trigger="card" />
        </span>
      </div>

      <div className="lg:col-span-4">
        <div className="flex items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-line bg-white/[0.03] text-[var(--accent)] shadow-[0_0_0_0_transparent] transition-[border-color,box-shadow] duration-500 group-hover/card:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] group-hover/card:shadow-[0_0_28px_-6px_var(--accent)]">
            <Icon name={service.icon} className="size-5" aria-hidden="true" />
          </span>
          {/* Nudge an inner span, not the h3: a transformed h3 would contain the stretched ::after. */}
          <h3 className="text-h3 text-ink">
            <Link
              href={`/services/${service.slug}`}
              data-cursor={viewLabel}
              className="after:absolute after:inset-0 after:z-10 after:content-['']"
            >
              <span className="inline-block transition-transform duration-700 ease-out-expo lg:group-hover/card:translate-x-1.5">
                {service.title}
              </span>
            </Link>
          </h3>
        </div>
        <p className="mt-4 font-mono text-[0.72rem] tracking-[0.04em] text-muted">{service.tagline}</p>
      </div>

      <p className="max-w-xl text-dim lg:col-span-4">{service.summary}</p>

      {lead && (
        <dl className="lg:col-span-2">
          <div className="flex flex-col-reverse">
            <dt className="mt-2 text-xs leading-snug text-muted">{lead.label}</dt>
            <dd className="font-display text-[1.75rem] font-medium leading-none tracking-[-0.04em] text-ink">
              <OutcomeValue value={lead.value} />
            </dd>
          </div>
        </dl>
      )}

      <div className="hidden justify-end lg:col-span-1 lg:flex">
        <span aria-hidden="true" className={arrowChip}>
          <ArrowSwap trigger="card" />
        </span>
      </div>
    </article>
  );
}
