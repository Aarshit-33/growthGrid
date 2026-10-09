import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { LoaderCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────
   Admin UI primitives. No hooks, so server and client components
   can both use them. Built on the site's design tokens.
   ───────────────────────────────────────────────────────────── */

/* ── Buttons ──────────────────────────────────────────────── */

export type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
export type BtnSize = "sm" | "md";

const BTN_BASE =
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium tracking-[-0.01em] transition-[background-color,color,border-color,box-shadow,transform] duration-300 ease-out-expo active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-em";

const BTN_VARIANTS: Record<BtnVariant, string> = {
  primary:
    "bg-em text-bg shadow-[0_0_0_1px_rgb(60_228_154/0.35),0_10px_30px_-12px_rgb(60_228_154/0.7)] hover:bg-hot hover:shadow-[0_0_0_1px_rgb(125_255_196/0.6),0_14px_36px_-10px_rgb(60_228_154/0.8)]",
  secondary: "border border-line-strong bg-white/[0.03] text-ink hover:border-em/50 hover:bg-em/[0.07]",
  ghost: "text-dim hover:bg-white/[0.05] hover:text-ink",
  danger: "border border-danger/35 bg-danger/[0.06] text-danger hover:border-danger/70 hover:bg-danger/[0.12]",
};

const BTN_SIZES: Record<BtnSize, string> = {
  sm: "h-8 px-3 text-[0.8rem] [&_svg]:size-3.5",
  md: "h-10 px-4.5 text-[0.88rem] [&_svg]:size-4",
};

export function btnClasses(variant: BtnVariant = "secondary", size: BtnSize = "md", className?: string) {
  return cn(BTN_BASE, BTN_VARIANTS[variant], BTN_SIZES[size], className);
}

type BtnProps = ComponentPropsWithoutRef<"button"> & {
  variant?: BtnVariant;
  size?: BtnSize;
  icon?: LucideIcon;
  loading?: boolean;
};

export function Btn({
  variant = "secondary",
  size = "md",
  icon: IconComponent,
  loading = false,
  type = "button",
  className,
  children,
  disabled,
  ...rest
}: BtnProps) {
  return (
    <button
      type={type}
      className={btnClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : IconComponent && <IconComponent aria-hidden="true" />}
      {children}
    </button>
  );
}

type BtnLinkProps = Omit<ComponentPropsWithoutRef<"a">, "href"> & {
  href: string;
  variant?: BtnVariant;
  size?: BtnSize;
  icon?: LucideIcon;
  external?: boolean;
};

export function BtnLink({ href, variant = "secondary", size = "md", icon: IconComponent, external, className, children, ...rest }: BtnLinkProps) {
  const classes = btnClasses(variant, size, className);
  const inner = (
    <>
      {IconComponent && <IconComponent aria-hidden="true" />}
      {children}
    </>
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes} {...rest}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...rest}>
      {inner}
    </Link>
  );
}

/** A button's text that shows from `sm` up. Phones get the icon alone (screen readers still read the text), so action bars fit one row. */
export function BtnLabel({ children }: { children: ReactNode }) {
  return <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">{children}</span>;
}

/** Square icon-only button (needs an accessible label). */
export function IconBtn({
  icon: IconComponent,
  label,
  tone = "default",
  className,
  type = "button",
  ...rest
}: ComponentPropsWithoutRef<"button"> & { icon: LucideIcon; label: string; tone?: "default" | "danger" }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-[background-color,color,transform] duration-200 active:scale-90 disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-em",
        tone === "danger" ? "hover:bg-danger/10 hover:text-danger" : "hover:bg-white/[0.06] hover:text-ink",
        className,
      )}
      {...rest}
    >
      <IconComponent className="size-4" aria-hidden="true" />
    </button>
  );
}

/* ── Switch ───────────────────────────────────────────────── */

type SwitchProps = Omit<ComponentPropsWithoutRef<"button">, "onChange"> & {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  size?: "sm" | "md";
  /** Accessible name when there's no visible <label for>. */
  label?: string;
};

