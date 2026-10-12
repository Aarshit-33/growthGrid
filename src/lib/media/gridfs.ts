import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import mongoose from "mongoose";
import { database, isDatabaseConfigured } from "@/lib/db/mongoose";
import { addKnownMedia, isMediaInDatabase, removeKnownMedia, setKnownMedia } from "./known";

/* ─────────────────────────────────────────────────────────────
   Media files in MongoDB GridFS (CONTENT_SOURCE=mongo), so Studio
   uploads work on a read-only host (Vercel) with nothing but the
   database connection.

   • Bucket "media": media.files (one document per file) and
     media.chunks (its bytes, 255 KB each).
   • metadata.path is the site path the content stores
     ("/images/uploads/cover.webp"); the site serves it at that
     same URL (src/app/media/[...path]/route.ts, reached through a
     fallback rewrite in next.config.ts, so /public files win).
   • At most one live file per path (a unique partial index).
     Deleting sets metadata.deleted (the trash); restoring clears
     it. The Studio never reuses a path while a trashed copy exists,
     so a URL keeps meaning the same bytes (only
     `npm run media -- upload --force` replaces a file in place).

   No "server-only" import: scripts/media.ts uses this too.
   ───────────────────────────────────────────────────────────── */

export const MEDIA_BUCKET = "media";

export interface MediaMeta {
  /** Site path, e.g. "/images/uploads/cover.webp". */
  path: string;
  /** Folder inside /public it stands in for: "images/uploads". */
  folder: string;
  name: string;
  contentType: string;
  width: number | null;
  height: number | null;
  bytes: number;
  /** Hex SHA-256 of the bytes: the ETag, and how the upload script spots unchanged files. */
  sha256: string;
  uploadedAt: Date;
  uploadedBy: string | null;
  /** "studio": uploaded in the admin; "public-sync": copied from /public by `npm run media`. */
  source: "studio" | "public-sync";
  deleted: boolean;
  deletedAt?: Date | null;
  deletedBy?: string | null;
}

export interface MediaFile {
  id: mongoose.mongo.ObjectId;
  length: number;
  uploadDate: Date;
  metadata: MediaMeta;
}

interface FileDoc {
  _id: mongoose.mongo.ObjectId;
  length: number;
  chunkSize: number;
  uploadDate: Date;
  filename: string;
  metadata: MediaMeta;
}

/** The path already has a live file (two uploads raced for one name). */
export class MediaConflictError extends Error {
  constructor(readonly path: string) {
    super(`A file already exists at ${path}.`);
    this.name = "MediaConflictError";
  }
}

const LIST_LIMIT = 5000;

export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

const isDuplicateKey = (error: unknown) => (error as { code?: number } | null)?.code === 11000;

const toFile = (doc: FileDoc): MediaFile => ({ id: doc._id, length: doc.length, uploadDate: doc.uploadDate, metadata: doc.metadata });

/* Indexes are made once per process (kept on globalThis across dev reloads). */
const once = globalThis as typeof globalThis & { __ggMediaIndexes?: Promise<void> };

const filesOf = (db: mongoose.mongo.Db) => db.collection<FileDoc>(`${MEDIA_BUCKET}.files`);

async function ensureIndexes(db: mongoose.mongo.Db) {
  const files = filesOf(db);
  await Promise.all([
    files.createIndex(
      { "metadata.path": 1 },
      { name: "live_path_unique", unique: true, partialFilterExpression: { "metadata.deleted": false } },
    ),
    files.createIndex({ "metadata.deleted": 1, "metadata.path": 1 }, { name: "deleted_path" }),
  ]);
}

async function open() {
  const db = await database();
  once.__ggMediaIndexes ??= ensureIndexes(db).catch((error) => {
    once.__ggMediaIndexes = undefined;
    throw error;
  });
  await once.__ggMediaIndexes;
  return { db, files: filesOf(db), bucket: new mongoose.mongo.GridFSBucket(db, { bucketName: MEDIA_BUCKET }) };
}

/* ── Reading ──────────────────────────────────────────────── */

const LIVE = { "metadata.deleted": false } as const;

/** Every live file (newest first), and the in-process index of known paths refreshed with it. */
export async function listMediaFiles(): Promise<MediaFile[]> {
  const { files } = await open();
  const docs = await files.find(LIVE).sort({ uploadDate: -1 }).limit(LIST_LIMIT).toArray();
  setKnownMedia(docs.map((doc) => doc.metadata.path));
  return docs.map(toFile);
}

/** Just the live paths (cheap): refreshes the index validateContent() reads. */
export async function refreshMediaIndex(): Promise<Set<string>> {
  const { files } = await open();
  const docs = await files.find(LIVE, { projection: { "metadata.path": 1 } }).limit(LIST_LIMIT).toArray();
  const paths = new Set(docs.map((doc) => doc.metadata.path));
  setKnownMedia(paths);
  return paths;
}

/**
 * The live paths, freshly listed, for validateContent({ media }) with
 * CONTENT_SOURCE=mongo: an image in neither /public nor this list is then an
 * error. Undefined in JSON mode or when the database can't answer (missing
 * images are then only warnings). Never throws.
 */
export async function prepareMediaIndex(): Promise<Set<string> | undefined> {
  if (!isMediaInDatabase() || !isDatabaseConfigured()) return undefined;
  try {
    return await refreshMediaIndex();
  } catch (error) {
    console.warn("[media] couldn't list the media database; image checks will only warn:", error);
    return undefined;
  }
}

export async function findMediaFile(path: string): Promise<MediaFile | null> {
  const { files } = await open();
  const doc = await files.findOne({ "metadata.path": path, ...LIVE });
  return doc ? toFile(doc) : null;
}

