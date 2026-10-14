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
  username: string;
  password: string;
  name: string;
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
  vi.clearAllMocks();
  delete process.env.SEED_HOST_USERNAME;
  delete process.env.SEED_HOST_PASSWORD;
  delete process.env.SEED_HOST_NAME;
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

  it("does not block seeding a GROOMA_ADMIN alongside the HOST", async () => {
    users = [{ username: "owner", password: "x", name: "Owner", role: "HOST" }];
    process.env.SEED_ADMIN_USERNAME = "admin";
    process.env.SEED_ADMIN_PASSWORD = "password123";
    process.env.SEED_ADMIN_NAME = "Admin";

    await expect(
      seedUser({
        role: "GROOMA_ADMIN",
        usernameEnv: "SEED_ADMIN_USERNAME",
        passwordEnv: "SEED_ADMIN_PASSWORD",
        nameEnv: "SEED_ADMIN_NAME",
      }),
    ).resolves.toBeUndefined();

    expect(users.map((u) => u.role)).toEqual(["HOST", "GROOMA_ADMIN"]);
  });
});
