import { SectionHeading } from "@/components/ui/section-heading";
import type { HomePage, Testimonial } from "@/lib/schemas";
import { TestimonialCarousel } from "./testimonial-carousel";

/** Client voices: featured testimonials in an accessible carousel. */
export function TestimonialsSection({
  intro,
  testimonials,
  index,
}: {
  intro: HomePage["testimonials"];
  testimonials: Testimonial[];
  index?: string;
}) {
  if (testimonials.length === 0) return null;
  return (
    <section id="testimonials" aria-labelledby="testimonials-heading" className="section-y relative overflow-hidden">
      <div aria-hidden="true" className="blueprint fade-radial pointer-events-none absolute inset-0 opacity-40" />
      <div className="container-x relative">
        <SectionHeading intro={intro} index={index} id="testimonials-heading" />
        <div className="mt-14 lg:mt-20" data-reveal="">
          <TestimonialCarousel testimonials={testimonials} labels={intro} />
        </div>
      </div>
    </section>
  );
}
