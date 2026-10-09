"use client";

import type { CSSProperties, ReactNode } from "react";
import { AppWindow, Eye, Lock, PanelTop, Share2, Smartphone, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { Logo, LogoMark } from "@/components/layout/logo";
import { iconTileStyle, RENDERABLE_IMAGE, resolveBrand, type BrandAssetName, type IconTileStyle } from "@/lib/brand";
import type { Brand } from "@/lib/schemas/settings";
import { cn } from "@/lib/utils";
import { DocEditor, type DocEditorProps } from "./doc-editor";
import { isRecord, type Raw } from "./form/schema-utils";

/* ─────────────────────────────────────────────────────────────
   Branding: the settings editor focused on `brand`, with a live
   preview of each place the brand shows (the site header, a
   browser tab, phone home screens, a social card). The preview
   follows the form as you type, before anything is saved, using
   the same rules as the icon route (lib/brand.ts).
   ───────────────────────────────────────────────────────────── */

export function BrandingEditor(props: Omit<DocEditorProps, "preview">) {
  return <DocEditor {...props} refreshOnSave preview={(value) => <BrandPreview value={value} />} />;
}

/** The built-in icons (public/icons), shown while no custom icon is set. */
const DEFAULT_ICON = "/icons/icon-192.png";
const DEFAULT_MASKABLE = "/icons/maskable-512.png";

/** Header logo cap: the site header's bar height minus its padding (globals.css --header-h). */
const HEADER_CAP = { desktop: 56, phone: 44 };

const text = (value: unknown, fallback: string) => (typeof value === "string" && value.trim() ? value.trim() : fallback);

function hostOf(url: unknown): string {
  try {
    return new URL(String(url)).host;
  } catch {
    return "yoursite.com";
  }
}

/** True when dark text reads better than white on this colour (WCAG relative luminance). */
function isLight(hex: string): boolean {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179;
}

/** The custom icon when the icon route can use it (it can't draw WebP or AVIF). */
const usableIcon = (brand: Brand) => (brand.app.icon && RENDERABLE_IMAGE.test(brand.app.icon.src) ? brand.app.icon : null);

/** Things worth knowing about the current choices, in plain words. */
function brandNotes(brand: Brand): string[] {
  const { logo, app } = brand;
  const notes: string[] = [];
  if (logo.style === "logo-only" && !logo.image) {
    notes.push("“Logo only” needs an image. Until you pick one, the site shows the grid mark and the name.");
  }
  if (logo.image && !RENDERABLE_IMAGE.test(logo.image.src)) {
    notes.push("Social cards can't draw WebP or AVIF, so they keep the grid mark. An SVG, PNG or JPG logo shows there too.");
  }
  if (logo.image && logo.height > HEADER_CAP.desktop) {
    notes.push(`The header fits the logo inside its bar: up to ${HEADER_CAP.desktop} px tall (${HEADER_CAP.phone} px on phones). The footer uses the full ${logo.height} px.`);
  }
  if (app.icon && !usableIcon(brand)) {
    notes.push("Icons can't be made from WebP or AVIF, so the built-in icon stays. Pick a PNG or SVG.");
  } else if (app.icon && app.icon.width > 0 && app.icon.height > 0) {
    const { width, height } = app.icon;
    if (width !== height) notes.push(`The icon isn't square (${width} × ${height}): it's fitted inside, with space at the sides.`);
    else if (width < 512) notes.push(`The icon is ${width} × ${height}. At 512 × 512 or larger it stays sharp on every screen.`);
  }
  return notes;
}

function BrandPreview({ value }: { value: Raw }) {
  const brand = resolveBrand(value);
  const wordmark = text(value.wordmark, "Your site");
  const name = text(value.name, wordmark);
  const seo = isRecord(value.seo) ? value.seo : {};
  const navigation = isRecord(value.navigation) ? value.navigation : {};
  const links = (Array.isArray(navigation.primary) ? navigation.primary : [])
    .map((link) => (isRecord(link) ? text(link.label, "") : ""))
    .filter(Boolean)
    .slice(0, 4);
  const cta = isRecord(navigation.cta) ? text(navigation.cta.label, "Contact") : "Contact";
  const notes = brandNotes(brand);

  return (
    <section aria-labelledby="brand-preview-title" className="card animate-rise-in overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-5 py-3.5 sm:px-6">
        <h2 id="brand-preview-title" className="flex items-center gap-2 font-display text-[1.05rem] font-medium tracking-[-0.015em] text-ink">
          <Eye className="size-4 text-em" aria-hidden="true" /> Live preview
        </h2>
        <p className="text-[0.76rem] text-faint">Follows the form as you edit. Nothing changes on the site until you save.</p>
      </header>

      <div className="grid gap-px bg-line md:grid-cols-2">
        <Stage label="Site header" icon={PanelTop} className="md:col-span-2">
          <HeaderMock brand={brand} wordmark={wordmark} links={links} cta={cta} />
        </Stage>
        <Stage label="Browser" icon={AppWindow}>
          <BrowserMock brand={brand} title={text(seo.defaultTitle, name)} host={hostOf(value.url)} />
        </Stage>
        <Stage label="Home screen" icon={Smartphone}>
          <HomeScreenMock brand={brand} name={name} />
        </Stage>
        <Stage label="Social card" icon={Share2} className="md:col-span-2">
          <SocialMock brand={brand} wordmark={wordmark} host={hostOf(value.url)} />
        </Stage>
      </div>

      {notes.length > 0 && (
        <ul className="space-y-1.5 border-t border-line bg-warn/[0.04] px-5 py-3.5 sm:px-6" aria-label="Notes">
          {notes.map((note) => (
            <li key={note} className="flex items-start gap-2.5 text-[0.8rem] leading-relaxed text-dim">
              <TriangleAlert className="mt-[0.2rem] size-3.5 shrink-0 text-warn" aria-hidden="true" />
              {note}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Stage({ label, icon: Icon, className, children }: { label: string; icon: LucideIcon; className?: string; children: ReactNode }) {
  return (
    <figure className={cn("min-w-0 bg-bg-2/95 p-4 sm:p-5", className)}>
      <figcaption className="label-mono mb-3 flex items-center gap-2 text-[0.62rem] text-faint">
        <Icon className="size-3.5 text-em" aria-hidden="true" />
        {label}
      </figcaption>
      {children}
    </figure>
  );
}

/* ── Header ───────────────────────────────────────────────── */

function HeaderMock({ brand, wordmark, links, cta }: { brand: Brand; wordmark: string; links: string[]; cta: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-bg">
      <div aria-hidden="true" className="blueprint fade-radial absolute inset-0 opacity-50 [--grid-size:2.5rem]" />
      <div className="relative flex h-20 items-center justify-between gap-4 px-5">
        <Logo wordmark={wordmark} logo={brand.logo} className="min-w-0 [&_img]:max-h-14" />
        {links.length > 0 && (
          <div aria-hidden="true" className="hidden items-center gap-1 rounded-full border border-line bg-white/[0.025] p-1 lg:flex">
            {links.map((link, i) => (
              <span key={link} className={cn("rounded-full px-3 py-1.5 text-[0.74rem]", i === 0 ? "bg-white/[0.08] text-ink" : "text-dim")}>
                {link}
              </span>
            ))}
          </div>
        )}
        <span aria-hidden="true" className="hidden shrink-0 rounded-full bg-em px-3.5 py-2 text-[0.74rem] font-medium text-bg sm:inline-block">
          {cta}
        </span>
      </div>
    </div>
  );
}

/* ── Icons ────────────────────────────────────────────────── */

/**
 * One icon as the browser or phone shows it. `tile` null: the built-in file,
 * drawn as it is. `mask`: the shape the OS cuts it to.
 */
function IconTile({ src, tile, size, mask = "none" }: { src: string; tile: IconTileStyle | null; size: number; mask?: "none" | "ios" | "circle" }) {
  const inner = Math.round(size * (1 - 2 * (tile?.inset ?? 0)));
  const radius = mask === "circle" ? "50%" : mask === "ios" ? "22.5%" : `${Math.round((tile?.radius ?? 0) * 100)}%`;
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden"
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: tile?.background ?? "transparent" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a preview of any uploaded format */}
      <img src={src} alt="" width={inner} height={inner} className="object-contain" style={{ width: inner, height: inner }} />
    </span>
  );
}

/** The icon for one file, the way the icon route will render it. */
function iconFor(brand: Brand, name: BrandAssetName): { src: string; tile: IconTileStyle | null } {
  const icon = usableIcon(brand);
  if (!icon) return { src: name === "maskable-512.png" ? DEFAULT_MASKABLE : DEFAULT_ICON, tile: null };
  return { src: icon.src, tile: iconTileStyle(name, brand) };
}

function BrowserMock({ brand, title, host }: { brand: Brand; title: string; host: string }) {
  const favicon = iconFor(brand, "icon-32.png");
  const theme = brand.app.themeColor;
  const light = isLight(theme);
  const bar: CSSProperties = { backgroundColor: theme, color: light ? "#111418" : "#f4f6f8" };
  return (
    <div className="space-y-3">
      {/* Desktop: the tab and its favicon. */}
      <div aria-hidden="true" className="overflow-hidden rounded-xl border border-line bg-[#1f2124]">
        <div className="flex items-end gap-2 px-2 pt-2">
          <div className="flex h-8 min-w-0 max-w-[15rem] flex-1 items-center gap-2 rounded-t-lg bg-[#35363a] px-3">
            <IconTile {...favicon} size={16} />
            <span className="min-w-0 flex-1 truncate text-[0.72rem] text-[#e8eaed]">{title}</span>
            <X className="size-3 shrink-0 text-[#9aa0a6]" />
          </div>
        </div>
        <div className="bg-[#35363a] px-2.5 py-2">
          <span className="flex h-7 items-center gap-2 rounded-full bg-[#1f2124] px-3 text-[0.7rem] text-[#bdc1c6]">
            <Lock className="size-3 shrink-0" />
            <span className="truncate">{host}</span>
          </span>
        </div>
      </div>
      {/* Phone: the browser bar takes the browser colour. */}
      <div aria-hidden="true" className="overflow-hidden rounded-xl border border-line" style={bar}>
        <div className="flex items-center justify-between px-3.5 pt-2 font-mono text-[0.6rem] font-medium opacity-80">
          <span>9:41</span>
          <span className="tracking-[0.2em]">●●●</span>
        </div>
        <div className="px-2.5 pb-2.5 pt-1.5">
          <span
            className="flex h-7 items-center gap-2 rounded-full px-3 text-[0.7rem]"
            style={{ backgroundColor: light ? "rgb(0 0 0 / 0.08)" : "rgb(255 255 255 / 0.1)" }}
          >
            <Lock className="size-3 shrink-0 opacity-70" />
            <span className="truncate">{host}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function HomeScreenMock({ brand, name }: { brand: Brand; name: string }) {
  const apps: { label: string; file: BrandAssetName; mask: "ios" | "circle" }[] = [
    { label: "iPhone", file: "apple-icon.png", mask: "ios" },
    { label: "Android", file: "maskable-512.png", mask: "circle" },
  ];
  return (
    <div
      aria-hidden="true"
      className="grid h-full min-h-[10.5rem] grid-cols-2 place-items-center gap-4 rounded-xl border border-line bg-[radial-gradient(120%_90%_at_15%_0%,#1d3b4f_0%,transparent_55%),radial-gradient(90%_80%_at_100%_100%,#123d2c_0%,transparent_60%),#090d12] p-5"
    >
      {apps.map(({ label, file, mask }) => (
        <div key={label} className="flex min-w-0 flex-col items-center gap-2">
          <span className="shadow-[0_10px_24px_-10px_rgb(0_0_0/0.8)]" style={{ borderRadius: mask === "circle" ? "50%" : "22.5%" }}>
            <IconTile {...iconFor(brand, file)} size={60} mask={mask} />
          </span>
          <span className="max-w-[5.5rem] truncate text-[0.7rem] font-medium text-white/90">{name}</span>
          <span className="font-mono text-[0.56rem] uppercase tracking-[0.14em] text-white/45">{label}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Social card ──────────────────────────────────────────── */

/** The Open Graph card (src/lib/seo/og.tsx) in miniature: sizes are shares of its 1200 px width. */
function SocialMock({ brand, wordmark, host }: { brand: Brand; wordmark: string; host: string }) {
  const image = brand.logo.image && RENDERABLE_IMAGE.test(brand.logo.image.src) ? brand.logo.image : null;
  const alone = !!image && brand.logo.style === "logo-only";
  const cq = (px: number) => `${((px / 1200) * 100).toFixed(3)}cqw`;
  return (
    <div
      aria-hidden="true"
      className="relative aspect-[1200/630] w-full overflow-hidden rounded-xl border border-line [container-type:inline-size]"
      style={{
        backgroundColor: "#04070a",
        backgroundImage:
          "radial-gradient(ellipse 70% 60% at 85% 110%, rgba(60,228,154,0.28), transparent 70%), radial-gradient(ellipse 50% 40% at 10% -10%, rgba(60,228,154,0.10), transparent 70%)",
      }}
    >
      <div className="blueprint absolute inset-0 opacity-60" style={{ "--grid-size": cq(112) } as CSSProperties} />
      <div className="relative flex h-full flex-col justify-between" style={{ padding: `${cq(64)} ${cq(72)}` }}>
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center text-ink" style={{ gap: cq(14) }}>
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element -- a preview of any uploaded format
              <img
                src={image.src}
                alt=""
                className="block object-contain"
                style={{ height: cq(alone ? 52 : 40), width: "auto", maxWidth: cq(alone ? 520 : 160) }}
              />
            ) : (
              <span className="block" style={{ width: cq(34), height: cq(34) }}>
                <LogoMark className="size-full" />
              </span>
            )}
            {!alone && (
              <span className="font-display font-semibold leading-none" style={{ fontSize: cq(30), letterSpacing: cq(-1.4) }}>
                {wordmark}
              </span>
            )}
          </div>
          <span
            className="flex items-center rounded-full border border-em/35 bg-em/[0.08] font-mono uppercase text-em"
            style={{ gap: cq(10), padding: `${cq(8)} ${cq(16)}`, fontSize: cq(16), letterSpacing: cq(2) }}
          >
            <span className="rounded-full bg-em" style={{ width: cq(8), height: cq(8) }} />
            Case study
          </span>
        </div>
        <p className="max-w-[83%] font-display font-medium text-ink" style={{ fontSize: cq(70), lineHeight: 1.02, letterSpacing: cq(-2.8) }}>
          Every page shares <span className="em-serif">one branded card</span>
        </p>
        <div
          className="flex items-center justify-between border-t font-mono text-[#8a9aaa]"
          style={{ borderColor: "rgba(140,170,190,0.18)", paddingTop: cq(24), fontSize: cq(18), letterSpacing: cq(1) }}
        >
          <span>{host}</span>
          <span className="flex items-end" style={{ gap: cq(6), height: cq(34) }}>
            {[10, 16, 13, 22, 19, 28, 34].map((h, i) => (
              <span key={i} className="block rounded-[2px]" style={{ width: cq(8), height: cq(h), backgroundColor: i === 6 ? "#3ce49a" : "rgba(60,228,154,0.35)" }} />
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
