import type { CSSProperties } from "react";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import type { HomePage, Service } from "@/lib/schemas";
import { ServicesIndex } from "./services-index";

/** What we build: the service lines as an editorial index. */
export function ServicesSection({
  intro,
  services,
  index,
}: {
  intro: HomePage["services"];
  services: Service[];
  index?: string;
}) {
  if (services.length === 0) return null;
  return (
    <section id="services" aria-labelledby="services-heading" className="section-y relative">
      {/* scene-text: the heading and rows sit over the layer stack. */}
      <div className="container-x scene-text">
        <SectionHeading intro={intro} index={index} id="services-heading" />
        {/* CTA on the left, under the intro (not in the heading's right-hand aside). */}
        <div data-reveal="" style={{ "--reveal-delay": "180ms" } as CSSProperties} className="mt-8">
          <ButtonLink href={intro.cta.href} variant="secondary" external={intro.cta.external}>
            {intro.cta.label}
          </ButtonLink>
        </div>
        <div className="mt-14 lg:mt-20">
          <ServicesIndex services={services} />
        </div>
      </div>
    </section>
  );
}
