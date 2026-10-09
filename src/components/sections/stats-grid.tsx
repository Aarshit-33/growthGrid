import { Counter } from "@/components/ui/counter";
import type { Stat } from "@/lib/schemas";
import { cn } from "@/lib/utils";

/** Big animated numbers on hairline cells. */
export function StatsGrid({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-2 border-l border-t border-line lg:grid-cols-4", className)}>
      {stats.map((stat, i) => (
        <div
          key={stat.key}
          className="relative flex flex-col-reverse justify-between gap-10 border-b border-r border-line p-5 sm:p-8"
          data-reveal=""
          data-stat-index={i}
          style={{ "--reveal-delay": `${i * 90}ms` } as React.CSSProperties}
        >
          <dt className="text-sm text-muted">{stat.label}</dt>
          <dd className="font-display text-[clamp(2.4rem,1.6rem+3vw,4.5rem)] font-medium leading-none tracking-[-0.05em] text-ink">
            <Counter value={stat.value} decimals={stat.decimals} prefix={stat.prefix} suffix={stat.suffix} />
          </dd>
          <span aria-hidden="true" className="absolute right-3 top-3 size-1.5 rounded-full bg-em/70" />
        </div>
      ))}
    </dl>
  );
}
