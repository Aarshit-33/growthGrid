"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { scrollToTarget } from "@/components/layout/smooth-scroll";
import { OutcomeValue } from "@/components/services/outcome-value";
import { journey } from "@/components/three/store";
import { ArrowSwap, ButtonLink } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { Tag } from "@/components/ui/tag";
import { useReducedMotionSafe } from "@/hooks/use-media-query";
import type { Link as LinkItem, Project, SectionIntro, WorkPage } from "@/lib/schemas";
import { cn, pad } from "@/lib/utils";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** Scroll distance per slide, and the pause on the last slide before release (× viewport height). */
const PER_SLIDE = 0.8;
const HOLD = 0.4;

/** Side arrows: glass discs over the neighbours' peeking edges, vertically centred on the slides. */
const deckArrow =
  "absolute top-1/2 z-20 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-line-strong bg-bg/70 text-ink shadow-panel backdrop-blur-md transition-[color,background-color,border-color,opacity] duration-300 hover:border-em/60 hover:bg-em/[0.12] hover:text-hot disabled:cursor-default disabled:opacity-30 disabled:hover:border-line-strong disabled:hover:bg-bg/70 disabled:hover:text-ink lg:size-14";

function DeckCard({
  project,
  index,
  total,
  labels,
  priority,
}: {
  project: Project;
  index: number;
  total: number;
  labels: WorkPage["detail"];
  priority?: boolean;
}) {
  return (
    <article className="group/card relative flex h-full flex-col overflow-hidden rounded-panel border border-line bg-surface shadow-panel lg:grid lg:grid-cols-[1.2fr_1fr]">
      {/* Phones: the image takes whatever height the copy leaves (a slimmer band on short phones). */}
      <div className="relative min-h-[7rem] flex-1 overflow-hidden max-lg:[@media(max-height:720px)]:min-h-[4.5rem] lg:min-h-0">
        <Image
          src={project.cover.src}
          alt={project.cover.alt}
          fill
          sizes="(min-width: 1024px) 52vw, 92vw"
          loading={priority ? "eager" : undefined}
          className="object-cover transition-transform duration-[1.6s] ease-out-expo group-hover/card:scale-[1.05]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(to_top,rgb(10_17_23/0.9),transparent_55%)] lg:bg-[linear-gradient(to_right,transparent_55%,rgb(10_17_23/0.85))]"
        />
        <span className="absolute left-5 top-5 rounded-full bg-bg/70 px-3 py-1.5 font-mono text-[0.68rem] tracking-[0.14em] text-dim backdrop-blur">
          {pad(index + 1)} / {pad(total)}
        </span>
      </div>

      {/* Short desktop screens: tighter padding, and the secondary lines step aside
          (visually only) so nothing is cut off inside the card. */}
      <div className="flex shrink-0 flex-col p-5 sm:p-8 lg:p-10 xl:p-12 [@media(min-width:64rem)_and_(max-height:860px)]:p-8">
        <div className="flex flex-wrap gap-2">
          <Tag tone="em">{project.category}</Tag>
          <Tag>{project.client.industry}</Tag>
          <Tag>{project.year}</Tag>
        </div>
        <h3 className="text-h3 mt-4 text-ink transition-colors duration-300 group-hover/card:text-hot lg:mt-5 lg:text-[clamp(1.8rem,1rem+1.5vw,2.8rem)] lg:leading-[1.06]">
          <Link
            href={`/work/${project.slug}`}
            data-cursor={labels.view}
            className="after:absolute after:inset-0 after:z-10 after:content-['']"
          >
            {project.title}
          </Link>
        </h3>
        <p className="mt-3 line-clamp-3 text-dim lg:mt-4 lg:text-lg max-lg:[@media(max-height:720px)]:line-clamp-2 [@media(min-width:64rem)_and_(max-height:780px)]:line-clamp-2">
          {project.summary}
        </p>
        <p className="mt-4 font-mono text-[0.72rem] leading-relaxed tracking-[0.04em] text-muted max-lg:[@media(max-height:780px)]:sr-only [@media(min-width:64rem)_and_(max-height:860px)]:sr-only">
          {project.outcome}
        </p>

        <dl className="mt-5 grid grid-cols-3 gap-x-4 gap-y-5 border-t border-line pt-5 lg:mt-auto lg:gap-x-6 lg:pt-6 [@media(min-width:64rem)_and_(max-height:860px)]:pt-5">
          {project.results.slice(0, 3).map((m) => (
            <div key={m.label} className="flex min-w-0 flex-col-reverse">
              <dt className="mt-1.5 text-xs leading-snug text-muted">{m.label}</dt>
              <dd className="break-words font-display text-[1.5rem] font-medium leading-none tracking-[-0.045em] text-ink lg:text-[2.1rem]">
                <OutcomeValue value={m.value} count={false} />
              </dd>
            </div>
          ))}
        </dl>
        {/* Decorative (the whole card is the link): the first thing to go on short screens. */}
        <span
          aria-hidden="true"
          className="mt-5 inline-flex items-center gap-3 text-sm font-medium text-ink lg:mt-7 max-lg:[@media(max-height:720px)]:hidden [@media(min-width:64rem)_and_(max-height:860px)]:mt-5 [@media(min-width:64rem)_and_(max-height:780px)]:hidden"
        >
          <span className="grid size-10 place-items-center rounded-full bg-em text-bg">
            <ArrowSwap trigger="card" />
          </span>
          {labels.view}
        </span>
      </div>
    </article>
  );
}

