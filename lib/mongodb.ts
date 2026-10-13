// @/lib/mongodb.ts
import mongoose, { type Mongoose } from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

interface MongooseCache {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __groomaMongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = globalThis.__groomaMongooseCache ?? {
  conn: null,
  promise: null,
};

globalThis.__groomaMongooseCache = cached;

export async function connectDB(): Promise<Mongoose> {
  if (!MONGODB_URI) {
    throw new Error("Missing MONGODB_URI environment variable.");
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
