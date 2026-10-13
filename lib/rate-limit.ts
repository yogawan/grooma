// @/lib/rate-limit.ts
import { model, models, Schema } from "mongoose";
import type { NextRequest } from "next/server";
import { connectDB } from "./mongodb";

// Fixed-window counter backed by its own Mongo collection (§1 decision: no
// Redis/Upstash available in this deployment, so counters live in Mongo
// instead of per-process memory, which would not be reliable across
// serverless instances).
const RateLimitCounterSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
    },

    count: {
      type: Number,
      required: true,
      default: 0,
    },

    resetAt: {
      type: Date,
      required: true,
    },
  },
  { versionKey: false },
);

RateLimitCounterSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });

const RateLimitCounter =
  models.RateLimitCounter || model("RateLimitCounter", RateLimitCounterSchema);

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  await connectDB();

  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = new Date(windowStart + windowMs);
  const windowKey = `${key}:${windowStart}`;

  const counter = await RateLimitCounter.findOneAndUpdate(
    { key: windowKey },
    { $inc: { count: 1 }, $setOnInsert: { resetAt } },
    { upsert: true, new: true },
  ).lean();

  const count = counter?.count ?? 1;

  return {
    allowed: count <= limit,
    remaining: Math.max(limit - count, 0),
    resetAt,
  };
}

// `NextRequest.ip` was removed in this Next.js version; the client address
// must be read from the proxy-forwarded headers instead.
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return request.headers.get("x-real-ip")?.trim() ?? "unknown";
}
