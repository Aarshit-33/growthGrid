import { resolveBrand } from "@/lib/brand";
import type { Faq, InsightWithMeta, Project, Service, Settings, TeamMember } from "@/lib/schemas";
import { absoluteUrl, interpolate } from "@/lib/utils";
import { plainText } from "@/lib/utils/text";
import { PAGE_SPEAKABLE, SPEAKABLE, speakableSpec } from "./speakable";

/* ─────────────────────────────────────────────────────────────
   schema.org JSON-LD builders. Entities reference each other by
   @id so search engines can connect the graph (org ↔ site ↔
   services ↔ articles).
   ───────────────────────────────────────────────────────────── */

const CONTEXT = "https://schema.org";

export const orgId = (s: Settings) => `${absoluteUrl("/", s.url)}#organization`;
export const siteId = (s: Settings) => `${absoluteUrl("/", s.url)}#website`;

const language = (s: Settings) => s.locale.replace("_", "-");

/** A team member's entity: the Person on /about, which bylines point back to. */
const personId = (s: Settings, slug: string) => `${absoluteUrl("/about", s.url)}#${slug}`;

/**
 * The logo search engines show. The 512px app icon when Branding has one: it
 * carries its own background, so it reads on white and dark results pages
 * alike (a logo made for the dark site, with white lettering, may not). Else
 * the uploaded logo, else the built-in icon.
 */
const logoUrl = (s: Settings) => {
  const { logo, app } = resolveBrand(s);
  return absoluteUrl(!app.icon && logo.image ? logo.image.src : "/brand/icon-512.png", s.url);
};

/**
 * The studio as an entity. `knowsAbout` (services, technologies) tells search
 * and AI engines which topics it's an authority on (GEO).
 */
export function organizationSchema(settings: Settings, knowsAbout: string[] = []) {
  return {
    "@context": CONTEXT,
    "@type": "Organization",
    "@id": orgId(settings),
    name: settings.name,
    legalName: settings.legalName,
    url: absoluteUrl("/", settings.url),
    logo: logoUrl(settings),
    description: settings.description,
    slogan: settings.tagline,
    email: settings.contact.email,
    ...(settings.contact.phone ? { telephone: settings.contact.phone } : {}),
    areaServed: settings.seo.areaServed,
    ...(knowsAbout.length ? { knowsAbout } : {}),
    sameAs: settings.socials.map((s) => s.url),
    contactPoint: {
      "@type": "ContactPoint",
      contactType: settings.seo.contactType,
      email: settings.contact.email,
      url: absoluteUrl("/contact", settings.url),
      availableLanguage: settings.seo.availableLanguages,
    },
  };
}

export function websiteSchema(settings: Settings) {
  return {
    "@context": CONTEXT,
    "@type": "WebSite",
    "@id": siteId(settings),
    name: settings.name,
    // Google's site names (the name shown above a result) fall back to alternateName.
    ...(settings.legalName && settings.legalName !== settings.name ? { alternateName: settings.legalName } : {}),
    url: absoluteUrl("/", settings.url),
    description: settings.seo.description,
    inLanguage: language(settings),
    publisher: { "@id": orgId(settings) },
  };
}

/** The studio as a local/professional business with its service catalogue. */
export function professionalServiceSchema(settings: Settings, services: Service[]) {
  return {
    "@context": CONTEXT,
    "@type": "ProfessionalService",
    "@id": `${absoluteUrl("/", settings.url)}#studio`,
    name: settings.name,
    url: absoluteUrl("/", settings.url),
    // The logo, not the homepage's social card: Next serves that card at a hashed
    // address (/opengraph-image-<hash>/card, from the (site) route group), so a
    // plain /opengraph-image link would 404.
    image: logoUrl(settings),
    description: settings.description,
    email: settings.contact.email,
    parentOrganization: { "@id": orgId(settings) },
    areaServed: settings.seo.areaServed,
    ...(settings.location.city
      ? { address: { "@type": "PostalAddress", addressLocality: settings.location.city, addressCountry: settings.location.country } }
      : {}),
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: settings.seo.offerCatalogName,
      itemListElement: services.map((s) => ({
        "@type": "Offer",
        itemOffered: { "@type": "Service", name: s.title, url: absoluteUrl(`/services/${s.slug}`, settings.url) },
      })),
    },
  };
}

export function serviceSchema(service: Service, settings: Settings) {
  const url = absoluteUrl(`/services/${service.slug}`, settings.url);
  return {
    "@context": CONTEXT,
    "@type": "Service",
    "@id": `${url}#service`,
    name: service.title,
    serviceType: service.title,
    description: service.summary,
    url,
    provider: { "@id": orgId(settings) },
    areaServed: settings.seo.areaServed,
    keywords: service.keywords.join(", "),
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: interpolate(settings.seo.deliverablesName, { title: service.title }),
      itemListElement: service.deliverables.map((d) => ({
        "@type": "Offer",
        itemOffered: { "@type": "Service", name: d },
      })),
    },
  };
}

export function caseStudySchema(project: Project, settings: Settings) {
  const url = absoluteUrl(`/work/${project.slug}`, settings.url);
  return {
    "@context": CONTEXT,
    "@type": "CreativeWork",
    "@id": `${url}#case-study`,
    name: project.title,
    headline: project.title,
    description: project.summary,
    url,
    image: absoluteUrl(project.cover.src, settings.url),
    datePublished: project.publishedAt,
    creator: { "@id": orgId(settings) },
    publisher: { "@id": orgId(settings) },
    about: project.client.industry,
    genre: project.category,
    keywords: project.seo.keywords?.join(", "),
  };
}

