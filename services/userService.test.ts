// @/services/userService.test.ts
//
// Regression test: PATCH /users/{id} with branch: "" (empty string, not
// null) crashed with a 500 instead of clearing branch. Zod's branch field
// (z.string().nullable().optional()) accepts "" as a valid string, so it
// reached `user.branch = input.branch ?? null` — `??` only replaces
// null/undefined, so "" was assigned to an ObjectId-typed field as-is and
// Mongoose's cast threw at save time. Same bug existed in createUser. Fixed
// by switching both to `||`, since "" is the only falsy string this field
// can hold.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mongodb", () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth", () => ({
  hashPassword: vi.fn(async (plain: string) => `hashed:${plain}`),
  SERVICE_ROLES: ["HOST", "AGENT"],
}));

type BranchRef = string | { _id: string; name: string } | null;

interface FakeUserData {
  _id: string;
  username: string;
  name: string;
  role: string;
  branch: BranchRef;
  phone?: string;
  status: string;
}

const savedBranches: BranchRef[] = [];

class FakeUser {
  _id: string;
  username: string;
  name: string;
  role: string;
  branch: BranchRef;
  phone?: string;
  status: string;

  constructor(doc: FakeUserData) {
    this._id = doc._id;
    this.username = doc.username;
    this.name = doc.name;
    this.role = doc.role;
    this.branch = doc.branch;
    this.phone = doc.phone;
    this.status = doc.status;
  }

  async save() {
    savedBranches.push(this.branch);
    return this;
  }

  // Mirrors real Mongoose population just enough for serializeUser: a
  // truthy string id becomes a populated { _id, name } object.
  async populate() {
    if (typeof this.branch === "string" && this.branch) {
      this.branch = { _id: this.branch, name: "Mock Branch" };
    }
    return this;
  }
}

const EXISTING_HOST: FakeUserData = {
  _id: "mockuserid00000000000001",
  username: "owner",
  name: "Owner",
  role: "HOST",
  branch: null,
  status: "ACTIVE",
};

type NewUserDoc = Omit<FakeUserData, "_id">;

const userFindOne = vi.fn((..._args: unknown[]) =>
  Promise.resolve(new FakeUser({ ...EXISTING_HOST })),
);
const userCreate = vi.fn((...args: unknown[]) => {
  const doc = args[0] as NewUserDoc;
  return Promise.resolve(new FakeUser({ _id: "new-id", ...doc }));
});

vi.mock("@/models/User", () => ({
  default: {
    findOne: (...args: unknown[]) => userFindOne(...args),
    create: (...args: unknown[]) => userCreate(...args),
  },
}));

const branchExists = vi.fn().mockResolvedValue(true);
vi.mock("@/models/Branch", () => ({
  default: { exists: (...args: unknown[]) => branchExists(...args) },
}));

const { createUser, updateUser } = await import("@/services/userService");

beforeEach(() => {
  savedBranches.length = 0;
  vi.clearAllMocks();
  userFindOne.mockImplementation(
    async () => new FakeUser({ ...EXISTING_HOST }),
  );
  userCreate.mockImplementation(async (...args: unknown[]) => {
    const doc = args[0] as NewUserDoc;
    return new FakeUser({ _id: "new-id", ...doc });
  });
  branchExists.mockResolvedValue(true);
});

describe("updateUser branch handling", () => {
  it("saves branch as null when given an empty string, not the literal empty string", async () => {
    await updateUser("mockuserid00000000000001", { branch: "" });
    expect(savedBranches).toEqual([null]);
  });

  it("does not look up branch existence for an empty string", async () => {
    await updateUser("mockuserid00000000000001", { branch: "" });
    expect(branchExists).not.toHaveBeenCalled();
  });

  it("still saves branch as null when given null (no regression)", async () => {
    await updateUser("mockuserid00000000000001", { branch: null });
    expect(savedBranches).toEqual([null]);
  });

  it("still validates and assigns a real branch id (no regression)", async () => {
    await updateUser("mockuserid00000000000001", {
      branch: "aaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(branchExists).toHaveBeenCalledWith({
      _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(savedBranches).toEqual(["aaaaaaaaaaaaaaaaaaaaaaaa"]);
  });
});

describe("createUser branch handling", () => {
  it("passes branch: null to UserModel.create when given an empty string", async () => {
    await createUser({
      username: "newhost",
      password: "password123",
      name: "New Host",
      role: "HOST",
      branch: "",
    });

    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({ branch: null }),
    );
  });
});
