import { Counter } from "@/components/ui/counter";

/** One number with optional non-digit prefix/suffix: "−40%", "<1s", "4.8★", "15 hrs". */
const SINGLE_NUMBER = /^(\D*?)(\d+(?:\.\d+)?)(\D*)$/;

/**
 * Renders a metric value. Values with a single number count up (the
 * server still renders the final value); ranges and ratios such as
 * "8–12 wks" or "4 → 1" are shown as written.
 */
export function OutcomeValue({ value, className }: { value: string; className?: string }) {
  const match = SINGLE_NUMBER.exec(value.trim());
  if (!match) return <span className={className}>{value}</span>;
  const [, prefix = "", digits = "0", suffix = ""] = match;
  const decimals = digits.split(".")[1]?.length ?? 0;
  return <Counter value={Number(digits)} decimals={decimals} prefix={prefix} suffix={suffix} className={className} />;
}