export function articleSchema(insight: InsightWithMeta, author: TeamMember | undefined, settings: Settings) {
  const url = absoluteUrl(`/insights/${insight.slug}`, settings.url);
  return {
    "@context": CONTEXT,
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    headline: insight.title,
    description: insight.excerpt,
    /** The article's answer in a sentence: what AI engines should quote. */
    abstract: insight.takeaway,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    image: absoluteUrl(insight.cover.src, settings.url),
    datePublished: insight.publishedAt,
    dateModified: insight.updatedAt ?? insight.publishedAt,
    articleSection: insight.category.label,
    keywords: insight.tags.join(", "),
    timeRequired: `PT${insight.readingTime}M`,
    inLanguage: language(settings),
    isAccessibleForFree: true,
    author: author
      ? {
          "@type": "Person",
          "@id": personId(settings, author.slug),
          name: author.name,
          jobTitle: author.role,
          url: personId(settings, author.slug),
        }
      : { "@id": orgId(settings) },
    publisher: { "@id": orgId(settings) },
    // Voice assistants read the title, the lede and the key takeaway.
    speakable: speakableSpec([...PAGE_SPEAKABLE, SPEAKABLE.takeaway]),
  };
}

export function faqSchema(faqs: Faq[]) {
  return {
    "@context": CONTEXT,
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: plainText(f.answer) },
    })),
  };
}

export function breadcrumbSchema(items: { label: string; href: string }[], settings: Settings) {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      item: absoluteUrl(item.href, settings.url),
    })),
  };
}

export function collectionPageSchema(
  { name, description, path, items }: { name: string; description: string; path: string; items: { name: string; path: string }[] },
  settings: Settings,
) {
  const url = absoluteUrl(path, settings.url);
  return {
    "@context": CONTEXT,
    "@type": "CollectionPage",
    "@id": `${url}#page`,
    name,
    description,
    url,
    inLanguage: language(settings),
    isPartOf: { "@id": siteId(settings) },
    speakable: speakableSpec(PAGE_SPEAKABLE),
    mainEntity: {
      "@type": "ItemList",
      itemListElement: items.map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: item.name,
        url: absoluteUrl(item.path, settings.url),
      })),
    },
  };
}

/**
 * A page as a whole: what it's about, and which parts read well aloud
 * (speakable, for voice assistants). For pages whose main JSON-LD entity
 * isn't a page itself: the homepage, a service, a case study.
 */
export function webPageSchema(
  {
    name,
    description,
    path,
    mainEntity,
    speakable = PAGE_SPEAKABLE,
  }: {
    name: string;
    description: string;
    path: string;
    /** @id of the entity the page is about (a Service, a case study). Default: the studio. */
    mainEntity?: string;
    /** Ids of the elements to read out. Default: the hero's title and lede. */
    speakable?: readonly string[];
  },
  settings: Settings,
) {
  const url = absoluteUrl(path, settings.url);
  return {
    "@context": CONTEXT,
    "@type": "WebPage",
    "@id": `${url}#page`,
    name,
    description,
    url,
    inLanguage: language(settings),
    isPartOf: { "@id": siteId(settings) },
    ...(mainEntity ? { mainEntity: { "@id": mainEntity } } : { about: { "@id": orgId(settings) } }),
    speakable: speakableSpec(speakable),
  };
}

/** /about: the studio and the people behind it (team as Person entities). */
export function aboutSchema(
  { name, description, path }: { name: string; description: string; path: string },
  team: TeamMember[],
  settings: Settings,
) {
  const url = absoluteUrl(path, settings.url);
  return {
    "@context": CONTEXT,
    "@type": "AboutPage",
    "@id": `${url}#page`,
    name,
    description,
    url,
    inLanguage: language(settings),
    isPartOf: { "@id": siteId(settings) },
    about: { "@id": orgId(settings) },
    speakable: speakableSpec(PAGE_SPEAKABLE),
    mainEntity: {
      "@type": "Organization",
      "@id": orgId(settings),
      name: settings.name,
      employee: team.map((member) => ({
        "@type": "Person",
        "@id": personId(settings, member.slug),
        name: member.name,
        jobTitle: member.role,
        description: member.bio,
        knowsAbout: member.focus,
        ...(member.avatar ? { image: absoluteUrl(member.avatar.src, settings.url) } : {}),
        ...(member.socials.length ? { sameAs: member.socials.map((s) => s.url) } : {}),
        worksFor: { "@id": orgId(settings) },
      })),
    },
  };
}

/** /contact: how to reach the studio. */
export function contactSchema(
  { name, description, path }: { name: string; description: string; path: string },
  settings: Settings,
) {
  const url = absoluteUrl(path, settings.url);
  return {
    "@context": CONTEXT,
    "@type": "ContactPage",
    "@id": `${url}#page`,
    name,
    description,
    url,
    inLanguage: language(settings),
    isPartOf: { "@id": siteId(settings) },
    about: { "@id": orgId(settings) },
    speakable: speakableSpec(PAGE_SPEAKABLE),
    mainEntity: {
      "@type": "ContactPoint",
      contactType: settings.seo.contactType,
      email: settings.contact.email,
      ...(settings.contact.phone ? { telephone: settings.contact.phone } : {}),
      availableLanguage: settings.seo.availableLanguages,
    },
  };
}
