"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Check, Download, FileCode, FileImage, Link2, Mail, MessageCircle, Printer, Share2, UserPlus } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import { CARD_SIZE, type CardSide } from "@/lib/cards/render";
import { cn } from "@/lib/utils";
import { trackCard } from "./card-tracker";

/* ─────────────────────────────────────────────────────────────
   What you can do with a card: save the contact, share the link
   (the phone's own share sheet where there is one), copy it,
   send it on WhatsApp or by email, and download the artwork.

   SVG downloads are the print files the server renders (fonts
   embedded, 3.5 × 2 in). PNGs are drawn from those same files in
   the browser at 2× (2100 × 1200), so both always match the card
   on screen. Everything but PNG works without JavaScript.
   ───────────────────────────────────────────────────────────── */

export interface CardActionLabels {
  saveContact: string;
  share: string;
  copyLink: string;
  copied: string;
  whatsapp: string;
  email: string;
  download: string;
  downloadHint: string;
  preparing: string;
  front: string;
  back: string;
  /** The print sheet button; a default is used until the page copy has one. */
  print?: string;
}

export interface CardActionsProps {
  slug: string;
  /** Absolute URL of the card page. */
  url: string;
  /** Share sheet title and the text that travels with the link. */
  title: string;
  text: string;
  files: { front: string; back: string; contact: string; print: string };
  labels: CardActionLabels;
  /** "compact": icon buttons for the list page; "full": the card page's panel. */
  variant?: "full" | "compact";
  className?: string;
}

const PNG_SCALE = 2;

