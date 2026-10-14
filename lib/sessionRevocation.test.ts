// @/lib/sessionRevocation.test.ts
//
// Regression tests for M-7: changing a password left every other session for
// the account alive, so a stolen session survived the exact action taken to
// stop it.
//
// Session tokens are stored hashed, never in plaintext, so the assertions
// below check which tokenHash filter reaches the model rather than
// recomputing the HMAC.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mongodb", () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

interface SessionRow {
  user: string;
  tokenHash: string;
}

let sessions: SessionRow[] = [];

vi.mock("@/models/Session", () => ({
  default: {
    deleteMany: vi.fn(
      async (filter: { user: string; tokenHash?: { $ne: string } }) => {
        const before = sessions.length;
        sessions = sessions.filter((s) => {
          const sameUser = s.user === filter.user;
          if (!sameUser) {
            return true;
          }
          if (filter.tokenHash?.$ne !== undefined) {
            // Keep the one session explicitly excluded from the delete.
            return s.tokenHash === filter.tokenHash.$ne;
          }
          return false;
        });
        return { deletedCount: before - sessions.length };
      },
    ),
    deleteOne: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@/models/User", () => ({ default: { findById: vi.fn() } }));

const { revokeOtherSessions } = await import("@/lib/auth");

// Mirrors lib/auth.ts's private hashToken so the fixtures line up with what
// the implementation will filter on.
async function tokenHashOf(token: string): Promise<string> {
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", process.env.SESSION_SECRET as string)
    .update(token)
    .digest("hex");
}

beforeEach(() => {
  sessions = [];
  vi.clearAllMocks();
});

describe("revokeOtherSessions", () => {
  it("drops the account's other sessions but keeps the caller's", async () => {
    const keep = "current-device-token";
    sessions = [
      { user: "user-1", tokenHash: await tokenHashOf(keep) },
      { user: "user-1", tokenHash: "stolen-session-hash" },
      { user: "user-1", tokenHash: "another-old-hash" },
    ];

    const revoked = await revokeOtherSessions("user-1", keep);

    expect(revoked).toBe(2);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.tokenHash).toBe(await tokenHashOf(keep));
  });

  it("never touches another account's sessions", async () => {
    const keep = "current-device-token";
    sessions = [
      { user: "user-1", tokenHash: await tokenHashOf(keep) },
      { user: "user-1", tokenHash: "user-1-other" },
      { user: "user-2", tokenHash: "user-2-session" },
    ];

    await revokeOtherSessions("user-1", keep);

    expect(sessions.map((s) => s.user)).toEqual(["user-1", "user-2"]);
  });

  it("revokes every session when no token is preserved", async () => {
    sessions = [
      { user: "user-1", tokenHash: "a" },
      { user: "user-1", tokenHash: "b" },
      { user: "user-2", tokenHash: "c" },
    ];

    const revoked = await revokeOtherSessions("user-1");

    expect(revoked).toBe(2);
    expect(sessions).toEqual([{ user: "user-2", tokenHash: "c" }]);
  });

  it("reports zero when the account had no other sessions", async () => {
    const keep = "only-token";
    sessions = [{ user: "user-1", tokenHash: await tokenHashOf(keep) }];

    expect(await revokeOtherSessions("user-1", keep)).toBe(0);
    expect(sessions).toHaveLength(1);
  });
});
