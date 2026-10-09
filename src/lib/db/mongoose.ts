import mongoose from "mongoose";

/* ─────────────────────────────────────────────────────────────
   Cached MongoDB connection.

   Next.js re-evaluates modules during development (HMR) and may run
   many route handlers in one server process, so the connection promise
   is stored on `globalThis` and reused instead of opening a new pool
   on every request.
   ───────────────────────────────────────────────────────────── */

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

const globalForMongoose = globalThis as typeof globalThis & { __mongoose?: MongooseCache };
const cached: MongooseCache = (globalForMongoose.__mongoose ??= { conn: null, promise: null });

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI);
}

export async function connectToDatabase(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Add it to .env.local (see .env.example) or set CONTENT_SOURCE=json.",
    );
  }

  if (cached.conn) return cached.conn;

  cached.promise ??= mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB || "growthgrid",
    bufferCommands: false,
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 10,
  });

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    throw error;
  }
  return cached.conn;
}

export async function disconnectFromDatabase(): Promise<void> {
  if (cached.conn) {
    await cached.conn.disconnect();
    cached.conn = null;
    cached.promise = null;
  }
}
