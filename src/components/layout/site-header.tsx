"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { SocialIcon } from "@/components/ui/social-icon";
import { Availability } from "@/components/ui/tag";
import type { Brand, Link as NavLink, Settings } from "@/lib/schemas";
import { cn, interpolate, pad } from "@/lib/utils";
import { Logo } from "./logo";
import { getLenis } from "./smooth-scroll";
import { useReducedMotionSafe } from "@/hooks/use-media-query";

interface SiteHeaderProps {
  /** Site settings › Name: {name} in the logo link's screen-reader name. */
  name: string;
  wordmark: string;
  /** Studio › Branding › Logo (the default: the grid mark beside the wordmark). */
  logo: Brand["logo"];
  primary: NavLink[];
  cta: NavLink;
  email: string;
  socials: Settings["socials"];
  availability: Settings["availability"];
  ui: Settings["ui"];
}

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];
const EASE_IN_OUT: [number, number, number, number] = [0.76, 0, 0.24, 1];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader({ name, wordmark, logo, primary, cta, email, socials, availability, ui }: SiteHeaderProps) {
  const pathname = usePathname();
  // The menu remembers the path it was opened on, so navigating closes it
  // without a state-syncing effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  const activeHref = primary.find((l) => isActive(pathname, l.href))?.href ?? null;

  // Glass background once scrolled; hide on scroll down, reveal on scroll up.
  useEffect(() => {
    let lastY = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      setScrolled(y > 24);
      if (y > 360 && y > lastY + 4) setHidden(true);
      else if (y < lastY - 4 || y <= 360) setHidden(false);
      lastY = y;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  // While the menu is open: lock scroll, make everything outside the header
  // inert (so Tab only reaches the visible logo, toggle and menu), close on Esc.
  useEffect(() => {
    if (!open) return;
    const lenis = getLenis();
    lenis?.stop();
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = "hidden";
    const header = headerRef.current;
    const inertTargets = Array.from(document.body.children).filter(
      (el) => !(header && el.contains(header)) && !el.hasAttribute("inert"),
    );
    inertTargets.forEach((el) => el.setAttribute("inert", ""));
    const toggle = toggleRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpenOn(null);
      setHidden(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      lenis?.start();
      html.style.overflow = previous;
      inertTargets.forEach((el) => el.removeAttribute("inert"));
      window.removeEventListener("keydown", onKey);
      toggle?.focus({ preventScroll: true });
    };
  }, [open]);

  return (
    <header
      ref={headerRef}
      // Never leave keyboard focus on an off-screen control (e.g. the toggle
      // after Esc closes the menu mid-page): focusing inside reveals the bar.
      onFocus={() => setHidden(false)}
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-transform duration-500 ease-out-expo",
        hidden && !open && "-translate-y-full",
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0 border-b bg-bg/70 backdrop-blur-xl backdrop-saturate-150 transition-[opacity,border-color] duration-500 lite:bg-bg/95",
          scrolled || open ? "border-line opacity-100" : "border-transparent opacity-0",
        )}
      />
      <div className="container-x relative flex h-[var(--header-h)] items-center justify-between gap-6">
        <Link href="/" aria-label={interpolate(ui.homeLinkLabel, { name })} className="relative z-10 -m-2 rounded-full p-2">
          <Logo wordmark={wordmark} logo={logo} className="[&_img]:max-h-[calc(var(--header-h)-1.5rem)]" />
        </Link>

        <nav aria-label={ui.primaryNavLabel} className="absolute left-1/2 hidden -translate-x-1/2 lg:block">
          <ul
            className="flex items-center gap-1 rounded-full border border-line bg-white/[0.025] p-1 backdrop-blur-md"
            onMouseLeave={() => setHovered(null)}
          >
            {primary.map((link) => {
              const active = link.href === activeHref;
              const showPill = (hovered ?? activeHref) === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    onMouseEnter={() => setHovered(link.href)}
                    onFocus={() => setHovered(link.href)}
                    onBlur={() => setHovered(null)}
                    className={cn(
                      "relative isolate block rounded-full px-4 py-2 text-sm transition-colors duration-300",
                      active || showPill ? "text-ink" : "text-dim hover:text-ink",
                    )}
                  >
                    {showPill && (
                      <motion.span
                        layoutId="nav-pill"
                        aria-hidden="true"
                        className="absolute inset-0 -z-10 rounded-full bg-white/[0.08]"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      />
                    )}
                    {link.label}
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute bottom-[3px] left-1/2 size-1 -translate-x-1/2 rounded-full bg-em"
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="relative z-10 flex items-center gap-3">
          <ButtonLink href={cta.href} size="md" className="hidden sm:inline-flex">
            {cta.label}
          </ButtonLink>
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? ui.closeMenu : ui.openMenu}
            onClick={() => {
              setOpenOn(open ? null : pathname);
              setHidden(false);
            }}
            className="grid size-11 place-items-center rounded-full border border-line-strong bg-white/[0.03] backdrop-blur-md transition-colors hover:border-em/60 lg:hidden"
          >
            <span aria-hidden="true" className="relative block h-3 w-5">
              <span
                className={cn(
                  "absolute left-0 top-0 h-[1.5px] w-full rounded-full bg-ink transition-transform duration-500 ease-out-expo",
                  open && "translate-y-[5.25px] rotate-45",
                )}
              />
              <span
                className={cn(
                  "absolute bottom-0 left-0 h-[1.5px] w-full rounded-full bg-ink transition-transform duration-500 ease-out-expo",
                  open && "-translate-y-[5.25px] -rotate-45",
                )}
              />
            </span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <MobileMenu
            primary={primary}
            cta={cta}
            email={email}
            socials={socials}
            availability={availability}
            ui={ui}
            activeHref={activeHref}
            onNavigate={() => setOpenOn(null)}
          />
        )}
      </AnimatePresence>
    </header>
  );
}

