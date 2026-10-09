import Image from "next/image";
import Link from "next/link";
import type { TeamMember } from "@/lib/schemas";
import { cn, initials } from "@/lib/utils";

/**
 * Portrait when the team entry has one, otherwise initials in an
 * emerald-rimmed disc. Decorative: the name always sits next to it.
 */
export function AuthorAvatar({ author, className }: { author: TeamMember; className?: string }) {
  const classes = cn(
    "relative grid shrink-0 place-items-center overflow-hidden rounded-full border border-em/35 bg-surface-3 font-display font-medium tracking-[-0.03em] text-ink shadow-[0_0_28px_-10px_rgb(60_228_154/0.9)]",
    className,
  );
  if (author.avatar) {
    return (
      <span aria-hidden="true" className={classes}>
        <Image
          src={author.avatar.src}
          alt=""
          width={author.avatar.width}
          height={author.avatar.height}
          sizes="4rem"
          className="size-full object-cover"
        />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={classes}>
      {initials(author.name)}
    </span>
  );
}

/** Larger square portrait — mirrors the /about monogram-on-blueprint tile. */
function PortraitTile({ author, className }: { author: TeamMember; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-card border border-line bg-surface-2",
        className,
      )}
    >
      {author.avatar ? (
        <Image
          src={author.avatar.src}
          alt=""
          fill
          sizes="7rem"
          className="object-cover grayscale transition-[filter] duration-700 group-hover/author-card:grayscale-0"
        />
      ) : (
        <>
          <div className="blueprint absolute inset-0 opacity-60 [--grid-size:0.875rem]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgb(60_228_154/0.3),transparent_65%)] opacity-70 transition-opacity duration-700 group-hover/author-card:opacity-100" />
          <span className="relative font-display text-[2rem] font-medium leading-none tracking-[-0.07em] text-ink">
            {initials(author.name)}
          </span>
        </>
      )}
      <span className="absolute right-2 top-2 size-1.5 rounded-full bg-em shadow-[0_0_10px_var(--color-em)]" />
    </div>
  );
}

/** Compact "avatar · name · role" row. Links to the team entry when `href` is set. */
export function AuthorByline({
  author,
  href,
  className,
}: {
  author: TeamMember;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <AuthorAvatar author={author} className="size-11 text-sm" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[0.95rem] font-medium text-ink transition-colors duration-300 group-hover/author:text-hot">
          {author.name}
        </span>
        <span className="truncate text-sm text-muted">{author.role}</span>
      </span>
    </>
  );

  if (!href) return <span className={cn("inline-flex min-w-0 items-center gap-3", className)}>{body}</span>;
  return (
    <Link href={href} className={cn("group/author inline-flex min-w-0 items-center gap-3", className)}>
      {body}
    </Link>
  );
}

/** End-of-article author card with bio. */
export function AuthorCard({
  author,
  label,
  href,
  className,
}: {
  author: TeamMember;
  label: string;
  href: string;
  className?: string;
}) {
  return (
    <div className={cn("group/author-card card card-hover relative isolate overflow-hidden p-6 sm:p-8", className)}>
      <div
        aria-hidden="true"
        className="blueprint fade-radial pointer-events-none absolute inset-0 -z-10 opacity-30 [--grid-size:1.5rem]"
      />
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <PortraitTile author={author} className="size-24 sm:size-28" />
        <div className="min-w-0">
          <p className="label-mono">{label}</p>
          <p className="text-h4 mt-3 text-ink">
            <Link href={href} className="transition-colors duration-300 hover:text-hot">
              {author.name}
            </Link>
          </p>
          <p className="mt-1 text-sm text-em">{author.role}</p>
          <p className="mt-4 text-dim">{author.bio}</p>
        </div>
      </div>
    </div>
  );
}
