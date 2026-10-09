import Link from "next/link";
import { ArrowSwap } from "@/components/ui/button";
import { SocialIcon } from "@/components/ui/social-icon";
import { Availability } from "@/components/ui/tag";
import { resolveBrand } from "@/lib/brand";
import { getServices, getSettings } from "@/lib/data";
import type { SocialPlatform } from "@/lib/schemas";
import { ConsentSettingsButton } from "./cookie-consent";
import { BackToTop, StudioClock } from "./footer-widgets";
import { Logo } from "./logo";

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
  platform?: SocialPlatform;
}

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div>
      <h2 className="label-mono text-faint">{title}</h2>
      <ul className="mt-5 space-y-3">
        {links.map((link) => (
          <li key={link.href}>
            {link.external ? (
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-2.5 text-[0.95rem] text-dim transition-colors hover:text-hot"
              >
                {link.platform && <SocialIcon platform={link.platform} size={14} className="text-muted group-hover:text-hot" />}
                {link.label}
              </a>
            ) : (
              <Link href={link.href} className="text-[0.95rem] text-dim transition-colors hover:text-hot">
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function SiteFooter() {
  const [settings, services] = await Promise.all([getSettings(), getServices()]);
  const year = new Date().getFullYear();
  const { ui } = settings;

  return (
    <footer id="site-footer" className="relative overflow-hidden border-t border-line bg-bg-2">
      <div aria-hidden="true" className="blueprint fade-y pointer-events-none absolute inset-0 opacity-40" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-48 right-[-10%] size-[42rem] rounded-full bg-em/[0.07] blur-3xl"
      />

      <div className="container-x relative pb-10 pt-20 md:pt-28">
        <div className="grid gap-14 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5">
            <Link href="/" aria-label={`${settings.name} — home`} className="inline-flex">
              <Logo wordmark={settings.wordmark} logo={resolveBrand(settings).logo} />
            </Link>
            <p className="text-h3 mt-8 max-w-md text-ink">{settings.tagline}</p>
            <a
              href={`mailto:${settings.contact.email}`}
              className="group/link mt-8 inline-flex items-center gap-3 font-display text-[clamp(1.25rem,1rem+1vw,1.75rem)] font-medium tracking-[-0.03em] text-ink transition-colors hover:text-hot"
            >
              {settings.contact.email}
              <ArrowSwap trigger="link" className="size-5" />
            </a>
            <div className="mt-8">
              <Availability availability={settings.availability} />
            </div>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:col-span-7 lg:justify-items-end">
            <FooterColumn
              title={ui.servicesTitle}
              links={services.map((s) => ({ label: s.title, href: `/services/${s.slug}` }))}
            />
            {settings.navigation.footer.map((group) => (
              <FooterColumn key={group.title} title={group.title} links={group.links} />
            ))}
            {settings.socials.length > 0 && (
              <FooterColumn
                title={ui.connectTitle}
                links={settings.socials.map((s) => ({ label: s.label, href: s.url, external: true, platform: s.platform }))}
              />
            )}
          </nav>
        </div>

        <p
          aria-hidden="true"
          className="mt-20 select-none whitespace-nowrap text-center font-display text-[clamp(3.5rem,19.6vw,21rem)] font-semibold leading-[0.78] tracking-[-0.075em] md:mt-28"
          data-reveal=""
        >
          <span className="-mr-[0.06em] bg-[linear-gradient(180deg,rgb(240_244_247/0.14),rgb(240_244_247/0.02)_85%)] bg-clip-text pr-[0.06em] text-transparent">
            {settings.wordmark}
          </span>
        </p>

        <div className="mt-10 flex flex-col gap-6 border-t border-line pt-8 text-sm md:flex-row md:items-center md:justify-between">
          <p className="text-muted">
            © {year} {settings.legalName}. {ui.rights}
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {settings.navigation.legal.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-muted transition-colors hover:text-hot">
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <ConsentSettingsButton label={settings.consent.settings} />
            </li>
          </ul>
          <div className="flex items-center justify-between gap-6 md:justify-end">
            {settings.location.timezone ? (
              <StudioClock timezone={settings.location.timezone} label={ui.localTime} />
            ) : (
              <p className="font-mono text-xs text-muted">{settings.location.label}</p>
            )}
            <BackToTop label={ui.backToTop} />
          </div>
        </div>
      </div>
    </footer>
  );
}