function MobileMenu({
  primary,
  cta,
  email,
  socials,
  availability,
  ui,
  activeHref,
  onNavigate,
}: Omit<SiteHeaderProps, "name" | "wordmark" | "logo"> & { activeHref: string | null; onNavigate: () => void }) {
  const reduce = useReducedMotionSafe();
  const firstLink = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    firstLink.current?.focus({ preventScroll: true });
  }, []);

  return (
    <motion.div
      id="mobile-menu"
      className="fixed inset-0 -z-10 flex flex-col overflow-y-auto bg-bg pt-[var(--header-h)] lg:hidden"
      initial={{ clipPath: "inset(0% 0% 100% 0%)" }}
      animate={{ clipPath: "inset(0% 0% 0% 0%)" }}
      exit={{ clipPath: "inset(0% 0% 100% 0%)" }}
      transition={{ duration: reduce ? 0 : 0.75, ease: EASE_IN_OUT }}
      data-lenis-prevent=""
    >
      <div aria-hidden="true" className="blueprint fade-radial pointer-events-none absolute inset-0 opacity-60" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-em/10 blur-3xl"
      />

      <nav aria-label={ui.menu} className="container-x relative flex-1 pt-6">
        <p className="label-mono mb-4 text-faint">{ui.menu}</p>
        <ul>
          {primary.map((link, i) => (
            <li key={link.href} className="overflow-hidden border-b border-line">
              <motion.div
                initial={{ y: reduce ? 0 : "105%" }}
                animate={{ y: 0 }}
                exit={{ y: reduce ? 0 : "105%", transition: { duration: 0.35, ease: EASE_IN_OUT } }}
                transition={{ delay: 0.18 + i * 0.06, duration: 0.9, ease: EASE_OUT }}
              >
                <Link
                  ref={i === 0 ? firstLink : undefined}
                  href={link.href}
                  onClick={onNavigate}
                  aria-current={link.href === activeHref ? "page" : undefined}
                  className="group flex items-baseline justify-between gap-4 py-5 font-display text-[clamp(2.4rem,11vw,4rem)] font-medium leading-none tracking-[-0.045em] text-ink transition-colors aria-[current=page]:text-em"
                >
                  <span className="transition-transform duration-500 ease-out-expo group-hover:translate-x-2">
                    {link.label}
                  </span>
                  <span className="label-mono text-faint">{pad(i + 1)}</span>
                </Link>
              </motion.div>
            </li>
          ))}
        </ul>
      </nav>

      <motion.div
        className="container-x relative pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-10"
        initial={{ opacity: 0, y: reduce ? 0 : 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, transition: { duration: 0.2 } }}
        transition={{ delay: 0.45, duration: 0.7, ease: EASE_OUT }}
      >
        <ButtonLink href={cta.href} size="lg" onClick={onNavigate} className="w-full justify-between">
          {cta.label}
        </ButtonLink>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-5">
          <a href={`mailto:${email}`} className="text-dim transition-colors hover:text-hot">
            {email}
          </a>
          <ul className="flex gap-2">
            {socials.map((s) => (
              <li key={s.platform}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="grid size-10 place-items-center rounded-full border border-line text-dim transition-colors hover:border-em/50 hover:text-hot"
                >
                  <SocialIcon platform={s.platform} size={16} />
                </a>
              </li>
            ))}
          </ul>
        </div>
        <Availability availability={availability} className="mt-6" />
      </motion.div>
    </motion.div>
  );
}
