import "server-only";
import { usesMongoContent } from "@/lib/db/uri";
import type { ContentBackend } from "./types";

export type { ContentBackend, DocTarget, LoadedContent } from "./types";

/**
 * The Studio's storage for the current CONTENT_SOURCE. Loaded lazily, so
 * JSON mode never loads Mongoose and Mongo mode never touches /content.
 */
export async function contentBackend(): Promise<ContentBackend> {
  if (usesMongoContent()) return (await import("./mongo")).mongoBackend;
  return (await import("./json")).jsonBackend;
}