function save(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href, download: filename });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/** The print SVG, drawn onto a canvas at 2×: a PNG that matches the download exactly. */
async function svgToPng(src: string): Promise<Blob> {
  const response = await fetch(src, { cache: "no-store" });
  if (!response.ok) throw new Error(`Couldn't load ${src}`);
  const width = CARD_SIZE.width * PNG_SCALE;
  const height = CARD_SIZE.height * PNG_SCALE;
  // Pixel size instead of inches, so every browser rasterises at full resolution.
  const markup = (await response.text()).replace(/width="3\.5in" height="2in"/, `width="${width}" height="${height}"`);
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = Object.assign(document.createElement("canvas"), { width, height });
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("PNG encoding failed");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const actionClasses =
  "group/act inline-flex h-12 items-center justify-center gap-2.5 rounded-full border border-line-strong bg-white/[0.03] px-5 text-[0.92rem] font-medium text-ink backdrop-blur-sm transition-[background-color,border-color,color,transform] duration-300 hover:border-em/60 hover:bg-em/[0.07] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60";

const iconClasses = "size-4 shrink-0 text-em transition-transform duration-300 group-hover/act:scale-110";

function Action({
  icon: Icon,
  children,
  className,
  href,
  download,
  target,
  rel,
  onClick,
  disabled,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  children: ReactNode;
  className?: string;
  href?: string;
  download?: string | boolean;
  target?: string;
  rel?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const content = (
    <>
      <Icon className={iconClasses} aria-hidden="true" />
      <span className="truncate">{children}</span>
    </>
  );
  if (href) {
    return (
      <a href={href} download={download} target={target} rel={rel} onClick={onClick} className={cn(actionClasses, className)}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn(actionClasses, className)}>
      {content}
    </button>
  );
}

export function CardActions({ slug, url, title, text, files, labels, variant = "full", className }: CardActionsProps) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<CardSide | null>(null);
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async (tracked = true) => {
    if (await copyText(url)) {
      if (tracked) trackCard("card_copy_link", slug);
      setCopied(true);
      setStatus(labels.copied);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2200);
    }
  };

  const share = async () => {
    trackCard("card_share", slug);
    // The phone's share sheet where there is one (most phones, some desktops); else copy the link.
    if (typeof navigator.share !== "function") return copy(false);
    try {
      await navigator.share({ title, text, url });
    } catch (error) {
      // Closing the sheet isn't a failure; anything else falls back to copying.
      if ((error as DOMException)?.name !== "AbortError") await copy(false);
    }
  };

  const png = async (side: CardSide) => {
    trackCard("card_download", slug, { side, format: "png" });
    setBusy(side);
    setStatus(labels.preparing);
    try {
      save(await svgToPng(files[side]), `${slug}-${side}.png`);
      setStatus("");
    } catch {
      // A browser that can't draw it gets the SVG instead.
      window.location.assign(files[side]);
    } finally {
      setBusy(null);
    }
  };

  const message = `${text}\n${url}`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const email = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(message)}`;

  if (variant === "compact") {
    const icon =
      "grid size-11 place-items-center rounded-full border border-line-strong text-dim transition-[border-color,color,background-color] duration-300 hover:border-em/60 hover:bg-em/[0.07] hover:text-ink";
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <a
          href={files.contact}
          download={`${slug}.vcf`}
          onClick={() => trackCard("card_save_contact", slug)}
          className={icon}
          aria-label={labels.saveContact}
          title={labels.saveContact}
        >
          <UserPlus className="size-4" aria-hidden="true" />
        </a>
        <button type="button" onClick={share} className={icon} aria-label={labels.share} title={labels.share}>
          {copied ? <Check className="size-4 text-em" aria-hidden="true" /> : <Share2 className="size-4" aria-hidden="true" />}
        </button>
        <span role="status" className="sr-only">
          {copied ? labels.copied : ""}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <a
          href={files.contact}
          download={`${slug}.vcf`}
          onClick={() => trackCard("card_save_contact", slug)}
          className="group/act inline-flex h-12 items-center justify-center gap-2.5 rounded-full bg-em px-5 text-[0.95rem] font-medium text-bg shadow-[0_0_0_1px_rgb(60_228_154/0.35),0_14px_40px_-14px_rgb(60_228_154/0.7)] transition-[background-color,box-shadow,transform] duration-300 hover:bg-hot active:scale-[0.98] sm:col-span-2"
        >
          <UserPlus className="size-[1.1rem] transition-transform duration-300 group-hover/act:scale-110" aria-hidden="true" />
          {labels.saveContact}
        </a>
        <Action icon={Share2} onClick={share}>
          {labels.share}
        </Action>
        <Action icon={copied ? Check : Link2} onClick={() => copy()}>
          {copied ? labels.copied : labels.copyLink}
        </Action>
        <Action icon={MessageCircle} href={whatsapp} target="_blank" rel="noopener noreferrer" onClick={() => trackCard("card_whatsapp", slug)}>
          {labels.whatsapp}
        </Action>
        <Action icon={Mail} href={email} onClick={() => trackCard("card_email", slug)}>
          {labels.email}
        </Action>
      </div>

      <div>
        <p className="label-mono flex items-center gap-2">
          <Download className="size-3.5 text-em" aria-hidden="true" />
          {labels.download}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {(["front", "back"] as const).map((side) => (
            <Action key={`png-${side}`} icon={FileImage} onClick={() => png(side)} disabled={busy !== null} className="h-11 text-[0.86rem]">
              {busy === side ? labels.preparing : `${labels[side]} · PNG`}
            </Action>
          ))}
          {(["front", "back"] as const).map((side) => (
            <Action
              key={`svg-${side}`}
              icon={FileCode}
              href={files[side]}
              download={`${slug}-${side}.svg`}
              onClick={() => trackCard("card_download", slug, { side, format: "svg" })}
              className="h-11 text-[0.86rem]"
            >
              {`${labels[side]} · SVG`}
            </Action>
          ))}
          <Action
            icon={Printer}
            href={files.print}
            target="_blank"
            rel="noopener"
            onClick={() => trackCard("card_print", slug)}
            className="col-span-2 h-11 text-[0.86rem]"
          >
            {labels.print ?? "Print-ready PDF (with bleed)"}
          </Action>
        </div>
        <p className="mt-3 text-[0.8rem] leading-relaxed text-muted">{labels.downloadHint}</p>
      </div>

      <span role="status" className="sr-only">
        {status}
      </span>
    </div>
  );
}