/**
 * Featured work as full-screen slides, on every screen size. The deck pins
 * and each stretch of scroll moves exactly one whole card into the centre
 * (never a half-way position), with a sliver of the neighbours on both
 * sides. After the last card (and a short hold) the page scrolls on.
 * With reduced motion the pin still works but slides change instantly.
 * Without JS the row is a native scroll-snap carousel.
 */
export function WorkDeck({
  projects,
  labels,
  cta,
  intro,
  index,
  headingId,
  prevLabel,
  nextLabel,
}: {
  projects: Project[];
  labels: WorkPage["detail"];
  cta: LinkItem;
  /** Section intro: rendered here (as the h2) so the title stays visible while pinned. */
  intro?: SectionIntro;
  index?: string;
  headingId?: string;
  /** Accessible labels for the side arrows. */
  prevLabel: string;
  nextLabel: string;
}) {
  const n = projects.length;
  const scope = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLUListElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const stRef = useRef<ScrollTrigger | null>(null);
  const current = useRef(0);
  const [active, setActive] = useState(0);
  const [pinned, setPinned] = useState(false);
  const reduce = useReducedMotionSafe();
  const reduceRef = useRef(reduce);
  useEffect(() => {
    reduceRef.current = reduce;
  }, [reduce]);
  /** Share of the pin spent moving between slides (the rest is the final hold). */
  const moveShare = n > 1 ? ((n - 1) * PER_SLIDE) / ((n - 1) * PER_SLIDE + HOLD) : 0;

  useGSAP(
    () => {
      const el = track.current;
      const wrap = scope.current;
      if (!el || !wrap) return;
      wrap.style.overflow = "hidden";

      /** Slide the track so card `i` sits in the centre. */
      const show = (i: number, instant = false) => {
        const card = el.children[i] as HTMLElement | undefined;
        if (!card) return;
        const x = wrap.clientWidth / 2 - (card.offsetLeft + card.offsetWidth / 2);
        const duration = instant || reduceRef.current ? 0 : 0.8;
        gsap.to(el, { x, duration, ease: "power3.inOut", overwrite: true });
        if (bar.current) {
          gsap.to(bar.current, { scaleX: n > 1 ? i / (n - 1) : 1, duration, ease: "power3.inOut", overwrite: true });
        }
      };

      /** Card index for a pin progress (0…1); the final stretch is a hold on the last card. */
      const indexAt = (progress: number) => {
        const move = moveShare > 0 ? Math.min(1, progress / moveShare) : 0;
        return Math.min(n - 1, Math.round(move * (n - 1)));
      };
      const sync = (progress: number, instant = false) => {
        const i = indexAt(progress);
        const changed = i !== current.current;
        current.current = i;
        if (changed) setActive(i);
        if (changed || instant) show(i, instant);
        // The journey backdrop builds one tower per slide.
        journey.work = n > 1 ? i / (n - 1) : 1;
      };

      const st = ScrollTrigger.create({
        trigger: wrap,
        start: "top top",
        end: () => `+=${Math.round(window.innerHeight * (Math.max(1, n - 1) * PER_SLIDE + HOLD))}`,
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        // No refreshPriority: pins refresh in creation (= page) order, so each
        // one is measured after the spacers of the pins above it.
        onUpdate: (self) => sync(self.progress),
        // Re-centre after resizes and layout shifts (card widths change with the viewport).
        onRefresh: (self) => sync(self.progress, true),
      });
      stRef.current = st;
      sync(st.progress, true);
      setPinned(true);
      // Pins created after this one (e.g. the process rail above) shift where the
      // deck starts; one full refresh once everything has mounted settles that.
      const settle = requestAnimationFrame(() => ScrollTrigger.refresh());

      return () => {
        cancelAnimationFrame(settle);
        st.kill();
        stRef.current = null;
        gsap.set(el, { clearProps: "transform" });
        wrap.style.overflow = "";
        journey.work = -1;
        setPinned(false);
      };
    },
    { scope, dependencies: [n] },
  );

  /** Scroll to the point in the pin where card `i` is shown. */
  const go = (i: number) => {
    const st = stRef.current;
    if (!st) return;
    const at = n > 1 ? i / (n - 1) : 0;
    scrollToTarget(st.start + (st.end - st.start) * moveShare * at + 1);
  };

  // A tap on a peeking neighbour brings it to the centre instead of opening it.
  const onCardClick = (i: number) => (e: MouseEvent) => {
    if (!pinned || i === active) return;
    e.preventDefault();
    go(i);
  };

  return (
    <div
      ref={scope}
      className="no-scrollbar relative flex h-[100svh] snap-x snap-mandatory flex-col justify-center overflow-x-auto pb-5 pt-[calc(var(--header-h)+0.75rem)] lg:pb-8 lg:pt-[calc(var(--header-h)+1.25rem)]"
    >
      {intro && (
        <div className="container-x sticky left-0 mb-4 shrink-0 lg:mb-6">
          <SectionHeading
            intro={intro}
            index={index}
            id={headingId}
            ledeClassName="[@media(max-height:960px)]:sr-only"
          />
        </div>
      )}
      {/* Slides fill whatever height the title and footer leave. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <ul ref={track} className="deck-track relative min-h-0 w-max flex-1 items-center">
          {projects.map((project, i) => (
            <li
              key={project.slug}
              aria-current={pinned && i === active ? "true" : undefined}
              onClickCapture={onCardClick(i)}
              onFocus={() => pinned && i !== active && go(i)}
              className={cn(
                "h-full max-h-[54rem] w-(--deck-w) shrink-0 snap-center transition-opacity duration-700 ease-out-expo",
                pinned && i !== active && "cursor-pointer opacity-50",
              )}
            >
              <DeckCard project={project} index={i} total={n} labels={labels} priority={i === 0} />
            </li>
          ))}
        </ul>

        {/* Arrows on both sides (JS only: they drive the pin, like the scroll does). */}
        {pinned && n > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(active - 1)}
              disabled={active === 0}
              aria-label={prevLabel}
              className={cn(deckArrow, "left-2 lg:left-6")}
            >
              <ArrowLeft aria-hidden="true" className="size-4 lg:size-5" />
            </button>
            <button
              type="button"
              onClick={() => go(active + 1)}
              disabled={active === n - 1}
              aria-label={nextLabel}
              className={cn(deckArrow, "right-2 lg:right-6")}
            >
              <ArrowRight aria-hidden="true" className="size-4 lg:size-5" />
            </button>
          </>
        )}
      </div>

      <div className="container-x mt-5 flex items-center gap-4 lg:mt-7 lg:gap-6 [@media(min-width:64rem)_and_(max-height:780px)]:mt-5">
        <span className="font-mono text-[0.72rem] tabular-nums tracking-[0.14em] text-dim" aria-hidden="true">
          {pad(active + 1)} / {pad(n)}
        </span>
        <span className="relative block h-px flex-1 overflow-hidden bg-line" aria-hidden="true">
          {/* Inline transform, not `scale-x-0`: Tailwind v4 scale utilities set the
              separate `scale` property, which would multiply GSAP's scaleX to 0. */}
          <span ref={bar} className="absolute inset-0 origin-left bg-em" style={{ transform: "scaleX(0)" }} />
        </span>
        <ButtonLink href={cta.href} variant="secondary" external={cta.external} className="shrink-0">
          {cta.label}
        </ButtonLink>
      </div>
    </div>
  );
}
