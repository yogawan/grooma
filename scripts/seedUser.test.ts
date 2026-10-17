// @/scripts/seedUser.test.ts
//
// Regression tests for L-4 and L-6:
//   L-4  the seeder trimmed the password, so a secret with surrounding
//        whitespace was hashed differently from what the operator set and
//        could never be used to log in. Username length was also unchecked,
//        letting a seeded account sit outside the 3-64 rule the API enforces
//        on every account created through POST /users.
//   L-6  nothing stopped a second HOST being seeded into a deployment, which
//        contradicts one-deployment-per-HOST (PRD §3.5) and silently creates
//        a second separately-billed account sharing all operational data.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mongodb", () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

const hashPassword = vi.fn(async (plain: string) => `hashed:${plain}`);
vi.mock("@/lib/auth", () => ({
  hashPassword: (plain: string) => hashPassword(plain),
}));

interface UserRow {
  _id?: string;
  username: string;
  password: string;
  name: string;
  phone?: string;
  role: string;
}

let users: UserRow[] = [];

vi.mock("@/models/User", () => ({
  default: {
    findOne: vi.fn((filter: { username?: string; role?: string }) => {
      const match = () =>
        users.find((u) => {
          if (filter.username !== undefined) {
            return u.username === filter.username;
          }
          if (filter.role !== undefined) {
            return u.role === filter.role;
          }
          return false;
        }) ?? null;

      // Supports both `findOne(...)` awaited directly and
      // `findOne(...).select(...).lean()`.
      return Object.assign(Promise.resolve(match()), {
        select: () => ({ lean: async () => match() }),
      });
    }),
    create: vi.fn(async (doc: UserRow) => {
      users.push({ ...doc, username: doc.username.toLowerCase() });
      return { ...doc, _id: `id-${users.length}` };
    }),
  },
}));

interface PlanRow {
  _id: string;
  code: string;
  isActive: boolean;
}

let plans: PlanRow[] = [];

vi.mock("@/models/SubscriptionPlan", () => ({
  default: {
    findOne: vi.fn((filter: { isActive?: boolean }) => ({
      sort: () =>
        Promise.resolve(
          plans.find((p) => p.isActive === filter.isActive) ?? null,
        ),
    })),
  },
}));

