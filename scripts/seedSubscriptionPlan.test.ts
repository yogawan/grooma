// @/scripts/seedSubscriptionPlan.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mongodb", () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

interface PlanRow {
  _id: string;
  code: string;
  name: string;
  price: number;
  currency: string;
  billingCycle: string;
}

let plans: PlanRow[] = [];

vi.mock("@/models/SubscriptionPlan", () => ({
  default: {
    findOne: vi.fn((filter: { code: string }) =>
      Promise.resolve(plans.find((p) => p.code === filter.code) ?? null),
    ),
    create: vi.fn((doc: { code: string; name: string; price: number }) => {
      const created: PlanRow = {
        _id: `id-${plans.length + 1}`,
        code: doc.code,
        name: doc.name,
        price: doc.price,
        currency: "IDR",
        billingCycle: "MONTHLY",
      };
      plans.push(created);
      return Promise.resolve(created);
    }),
  },
}));

const { seedSubscriptionPlan } = await import("@/scripts/seedSubscriptionPlan");

beforeEach(() => {
  plans = [];
  vi.clearAllMocks();
  delete process.env.SEED_PLAN_CODE;
  delete process.env.SEED_PLAN_NAME;
  delete process.env.SEED_PLAN_PRICE;
});

describe("seedSubscriptionPlan", () => {
  it("creates the default plan (Rp50.000/bulan, PRD §23.1) when none exists", async () => {
    await seedSubscriptionPlan();

    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      code: "STANDARD",
      name: "Standard",
      price: 50000,
    });
  });

  it("is idempotent — does not create a duplicate for the same code", async () => {
    await seedSubscriptionPlan();
    await seedSubscriptionPlan();

    expect(plans).toHaveLength(1);
  });

  it("honors SEED_PLAN_CODE/NAME/PRICE overrides", async () => {
    process.env.SEED_PLAN_CODE = "PREMIUM";
    process.env.SEED_PLAN_NAME = "Premium";
    process.env.SEED_PLAN_PRICE = "150000";

    await seedSubscriptionPlan();

    expect(plans[0]).toMatchObject({
      code: "PREMIUM",
      name: "Premium",
      price: 150000,
    });
  });

  it("rejects a non-numeric SEED_PLAN_PRICE", async () => {
    process.env.SEED_PLAN_PRICE = "not-a-number";

    await expect(seedSubscriptionPlan()).rejects.toThrow(
      /must be a non-negative number/,
    );
  });

  it("rejects a negative SEED_PLAN_PRICE", async () => {
    process.env.SEED_PLAN_PRICE = "-100";

    await expect(seedSubscriptionPlan()).rejects.toThrow(
      /must be a non-negative number/,
    );
  });
});
