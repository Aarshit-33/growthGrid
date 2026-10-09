import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { ContactForm } from "@/components/contact/contact-form";
import { FaqSection } from "@/components/sections/faq-section";
import { PageHero } from "@/components/sections/page-hero";
import { JsonLd } from "@/components/seo/json-ld";
import { Stage } from "@/components/three/lazy";
import { SceneSlot } from "@/components/three/slot";
import { ButtonLink } from "@/components/ui/button";
import { InlineText } from "@/components/ui/rich-text";
import { SocialIcon } from "@/components/ui/social-icon";
import { Availability } from "@/components/ui/tag";
import { getFaqs, getPage, getServices, getSettings } from "@/lib/data";
import { buildMetadata } from "@/lib/seo/metadata";
import { contactSchema } from "@/lib/seo/schema";
import { pad } from "@/lib/utils";
import { headingText } from "@/lib/utils/text";

export async function generateMetadata(): Promise<Metadata> {
  const [settings, page] = await Promise.all([getSettings(), getPage("contact")]);
  return buildMetadata({ settings, seo: page.seo, path: "/contact" });
}

export default async function ContactPage() {
  const [settings, page, services, faqs, servicesPage] = await Promise.all([
    getSettings(),
    getPage("contact"),
    getServices(),
    getFaqs("contact"),
    getPage("services"),
  ]);
  const { form, details, steps } = page;
  const email = settings.contact.email;

  return (
    <>
      {/* Shared WebGL stage for the conversation scene (lazy, client-only). */}
      <Stage />

      <PageHero
        eyebrow={page.hero.eyebrow}
        headline={page.hero.headline}
        lede={page.hero.lede}
        breadcrumbs={[
          { label: settings.ui.home, href: "/" },
          { label: page.hero.eyebrow, href: "/contact" },
        ]}
        className="md:pb-16"
        aside={
          /* The conversation: two glass speech bubbles take turns over the grid
             (decorative). Transparent so the shared canvas beneath shows through. */
          <div className="relative aspect-[5/4] overflow-hidden rounded-card border border-line sm:aspect-[16/10] lg:aspect-[4/5]">
            <SceneSlot
              scene={{ id: "connect" }}
              fallback={
                <>
                  <div className="blueprint fade-radial absolute inset-0 opacity-60 [--grid-size:2rem]" />
                  <div className="absolute left-[12%] top-[26%] h-[17%] w-[46%] rounded-xl border border-em/35 bg-em/[0.04]" />
                  <div className="absolute right-[12%] top-[52%] flex h-[17%] w-[46%] items-center justify-center gap-2 rounded-xl border border-em/60 bg-em/[0.06] shadow-[0_0_40px_-8px_rgb(60_228_154/0.6)]">
                    <span className="size-2 rounded-full bg-em/80" />
                    <span className="size-2 rounded-full bg-em/60" />
                    <span className="size-2 rounded-full bg-em/40" />
                  </div>
                </>
              }
            />
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
          <Availability availability={settings.availability} />
          <ButtonLink href={`mailto:${email}`} variant="secondary" size="lg" external={false}>
            {email}
          </ButtonLink>
        </div>
      </PageHero>

      <section aria-label={form.heading} className="relative pb-[var(--section-y)]">
        <div className="container-x">
          {/* No-JS results: the API redirects here with one of these fragments. */}
          <div
            id="enquiry-sent"
            role="status"
            className="mb-6 hidden scroll-mt-32 rounded-panel border border-em/40 bg-em/[0.07] p-6 target:block sm:p-8"
          >
            <p className="text-h4 text-ink">{form.successTitle}</p>
            <p className="mt-2 text-dim">{form.successMessage}</p>
          </div>
          <div
            id="enquiry-failed"
            role="alert"
            className="mb-6 hidden scroll-mt-32 rounded-panel border border-danger/40 bg-danger/[0.07] p-6 target:block sm:p-8"
          >
            <p className="text-ink">
              {form.errorMessage}{" "}
              <a href={`mailto:${email}`} className="font-medium text-em underline underline-offset-4">
                {email}
              </a>
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
            <div className="min-w-0 lg:col-span-8" data-reveal="">
              <ContactForm
                labels={form}
                services={services.map((service) => service.title)}
                plans={servicesPage.aftercare.plans.items.map((plan) => plan.name)}
                email={email}
                privacyNote={<InlineText text={form.privacyNote} />}
              />
            </div>

            <div className="lg:col-span-4">
              <div className="space-y-6 lg:sticky lg:top-[calc(var(--header-h)+2rem)]">
                <section
                  aria-labelledby="contact-details-heading"
                  data-reveal=""
                  className="card card-hover edge-glow relative overflow-hidden p-6 sm:p-8"
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-em/15 blur-3xl"
                  />
                  <h2 id="contact-details-heading" className="text-h4 relative text-ink">
                    {details.heading}
                  </h2>
                  <dl className="relative mt-6 divide-y divide-line border-y border-line">
                    <div className="py-5">
                      <dt className="label-mono">{details.emailLabel}</dt>
                      <dd className="mt-2">
                        <a
                          href={`mailto:${email}`}
                          className="break-all font-display text-[1.35rem] font-medium tracking-[-0.03em] text-ink transition-colors duration-300 hover:text-hot"
                        >
                          {email}
                        </a>
                      </dd>
                    </div>
                    <div className="py-5">
                      <dt className="label-mono">{details.responseLabel}</dt>
                      <dd className="mt-2 text-dim">{settings.contact.responseTime}</dd>
                    </div>
                    <div className="py-5">
                      <dt className="label-mono">{details.locationLabel}</dt>
                      <dd className="mt-2 text-dim">{settings.location.label}</dd>
                    </div>
                  </dl>
                  {settings.contact.bookingUrl && (
                    <ButtonLink href={settings.contact.bookingUrl} variant="secondary" external className="relative mt-6 w-full">
                      {details.bookingLabel}
                    </ButtonLink>
                  )}
                  {settings.socials.length > 0 && (
                    <div className="relative mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                      <p className="label-mono">{settings.ui.connectTitle}</p>
                      <ul className="flex flex-wrap gap-2">
                        {settings.socials.map((social) => (
                          <li key={social.url}>
                            <a
                              href={social.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={social.label}
                              className="grid size-10 place-items-center rounded-full border border-line-strong text-dim transition-colors duration-300 hover:border-em/60 hover:text-ink"
                            >
                              <SocialIcon platform={social.platform} size={16} />
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>

                <section
                  aria-labelledby="contact-steps-heading"
                  data-reveal=""
                  style={{ "--reveal-delay": "80ms" } as CSSProperties}
                  className="card card-hover p-6 sm:p-8"
                >
                  <h2 id="contact-steps-heading" className="text-h4 text-ink">
                    {steps.heading}
                  </h2>
                  <ol className="mt-7">
                    {steps.items.map((step, i) => (
                      <li key={step.title} className="relative flex gap-5 pb-7 last:pb-0">
                        {i < steps.items.length - 1 && (
                          <span
                            aria-hidden="true"
                            className="absolute bottom-0 left-[1.1875rem] top-10 w-px bg-[linear-gradient(to_bottom,var(--color-em),var(--color-line)_70%)] opacity-60"
                          />
                        )}
                        <span className="relative grid size-10 shrink-0 place-items-center rounded-full border border-em/35 bg-em/[0.07] font-mono text-xs text-em">
                          {pad(i + 1)}
                        </span>
                        <div className="pt-1.5">
                          <h3 className="font-medium text-ink">{step.title}</h3>
                          <p className="mt-1.5 text-[0.95rem] text-dim">{step.description}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>
            </div>
          </div>
        </div>
      </section>

      {faqs.length > 0 && <FaqSection intro={page.faq} faqs={faqs} className="border-t border-line" />}

      <JsonLd
        data={contactSchema(
          { name: headingText(page.hero.headline), description: page.seo.description, path: "/contact" },
          settings,
        )}
      />
    </>
  );
}
