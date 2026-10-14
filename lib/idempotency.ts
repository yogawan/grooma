// @/lib/idempotency.ts
import IdempotencyKeyModel from "@/models/IdempotencyKey";
import { connectDB } from "./mongodb";

export const IDEMPOTENCY_HEADER = "idempotency-key";
export const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

// Migration switch for making the header mandatory without breaking clients
// that are already in the field.
//
// The one-deployment-per-HOST model (PRD §3.5) makes this a per-deployment
// rollout rather than a platform-wide flag day: each deployment flips to
// `true` only once the mobile build pointed at it sends the header. Until
// then the endpoint keeps accepting unkeyed submits and logs each one, so
// adoption is observable before enforcement.
export function isIdempotencyKeyRequired(): boolean {
  return process.env.REQUIRE_IDEMPOTENCY_KEY?.trim() === "true";
}

export interface IdempotencyClaim {
  // True when this caller won the race and must perform the real work.
  acquired: boolean;
  // Set when an earlier caller already completed this key — replay that
  // result instead of doing the work again.
  completedRefId: string | null;
}

// A malformed or absent header means "no idempotency requested" rather than
// a 400: the header is optional, and rejecting the whole sale because a
// client sent a 2KB key would be worse than ignoring it.
export function readIdempotencyKey(headers: Headers): string | null {
  const raw = headers.get(IDEMPOTENCY_HEADER);
  if (raw === null) {
    return null;
  }

  const key = raw.trim();
  if (key === "" || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return null;
  }

  return key;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === 11000
  );
}

// Concurrency is resolved by the { user, key } unique index, not by a
// read-then-write check: two simultaneous submits both attempt the insert
// and exactly one survives, so there is no window where both proceed.
export async function claimIdempotencyKey(
  key: string,
  userId: string,
): Promise<IdempotencyClaim> {
  await connectDB();

  try {
    await IdempotencyKeyModel.create({ key, user: userId, transaction: null });
    return { acquired: true, completedRefId: null };
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
  }

  // Lost the race (or this is a genuine retry). A record with a transaction
  // means the original call finished; null means it is still in flight.
  const existing = await IdempotencyKeyModel.findOne({ user: userId, key })
    .select("transaction")
    .lean();

  return {
    acquired: false,
    completedRefId: existing?.transaction ? String(existing.transaction) : null,
  };
}

export async function completeIdempotencyKey(
  key: string,
  userId: string,
  refId: unknown,
): Promise<void> {
  await IdempotencyKeyModel.updateOne(
    { user: userId, key },
    { $set: { transaction: refId } },
  );
}

// Called when the guarded operation failed. Without this a transient error
// would leave an in-flight claim parked for the full TTL, and every retry
// with the same key would be rejected as "still processing".
export async function releaseIdempotencyKey(
  key: string,
  userId: string,
): Promise<void> {
  await IdempotencyKeyModel.deleteOne({
    user: userId,
    key,
    transaction: null,
  });
}
