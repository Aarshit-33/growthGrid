import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────
   Buttons. Server-safe (no client JS): hover choreography is pure
   CSS — the label rolls up and the arrow swaps diagonally.
   Wrap in <Magnetic> for the magnetic pull on desktop.
   ───────────────────────────────────────────────────────────── */

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "md" | "lg";

const base =
  "group/btn relative inline-flex select-none items-center justify-center gap-3 whitespace-nowrap rounded-full font-medium tracking-[-0.01em] transition-[background-color,color,border-color,box-shadow] duration-500 ease-out-expo disabled:pointer-events-none disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-em text-bg shadow-[0_0_0_1px_rgb(60_228_154/0.35),0_14px_40px_-14px_rgb(60_228_154/0.7)] hover:bg-hot hover:shadow-[0_0_0_1px_rgb(125_255_196/0.6),0_18px_50px_-12px_rgb(60_228_154/0.85)]",
  secondary:
    "border border-line-strong bg-white/[0.03] text-ink backdrop-blur-sm hover:border-em/60 hover:bg-em/[0.07]",
  ghost: "text-ink hover:text-hot",
};

const sizes: Record<ButtonVariant, Record<ButtonSize, string>> = {
  primary: { md: "h-11 pl-5 pr-1.5 text-[0.95rem]", lg: "h-14 pl-7 pr-2 text-base" },
  secondary: { md: "h-11 pl-5 pr-1.5 text-[0.95rem]", lg: "h-14 pl-7 pr-2 text-base" },
  ghost: { md: "h-11 text-[0.95rem]", lg: "h-14 text-base" },
};

const iconWrap: Record<ButtonVariant, Record<ButtonSize, string>> = {
  primary: { md: "size-8 bg-bg/90 text-em", lg: "size-10 bg-bg/90 text-em" },
  secondary: { md: "size-8 bg-white/[0.06] text-ink group-hover/btn:bg-em group-hover/btn:text-bg", lg: "size-10 bg-white/[0.06] text-ink group-hover/btn:bg-em group-hover/btn:text-bg" },
  ghost: { md: "size-8 border border-line-strong group-hover/btn:border-em/60", lg: "size-10 border border-line-strong group-hover/btn:border-em/60" },
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[variant][size], className);
}

/** Label that rolls up to a duplicate of itself on hover. */
function RollingLabel({ children }: { children: ReactNode }) {
  if (typeof children !== "string") return <span>{children}</span>;
  return (
    <span className="relative block overflow-hidden">
      <span className="block transition-transform duration-500 ease-out-expo group-hover/btn:-translate-y-full">
        {children}
      </span>
      <span
        aria-hidden="true"
        className="absolute inset-0 block translate-y-full transition-transform duration-500 ease-out-expo group-hover/btn:translate-y-0"
      >
        {children}
      </span>
    </span>
  );
}

/* Static class maps (Tailwind needs literal class names). */
const ARROW_OUT = {
  btn: "group-hover/btn:-translate-y-full group-hover/btn:translate-x-full",
  link: "group-hover/link:-translate-y-full group-hover/link:translate-x-full",
  card: "group-hover/card:-translate-y-full group-hover/card:translate-x-full",
} as const;
const ARROW_IN = {
  btn: "group-hover/btn:translate-x-0 group-hover/btn:translate-y-0",
  link: "group-hover/link:translate-x-0 group-hover/link:translate-y-0",
  card: "group-hover/card:translate-x-0 group-hover/card:translate-y-0",
} as const;

/**
 * Arrow that exits top-right while a twin enters from bottom-left.
 * `trigger` names the hover group that drives it: a button (group/btn),
 * an inline link (group/link) or a whole card (group/card).
 */
export function ArrowSwap({
  className,
  trigger = "btn",
}: {
  className?: string;
  trigger?: keyof typeof ARROW_OUT;
}) {
  return (
    <span aria-hidden="true" className={cn("relative inline-flex size-4 overflow-hidden", className)}>
      <ArrowUpRight
        strokeWidth={2}
        className={cn("size-full transition-transform duration-500 ease-out-expo", ARROW_OUT[trigger])}
      />
      <ArrowUpRight
        strokeWidth={2}
        className={cn(
          "absolute inset-0 size-full -translate-x-full translate-y-full transition-transform duration-500 ease-out-expo",
          ARROW_IN[trigger],
        )}
      />
    </span>
  );
}

function ButtonInner({
  children,
  variant,
  size,
  icon,
}: {
  children: ReactNode;
  variant: ButtonVariant;
  size: ButtonSize;
  icon: boolean;
}) {
  return (
    <>
      <RollingLabel>{children}</RollingLabel>
      {icon && (
        <span
          className={cn(
            "grid shrink-0 place-items-center rounded-full transition-colors duration-500 ease-out-expo",
            iconWrap[variant][size],
          )}
        >
          <ArrowSwap />
        </span>
      )}
    </>
  );
}

const isInternal = (href: string) => href.startsWith("/") || href.startsWith("#");

/** Without the arrow chip, padding becomes symmetric. */
function noIconPadding(variant: ButtonVariant, size: ButtonSize, icon: boolean) {
  if (icon || variant === "ghost") return undefined;
  return size === "lg" ? "pr-7" : "pr-5";
}

type ButtonLinkProps = Omit<ComponentPropsWithoutRef<"a">, "href"> & {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Show the arrow chip (default true). */
  icon?: boolean;
  external?: boolean;
};

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  icon = true,
  external,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  const classes = buttonClasses(variant, size, cn(noIconPadding(variant, size, icon), className));
  const inner = (
    <ButtonInner variant={variant} size={size} icon={icon}>
      {children}
    </ButtonInner>
  );

  if (isInternal(href) && !external) {
    return (
      <Link href={href} className={classes} {...rest}>
        {inner}
      </Link>
    );
  }
  const newTab = external ?? /^https?:\/\//.test(href);
  return (
    <a
      href={href}
      className={classes}
      {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...rest}
    >
      {inner}
    </a>
  );
}

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  icon = true,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, cn(noIconPadding(variant, size, icon), className))}
      {...rest}
    >
      <ButtonInner variant={variant} size={size} icon={icon}>
        {children}
      </ButtonInner>
    </button>
  );
}

/** Inline text link with an animated underline and arrow. */
export function ArrowLink({
  href,
  children,
  className,
  external,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  external?: boolean;
}) {
  const classes = cn(
    "group/link inline-flex items-center gap-2 font-medium text-ink transition-colors duration-300 hover:text-hot",
    className,
  );
  const inner = (
    <>
      <span className="bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-left-bottom bg-no-repeat pb-0.5 transition-[background-size] duration-500 ease-out-expo group-hover/link:bg-[length:100%_1px]">
        {children}
      </span>
      <ArrowSwap trigger="link" />
    </>
  );
  if (isInternal(href) && !external) {
    return (
      <Link href={href} className={classes}>
        {inner}
      </Link>
    );
  }
  return (
    <a href={href} className={classes} target="_blank" rel="noopener noreferrer">
      {inner}
    </a>
  );
}
