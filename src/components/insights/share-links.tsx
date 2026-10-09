import { CopyLinkButton } from "@/components/insights/copy-link-button";
import { SocialIcon } from "@/components/ui/social-icon";
import type { SocialPlatform } from "@/lib/schemas";

export type ShareTarget = { platform: Extract<SocialPlatform, "x" | "linkedin">; label: string };

function shareUrl(platform: ShareTarget["platform"], url: string, title: string, via?: string) {
  if (platform === "x") {
    const params = new URLSearchParams({ text: title, url });
    if (via) params.set("via", via);
    return `https://x.com/intent/tweet?${params}`;
  }
  return `https://www.linkedin.com/sharing/share-offsite/?${new URLSearchParams({ url })}`;
}

/** "Share" group: copy link plus plain intent links (no third-party scripts). */
export function ShareLinks({
  id,
  label,
  copyLabel,
  copiedLabel,
  url,
  title,
  via,
  targets,
  className,
}: {
  /** Unique per page — the block can appear twice (rail + end of article). */
  id: string;
  label: string;
  copyLabel: string;
  copiedLabel: string;
  /** Absolute canonical URL. */
  url: string;
  title: string;
  /** X handle without "@". */
  via?: string;
  targets: ShareTarget[];
  className?: string;
}) {
  return (
    <div role="group" aria-labelledby={id} className={className}>
      <p id={id} className="label-mono">
        {label}
      </p>
      <ul className="mt-4 flex flex-wrap items-center gap-2">
        <li>
          <CopyLinkButton url={url} label={copyLabel} copiedLabel={copiedLabel} />
        </li>
        {targets.map((target) => (
          <li key={target.platform}>
            <a
              href={shareUrl(target.platform, url, title, via)}
              target="_blank"
              rel="noopener noreferrer"
              className="grid size-10 place-items-center rounded-full border border-line-strong text-dim transition-colors duration-300 hover:border-em/50 hover:text-ink"
            >
              <SocialIcon platform={target.platform} size={15} />
              <span className="sr-only">
                {label} {target.label}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
