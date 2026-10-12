import mongoose from "mongoose";
import { describeMongoTarget, mongoConfigProblem, mongoDbName, mongoUri, redactCredentials } from "./uri";

export {
  describeMongoTarget,
  isDatabaseConfigured,
  mongoConfigProblem,
  mongoDbName,
  mongoUri,
  redactCredentials,
  usesMongoContent,
} from "./uri";

/* ─────────────────────────────────────────────────────────────
   Cached MongoDB connection.

   Next.js re-evaluates modules during development (HMR) and may run
   many route handlers in one server process, so the connection promise
   is stored on `globalThis` and reused instead of opening a new pool
   on every request.

   The connection string comes from mongoUri() (./uri.ts): MONGODB_URI,
   with <db_username> / <db_password> filled from MONGODB_USERNAME /
   MONGODB_PASSWORD when it is Atlas's template.
   ───────────────────────────────────────────────────────────── */

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

const globalForMongoose = globalThis as typeof globalThis & { __mongoose?: MongooseCache };
const cached: MongooseCache = (globalForMongoose.__mongoose ??= { conn: null, promise: null });

export async function connectToDatabase(): Promise<typeof mongoose> {
  const uri = mongoUri();
  if (!uri) {
    throw new Error(
      `MongoDB is not configured: ${mongoConfigProblem()} Add it to .env.local (see .env.example) or set CONTENT_SOURCE=json.`,
    );
  }

  if (cached.conn) return cached.conn;

  cached.promise ??= mongoose.connect(uri, {
    dbName: mongoDbName(),
    bufferCommands: false,
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 10,
  });

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    // Driver errors can echo the connection string; never pass credentials on.
    const reason = redactCredentials(error instanceof Error ? error.message : String(error));
    throw new Error(`Could not connect to MongoDB (${describeMongoTarget()}): ${reason}`);
  }
  return cached.conn;
}

/** The native driver database, connected. */
export async function database() {
  const conn = await connectToDatabase();
  const db = conn.connection.db;
  if (!db) throw new Error("MongoDB connection has no database handle.");
  return db;
}

export async function disconnectFromDatabase(): Promise<void> {
  if (cached.conn) {
    await cached.conn.disconnect();
    cached.conn = null;
    cached.promise = null;
  }
}
