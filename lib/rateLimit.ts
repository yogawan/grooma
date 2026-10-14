// @/lib/rateLimit.ts
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

// How many proxies in front of this deployment are trusted to have appended
// to X-Forwarded-For. There is deliberately no inferred default: the repo
// carries no deployment manifest (no vercel.json, Dockerfile or reverse-proxy
// config) and PRD §2 allows "Vercel atau Node.js-compatible hosting", so the
// topology is only knowable to whoever operates the deployment.
//
//   0 = nothing in front of the app; X-Forwarded-For is entirely
//       client-supplied and is therefore ignored outright.
//   1 = one trusted proxy (typical managed platform or a single nginx).
//   n = n trusted hops.
//
// Production refuses to boot without an explicit value; development defaults
// to 0, which is the truth when running `next dev` directly.
function readTrustedProxyHopCount(): number {
  const raw = process.env.TRUSTED_PROXY_HOP_COUNT?.trim();

  if (!raw) {
    if (process.env.APPLICATION_ENVIRONMENT === "production") {
      throw new Error(
        "TRUSTED_PROXY_HOP_COUNT must be set in production. It is the number of " +
          "trusted proxies in front of this deployment that append to " +
          "X-Forwarded-For (0 if the app is reached directly, 1 behind a single " +
          "proxy/CDN). Without it the login rate limit cannot tell a real client " +
          "address from a spoofed header. See docs/PROVISIONING-HOST.md.",
      );
    }
    return 0;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(
      `Invalid TRUSTED_PROXY_HOP_COUNT "${raw}". Expected a non-negative integer.`,
    );
  }

  return parsed;
}

export function getTrustedProxyHopCount(): number {
  return readTrustedProxyHopCount();
}

// `NextRequest.ip` was removed in this Next.js version, so the client address
// has to come from forwarded headers — which means deciding how much of them
// is trustworthy.
//
// X-Forwarded-For grows left-to-right, each proxy appending the peer it
// received the request from. With `n` trusted proxies the genuine client is
// therefore the nth entry counted from the RIGHT; everything to the left of
// it was supplied by the caller and can say anything. Reading the leftmost
// entry — as this function used to — let anyone pick their own rate-limit
// bucket by sending `X-Forwarded-For: <random>` and bypass the login
// throttle entirely.
export function getClientIp(request: NextRequest): string {
  const hops = readTrustedProxyHopCount();

  if (hops === 0) {
    // No trusted hop means no trustworthy header: X-Forwarded-For and
    // X-Real-IP are both just request input here. Returning a constant makes
    // the limiter degrade to a shared bucket rather than a bypassable one.
    return "direct";
  }

  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) {
    // Configured to sit behind a proxy, yet the header is missing — treat the
    // address as unknown instead of falling back to a spoofable header.
    return "unknown";
  }

  const chain = forwarded
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");

  const index = chain.length - hops;
  if (index < 0 || index >= chain.length) {
    // Chain shorter than the configured trust depth: either misconfiguration
    // or someone stripped headers. Fail closed to a shared bucket.
    return "unknown";
  }

  return chain[index] ?? "unknown";
}