/** Live files for several paths at once (brand images), by path. */
export async function findMediaFiles(paths: string[]): Promise<Map<string, MediaFile>> {
  if (paths.length === 0) return new Map();
  const { files } = await open();
  const docs = await files.find({ "metadata.path": { $in: paths }, ...LIVE }).toArray();
  return new Map(docs.map((doc) => [doc.metadata.path, toFile(doc)]));
}

/** Used now, or by a file in the trash: new uploads never take such a path. */
export async function mediaPathTaken(path: string): Promise<boolean> {
  const { files } = await open();
  return (await files.countDocuments({ "metadata.path": path }, { limit: 1 })) > 0;
}

/** Folders that hold at least one live file. */
export async function mediaFolders(): Promise<string[]> {
  const { files } = await open();
  return (await files.distinct("metadata.folder", LIVE)) as string[];
}

/** A file's bytes as a stream; `end` is inclusive. */
export async function openMediaStream(id: mongoose.mongo.ObjectId, range?: { start: number; end: number }): Promise<Readable> {
  const { bucket } = await open();
  return bucket.openDownloadStream(id, range ? { start: range.start, end: range.end + 1 } : undefined);
}

/** A live file's bytes, or null when missing or larger than `maxBytes`. */
export async function readMediaBytes(path: string, maxBytes = 16 * 1024 * 1024): Promise<Buffer | null> {
  const file = await findMediaFile(path);
  if (!file || file.length > maxBytes) return null;
  const stream = await openMediaStream(file.id);
  const parts: Buffer[] = [];
  for await (const part of stream) parts.push(part as Buffer);
  return Buffer.concat(parts);
}

/* ── Writing ──────────────────────────────────────────────── */

export interface NewMediaFile {
  path: string;
  bytes: Uint8Array;
  contentType: string;
  width: number | null;
  height: number | null;
  uploadedBy: string | null;
  source: MediaMeta["source"];
}

const splitPath = (path: string) => {
  const parts = path.replace(/^\/+/, "").split("/");
  return { folder: parts.slice(0, -1).join("/"), name: parts[parts.length - 1] };
};

/** Stores a new live file. Throws MediaConflictError when the path already has one. */
export async function putMediaFile(input: NewMediaFile): Promise<MediaFile> {
  const { bucket } = await open();
  const { folder, name } = splitPath(input.path);
  const metadata: MediaMeta = {
    path: input.path,
    folder,
    name,
    contentType: input.contentType,
    width: input.width,
    height: input.height,
    bytes: input.bytes.length,
    sha256: sha256(input.bytes),
    uploadedAt: new Date(),
    uploadedBy: input.uploadedBy,
    source: input.source,
    deleted: false,
  };
  const id = new mongoose.mongo.ObjectId();
  try {
    await new Promise<void>((resolve, reject) => {
      const upload = bucket.openUploadStreamWithId(id, input.path, { metadata });
      upload.once("finish", () => resolve());
      upload.once("error", reject);
      upload.end(Buffer.from(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength));
    });
  } catch (error) {
    // The chunks are written before the file document: drop any left behind.
    await bucket.delete(id).catch(() => undefined);
    if (isDuplicateKey(error)) throw new MediaConflictError(input.path);
    throw error;
  }
  addKnownMedia(input.path);
  return { id, length: metadata.bytes, uploadDate: metadata.uploadedAt, metadata };
}

/** Moves the live file at `path` to the trash. Returns it, or null when there was none. */
export async function trashMediaFile(path: string, by: string | null): Promise<MediaFile | null> {
  const { files } = await open();
  const doc = await files.findOneAndUpdate(
    { "metadata.path": path, ...LIVE },
    { $set: { "metadata.deleted": true, "metadata.deletedAt": new Date(), "metadata.deletedBy": by } },
    { returnDocument: "after" },
  );
  removeKnownMedia(path);
  return doc ? toFile(doc) : null;
}

/** Trashed files, most recently deleted first. */
export async function listTrashedMedia(): Promise<MediaFile[]> {
  const { files } = await open();
  const docs = await files.find({ "metadata.deleted": true }).sort({ "metadata.deletedAt": -1 }).limit(LIST_LIMIT).toArray();
  return docs.map(toFile);
}

/**
 * Puts a trashed file back on the site: by id, or the most recently deleted
 * copy of a path. Throws MediaConflictError when the path has a live file again.
 */
export async function restoreMediaFile(target: { id: mongoose.mongo.ObjectId } | { path: string }): Promise<MediaFile | null> {
  const { files } = await open();
  const doc =
    "id" in target
      ? await files.findOne({ _id: target.id, "metadata.deleted": true })
      : await files.findOne({ "metadata.path": target.path, "metadata.deleted": true }, { sort: { "metadata.deletedAt": -1 } });
  if (!doc) return null;
  try {
    await files.updateOne(
      { _id: doc._id },
      { $set: { "metadata.deleted": false }, $unset: { "metadata.deletedAt": "", "metadata.deletedBy": "" } },
    );
  } catch (error) {
    if (isDuplicateKey(error)) throw new MediaConflictError(doc.metadata.path);
    throw error;
  }
  addKnownMedia(doc.metadata.path);
  return toFile({ ...doc, metadata: { ...doc.metadata, deleted: false, deletedAt: null, deletedBy: null } });
}

/** Deletes a trashed file for good (its bytes too). */
export async function purgeMediaFile(id: mongoose.mongo.ObjectId): Promise<void> {
  const { files, bucket } = await open();
  const doc = await files.findOne({ _id: id }, { projection: { "metadata.deleted": 1 } });
  if (!doc?.metadata.deleted) throw new Error("Only files in the trash can be purged.");
  await bucket.delete(id);
}