export function Switch({ checked, onCheckedChange, size = "md", label, className, disabled, ...rest }: SwitchProps) {
  const sm = size === "sm";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "group/switch relative inline-flex shrink-0 items-center rounded-full border transition-[background-color,border-color,box-shadow] duration-300 ease-out-expo disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-em",
        sm ? "h-5 w-9" : "h-6 w-11",
        checked
          ? "border-em/70 bg-em shadow-[0_0_14px_-2px_rgb(60_228_154/0.6)]"
          : "border-line-strong bg-surface-3 hover:border-faint",
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute rounded-full shadow-[0_1px_3px_rgb(0_0_0/0.4)] transition-[transform,background-color,width] duration-300 ease-spring group-active/switch:w-[1.15rem]",
          sm ? "left-0.5 size-3.5" : "left-[3px] size-4",
          checked ? cn("bg-bg", sm ? "translate-x-4" : "translate-x-5") : "translate-x-0 bg-dim",
        )}
      />
    </button>
  );
}

/* ── Badges ───────────────────────────────────────────────── */

export type Tone = "em" | "warn" | "danger" | "info" | "muted";

const TONES: Record<Tone, string> = {
  em: "border-em/30 bg-em/[0.08] text-hot",
  warn: "border-warn/30 bg-warn/[0.08] text-warn",
  danger: "border-danger/35 bg-danger/[0.08] text-danger",
  info: "border-info/30 bg-info/[0.08] text-info",
  muted: "border-line-strong bg-white/[0.03] text-muted",
};

export function Badge({
  tone = "muted",
  icon: IconComponent,
  className,
  children,
  title,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 font-mono text-[0.66rem] font-medium uppercase tracking-[0.1em]",
        TONES[tone],
        className,
      )}
    >
      {IconComponent && <IconComponent className="size-3" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Small live dot (status indicators). */
export function Dot({ tone = "em", pulse = false }: { tone?: Tone; pulse?: boolean }) {
  const colors: Record<Tone, string> = {
    em: "bg-em",
    warn: "bg-warn",
    danger: "bg-danger",
    info: "bg-info",
    muted: "bg-faint",
  };
  return (
    <span aria-hidden="true" className={cn("inline-block size-1.5 shrink-0 rounded-full", colors[tone], pulse && "animate-pulse-dot")} />
  );
}

/* ── Surfaces ─────────────────────────────────────────────── */

export function Panel({
  title,
  description,
  actions,
  icon: IconComponent,
  id,
  className,
  bodyClassName,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: LucideIcon;
  id?: string;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}) {
  const hasHeader = title || description || actions;
  return (
    <section id={id} className={cn("card scroll-mt-28 overflow-hidden", className)}>
      {hasHeader && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            {IconComponent && (
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-white/[0.03] text-em">
                <IconComponent className="size-4" aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="font-display text-[1.05rem] font-medium tracking-[-0.015em] text-ink">{title}</h2>}
              {description && <p className="mt-0.5 text-[0.84rem] leading-relaxed text-muted">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("px-5 py-5 sm:px-6", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h1 className="font-display text-[clamp(1.75rem,1.4rem+1.4vw,2.5rem)] font-medium leading-[1.05] tracking-[-0.035em] text-ink">
          {title}
        </h1>
        {description && <p className="mt-3 text-[0.95rem] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A key hint. `onAccent` inside a primary (emerald) button, where it takes the button's dark text. */
export function Kbd({ children, onAccent = false }: { children: ReactNode; onAccent?: boolean }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 font-mono text-[0.65rem]",
        onAccent ? "border-bg/20 bg-bg/[0.07] text-bg/70" : "border-line-strong bg-white/[0.04] text-muted",
      )}
    >
      {children}
    </kbd>
  );
}

/* ── Form controls ────────────────────────────────────────── */

/** Text inputs, selects and textareas share this look. */
export function inputClasses(invalid = false, className?: string) {
  return cn(
    "w-full rounded-xl border bg-white/[0.025] px-3.5 text-[0.9rem] text-ink placeholder:text-faint/80 transition-[border-color,background-color,box-shadow] duration-200 hover:border-line-strong focus:bg-white/[0.045] focus:outline-none focus-visible:outline-none disabled:opacity-50",
    invalid
      ? "border-danger/60 focus:border-danger focus:shadow-[0_0_0_4px_rgb(255_107_107/0.12)]"
      : "border-line focus:border-em/60 focus:shadow-[0_0_0_4px_rgb(60_228_154/0.1)]",
    className,
  );
}