interface SubscriptionRow {
  _id: string;
  host: string;
  plan: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

let subscriptions: SubscriptionRow[] = [];

vi.mock("@/models/Subscription", () => ({
  default: {
    findOne: vi.fn((filter: { host: string }) =>
      Promise.resolve(
        subscriptions.find((s) => s.host === filter.host) ?? null,
      ),
    ),
    create: vi.fn(async (doc: Omit<SubscriptionRow, "_id">) => {
      const created = { ...doc, _id: `sub-${subscriptions.length + 1}` };
      subscriptions.push(created);
      return created;
    }),
  },
}));

const { seedUser } = await import("@/scripts/seedUser");

const HOST_OPTS = {
  role: "HOST" as const,
  usernameEnv: "SEED_HOST_USERNAME",
  passwordEnv: "SEED_HOST_PASSWORD",
  nameEnv: "SEED_HOST_NAME",
};

function setEnv(username: string, password: string, name = "Owner") {
  process.env.SEED_HOST_USERNAME = username;
  process.env.SEED_HOST_PASSWORD = password;
  process.env.SEED_HOST_NAME = name;
}

beforeEach(() => {
  users = [];
  subscriptions = [];
  // A default active plan exists in every test unless a specific test
  // clears it — most tests here aren't about the Subscription bootstrap at
  // all, and shouldn't have to care that seedUser now always needs one.
  plans = [{ _id: "plan-1", code: "STANDARD", isActive: true }];
  vi.clearAllMocks();
  delete process.env.SEED_HOST_USERNAME;
  delete process.env.SEED_HOST_PASSWORD;
  delete process.env.SEED_HOST_NAME;
  delete process.env.SEED_HOST_PHONE;
});

describe("seedUser input handling (L-4)", () => {
  it("hashes the password exactly as given, including outer whitespace", async () => {
    setEnv("owner", "  spaced secret  ");
    await seedUser(HOST_OPTS);

    // Trimming here would hash a different secret than the operator set.
    expect(hashPassword).toHaveBeenCalledWith("  spaced secret  ");
  });

  it("still trims identifiers", async () => {
    setEnv("  owner  ", "password123", "  Owner Name  ");
    await seedUser(HOST_OPTS);

    expect(users[0]?.username).toBe("owner");
    expect(users[0]?.name).toBe("Owner Name");
  });

  it("rejects a username shorter than the API's 3-character minimum", async () => {
    setEnv("ab", "password123");
    await expect(seedUser(HOST_OPTS)).rejects.toThrow(/3-64 characters/);
  });

  it("rejects a username longer than 64 characters", async () => {
    setEnv("x".repeat(65), "password123");
    await expect(seedUser(HOST_OPTS)).rejects.toThrow(/3-64 characters/);
  });

  it("rejects a password shorter than 8 characters", async () => {
    setEnv("owner", "short");
    await expect(seedUser(HOST_OPTS)).rejects.toThrow(/8-128 characters/);
  });

  it("rejects a password longer than 128 characters", async () => {
    setEnv("owner", "x".repeat(129));
    await expect(seedUser(HOST_OPTS)).rejects.toThrow(/8-128 characters/);
  });

  it("refuses to run without the required env vars", async () => {
    await expect(seedUser(HOST_OPTS)).rejects.toThrow(/Missing required/);
  });
});

describe("seedUser single-HOST guard (L-6)", () => {
  it("refuses to seed a second HOST into the same deployment", async () => {
    users = [{ username: "owner", password: "x", name: "Owner", role: "HOST" }];
    setEnv("second-owner", "password123");

    await expect(seedUser(HOST_OPTS)).rejects.toThrow(
      /already has a HOST account/,
    );
  });

  it("stays idempotent for the same username (no password overwrite)", async () => {
    users = [
      {
        username: "owner",
        password: "hashed:original",
        name: "Owner",
        role: "HOST",
      },
    ];
    setEnv("owner", "a-different-password");

    await seedUser(HOST_OPTS);

    // Skipped, not updated: re-running provisioning must not rotate a
    // live account's credentials.
    expect(hashPassword).not.toHaveBeenCalled();
    expect(users[0]?.password).toBe("hashed:original");
  });

  // A case here used to assert the guard did not fire when seeding a
  // GROOMA_ADMIN alongside the HOST. That role is seeded by the admin backend
  // now, so the guard is unconditional and there is no second role to exempt.
});

describe("seedUser optional phone", () => {
  const HOST_OPTS_WITH_PHONE = { ...HOST_OPTS, phoneEnv: "SEED_HOST_PHONE" };

  it("sets phone when provided", async () => {
    setEnv("owner", "password123");
    process.env.SEED_HOST_PHONE = "08123456789";

    await seedUser(HOST_OPTS_WITH_PHONE);

    expect(users[0]?.phone).toBe("08123456789");
  });

  it("omits phone when phoneEnv is unset — it's optional, not required", async () => {
    setEnv("owner", "password123");

    await seedUser(HOST_OPTS_WITH_PHONE);

    expect(users[0]?.phone).toBeUndefined();
  });

  it("treats a blank SEED_HOST_PHONE as not provided rather than an empty string", async () => {
    setEnv("owner", "password123");
    process.env.SEED_HOST_PHONE = "   ";

    await seedUser(HOST_OPTS_WITH_PHONE);

    expect(users[0]?.phone).toBeUndefined();
  });

  it("rejects a phone longer than 32 characters", async () => {
    setEnv("owner", "password123");
    process.env.SEED_HOST_PHONE = "0".repeat(33);

    await expect(seedUser(HOST_OPTS_WITH_PHONE)).rejects.toThrow(
      /at most 32 characters/,
    );
  });
});

describe("seedUser Subscription bootstrap (§23.7)", () => {
  function daysBetween(start: Date, end: Date): number {
    return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  }

  it("creates an ACTIVE Subscription, free for ~1 month, for a brand-new HOST", async () => {
    setEnv("owner", "password123");

    await seedUser(HOST_OPTS);

    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]).toMatchObject({
      host: "id-1",
      plan: "plan-1",
      status: "ACTIVE",
    });
    expect(
      daysBetween(
        subscriptions[0].currentPeriodStart,
        subscriptions[0].currentPeriodEnd,
      ),
    ).toBeGreaterThanOrEqual(28);
  });

  it("backfills a Subscription for an existing HOST that doesn't have one yet", async () => {
    users = [
      {
        _id: "existing-host-id",
        username: "owner",
        password: "hashed:original",
        name: "Owner",
        role: "HOST",
      },
    ];
    setEnv("owner", "irrelevant-does-not-overwrite");

    await seedUser(HOST_OPTS);

    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0].host).toBe("existing-host-id");
  });

  it("does not create a duplicate Subscription when one already exists", async () => {
    users = [
      {
        _id: "existing-host-id",
        username: "owner",
        password: "hashed:original",
        name: "Owner",
        role: "HOST",
      },
    ];
    subscriptions = [
      {
        _id: "sub-existing",
        host: "existing-host-id",
        plan: "plan-1",
        status: "ACTIVE",
        currentPeriodStart: new Date("2026-01-01"),
        currentPeriodEnd: new Date("2026-02-01"),
      },
    ];
    setEnv("owner", "password123");

    await seedUser(HOST_OPTS);

    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]._id).toBe("sub-existing");
  });

  it("throws a clear error when no active SubscriptionPlan exists yet", async () => {
    plans = [];
    setEnv("owner", "password123");

    await expect(seedUser(HOST_OPTS)).rejects.toThrow(/seed:plan/);
  });
});
