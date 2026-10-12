import { Counter } from "@/components/ui/counter";

/** One number with optional non-digit prefix/suffix: "−40%", "<1s", "4.8★", "15 hrs". */
const SINGLE_NUMBER = /^(\D*?)(\d+(?:\.\d+)?)(\D*)$/;

/** A trailing word unit after a figure: "1 codebase", "15 hrs", "8–12 wks". */
const WORD_UNIT = /^(.*\d\S*)\s+(\p{L}[\p{L}.]+)$/u;

function Figure({ value, count }: { value: string; count: boolean }) {
  const match = count ? SINGLE_NUMBER.exec(value) : null;
  if (!match) return <>{value}</>;
  const [, prefix = "", digits = "0", suffix = ""] = match;
  const decimals = digits.split(".")[1]?.length ?? 0;
  return <Counter value={Number(digits)} decimals={decimals} prefix={prefix} suffix={suffix} />;
}

/**
 * Renders a metric value. Values with a single number count up (the
 * server still renders the final value); ranges and ratios such as
 * "8–12 wks" or "4 → 1" are shown as written. A trailing word unit
 * ("codebase", "wks") is set at half size so long words fit narrow
 * metric cells instead of spilling past their card.
 */
export function OutcomeValue({
  value,
  className,
  count = true,
}: {
  value: string;
  className?: string;
  /** Count up on scroll (off for compact, always-visible metrics). */
  count?: boolean;
}) {
  const text = value.trim();
  const unit = WORD_UNIT.exec(text);
  return (
    <span className={className}>
      <Figure value={unit?.[1] ?? text} count={count} />
      {unit && (
        <>
          {" "}
          <span className="text-[0.5em] tracking-[-0.02em]">{unit[2]}</span>
        </>
      )}
    </span>
  );
}
