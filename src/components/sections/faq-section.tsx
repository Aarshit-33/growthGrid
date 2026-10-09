import { JsonLd } from "@/components/seo/json-ld";
import { Accordion } from "@/components/ui/accordion";
import { InlineText } from "@/components/ui/rich-text";
import { SectionHeading } from "@/components/ui/section-heading";
import type { Faq, SectionIntro } from "@/lib/schemas";
import { faqSchema } from "@/lib/seo/schema";
import { cn } from "@/lib/utils";

/** FAQ block: sticky intro + accordion, with FAQPage structured data. */
export function FaqSection({
  intro,
  faqs,
  index,
  id = "faq",
  className,
  headingClassName,
}: {
  intro: SectionIntro;
  faqs: Faq[];
  index?: string;
  id?: string;
  className?: string;
  headingClassName?: string;
}) {
  if (faqs.length === 0) return null;
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={cn("section-y relative", className)}>
      <div className="container-x grid gap-12 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-[calc(var(--header-h)+2.5rem)]">
            <SectionHeading intro={intro} index={index} id={`${id}-heading`} headingClassName={headingClassName} />
          </div>
        </div>
        <div className="lg:col-span-7" data-reveal="">
          <Accordion
            defaultOpen={faqs[0]?.id ?? null}
            items={faqs.map((f) => ({
              id: f.id,
              title: f.question,
              content: (
                <p className="leading-relaxed">
                  <InlineText text={f.answer} />
                </p>
              ),
            }))}
          />
        </div>
      </div>
      <JsonLd data={faqSchema(faqs)} />
    </section>
  );
}
