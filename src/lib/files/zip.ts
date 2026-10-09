import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { deflateRaw } from "node:zlib";
import type { PublicFile } from "./shared";

/* ─────────────────────────────────────────────────────────────
   A minimal .zip writer for the file library's "download all"
   and "download folder". Streams one file at a time, so memory
   stays around the size of the largest single file. Classic
   ZIP (no ZIP64): up to 65,535 files and 4 GB, hence ZIP_LIMITS.
   ───────────────────────────────────────────────────────────── */

const deflate = promisify(deflateRaw);

/** Comfortably inside classic ZIP's limits. */
export const ZIP_LIMITS = { files: 65_535, bytes: 2 * 1024 ** 3 };

/** Already compressed: deflating these again only costs time. */
const STORE_AS_IS = new Set([
  "7z", "aac", "avif", "flac", "gif", "gz", "jpeg", "jpg", "m4a", "m4v", "mov", "mp3", "mp4",
  "oga", "ogg", "ogv", "opus", "pdf", "png", "rar", "tgz", "webm", "webp", "woff", "woff2", "zip",
]);

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS date and time, as ZIP stores them (local time, 2-second steps, 1980 at the earliest). */
function dosDateTime(ms: number) {
  const d = new Date(Math.max(ms, new Date(1980, 0, 1).getTime()));
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** General-purpose flag: names are UTF-8. */
const UTF8_NAMES = 0x0800;

/**
 * The archive, chunk by chunk, keeping each file's path inside /public.
 * `files` must come from listPublicFiles(), so every path is inside /public.
 */
export async function* zipFiles(files: PublicFile[], publicRoot: string): AsyncGenerator<Uint8Array> {
  const directory: Buffer[] = [];
  let offset = 0;
  let count = 0;

  for (const file of files) {
    const raw = await readFile(join(publicRoot, ...file.path.split("/"))).catch(() => null);
    if (!raw) continue; // Deleted since the listing.

    let data: Buffer = raw;
    let method = 0; // stored
    if (!STORE_AS_IS.has(file.ext)) {
      const packed = await deflate(raw);
      if (packed.length < raw.length) {
        data = packed;
        method = 8; // deflated
      }
    }
    const crc = crc32(raw);
    const name = Buffer.from(file.path, "utf8");
    const { time, date } = dosDateTime(file.modified);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header
    local.writeUInt16LE(20, 4); // version needed: 2.0
    local.writeUInt16LE(UTF8_NAMES, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    yield Buffer.concat([local, name]);
    yield data;

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); // central directory header
    entry.writeUInt16LE(20, 4); // made by: 2.0
    entry.writeUInt16LE(20, 6); // version needed: 2.0
    entry.writeUInt16LE(UTF8_NAMES, 8);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt16LE(time, 12);
    entry.writeUInt16LE(date, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42); // where its local header starts
    directory.push(entry, name);

    offset += local.length + name.length + data.length;
    count++;
  }

  const central = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  yield central;
  yield end;
}
