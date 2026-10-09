import type { MetadataRoute } from "next";
import type { Settings } from "@/lib/schemas";

/* ─────────────────────────────────────────────────────────────
   AI crawlers in robots.txt (GEO / LLMO), grouped by what they
   do with a page:

   • Answer engines fetch pages to answer a question and cite
     them (ChatGPT search, Perplexity, Claude…). Being readable
     by them is how a site shows up, linked, in AI answers.
   • Training crawlers collect pages to train AI models.

   Each group is switched in Site settings › SEO. Search engines
   (Googlebot, Bingbot, Applebot) aren't listed: they follow the
   `*` rules, and also feed Google's AI Overviews, Copilot and
   Siri. Amazonbot is left out for the same reason (Alexa).
   Names are the user-agent tokens each vendor documents.
   ───────────────────────────────────────────────────────────── */

export const AI_ANSWER_ENGINES = [
  "OAI-SearchBot", // ChatGPT search
  "ChatGPT-User", // pages a ChatGPT user asks about
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "DuckAssistBot", // DuckDuckGo's AI answers
  "MistralAI-User", // Le Chat
  "meta-externalfetcher", // Meta AI
  "YouBot", // You.com
] as const;

export const AI_TRAINING_CRAWLERS = [
  "GPTBot", // OpenAI
  "ClaudeBot", // Anthropic
  "anthropic-ai", // Anthropic (older token)
  "Google-Extended", // Gemini: doesn't affect Google Search
  "Applebot-Extended", // Apple Intelligence: doesn't affect Siri or Spotlight
  "CCBot", // Common Crawl, a widely used training set
  "Bytespider", // ByteDance
  "meta-externalagent", // Meta
  "FacebookBot", // Meta (not the link-preview crawler)
  "cohere-training-data-crawler",
  "AI2Bot", // Allen Institute for AI
] as const;

/** Paths no crawler should fetch. */
export const PRIVATE_PATHS = ["/api/"];

type Rule = Extract<MetadataRoute.Robots["rules"], unknown[]>[number];

/**
 * An AI group has its own block, so it doesn't inherit the `*` rules: an
 * allowed group repeats the private paths, a blocked one is shut out.
 */
const group = (agents: readonly string[], allowed: boolean): Rule =>
  allowed
    ? { userAgent: [...agents], allow: "/", disallow: PRIVATE_PATHS }
    : { userAgent: [...agents], disallow: "/" };

/**
 * Rules for both AI groups. With Discourage search engines on (staging,
 * pre-launch), both are shut out: AI tools don't all honour the noindex tag
 * that keeps a staging copy out of search results.
 */
export function aiCrawlerRules(seo: Settings["seo"]): Rule[] {
  const hidden = seo.discourageSearchEngines === true;
  return [
    group(AI_ANSWER_ENGINES, !hidden && seo.blockAiAnswers !== true),
    group(AI_TRAINING_CRAWLERS, !hidden && seo.blockAiTraining !== true),
  ];
}
