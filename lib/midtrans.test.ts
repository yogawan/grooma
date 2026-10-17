// @/lib/midtrans.test.ts
//
// §23.8: lib/midtrans.ts reads two independent Midtrans credential sets —
// "POS" (MIDTRANS_*, the HOST's own account) and "BILLING"
// (GROOMA_BILLING_MIDTRANS_*, Grooma's own account for subscription
// invoices). These tests prove the separation is real: each credentialSet
// reads its own env vars, a signature valid under one set's server key does
// NOT validate under the other's, and the cached Midtrans client per set is
// genuinely separate (not a single global reused regardless of argument).

import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const POS_SERVER_KEY = "pos-server-key";
const POS_CLIENT_KEY = "pos-client-key";
const BILLING_SERVER_KEY = "billing-server-key";
const BILLING_CLIENT_KEY = "billing-client-key";

function setBothCredentialSets() {
  process.env.MIDTRANS_SERVER_KEY = POS_SERVER_KEY;
  process.env.MIDTRANS_CLIENT_KEY = POS_CLIENT_KEY;
  process.env.MIDTRANS_IS_PRODUCTION = "false";
  process.env.GROOMA_BILLING_MIDTRANS_SERVER_KEY = BILLING_SERVER_KEY;
  process.env.GROOMA_BILLING_MIDTRANS_CLIENT_KEY = BILLING_CLIENT_KEY;
  process.env.GROOMA_BILLING_MIDTRANS_IS_PRODUCTION = "true";
}

function signFor(
  serverKey: string,
  payload: { order_id: string; status_code: string; gross_amount: string },
): string {
  return createHash("sha512")
    .update(
      `${payload.order_id}${payload.status_code}${payload.gross_amount}${serverKey}`,
    )
    .digest("hex");
}

describe("verifyNotificationSignature — credential separation", () => {
  beforeEach(() => {
    vi.resetModules();
    setBothCredentialSets();
  });

  it("validates a signature made with the POS server key under credentialSet POS", async () => {
    const { verifyNotificationSignature } = await import("@/lib/midtrans");
    const payload = {
      order_id: "GRM-20261016-000001",
      status_code: "200",
      gross_amount: "25000.00",
      signature_key: signFor(POS_SERVER_KEY, {
        order_id: "GRM-20261016-000001",
        status_code: "200",
        gross_amount: "25000.00",
      }),
    };

    expect(verifyNotificationSignature(payload, "POS")).toBe(true);
  });

  it("validates a signature made with the BILLING server key under credentialSet BILLING", async () => {
    const { verifyNotificationSignature } = await import("@/lib/midtrans");
    const payload = {
      order_id: "GRM-SUB-SUB-202610-000001",
      status_code: "200",
      gross_amount: "50000.00",
      signature_key: signFor(BILLING_SERVER_KEY, {
        order_id: "GRM-SUB-SUB-202610-000001",
        status_code: "200",
        gross_amount: "50000.00",
      }),
    };

    expect(verifyNotificationSignature(payload, "BILLING")).toBe(true);
  });

  it("rejects a POS-signed payload when checked against BILLING's key — the two must never be interchangeable", async () => {
    const { verifyNotificationSignature } = await import("@/lib/midtrans");
    const payload = {
      order_id: "GRM-20261016-000001",
      status_code: "200",
      gross_amount: "25000.00",
      signature_key: signFor(POS_SERVER_KEY, {
        order_id: "GRM-20261016-000001",
        status_code: "200",
        gross_amount: "25000.00",
      }),
    };

    expect(verifyNotificationSignature(payload, "BILLING")).toBe(false);
  });

  it("rejects a BILLING-signed payload when checked against POS's key", async () => {
    const { verifyNotificationSignature } = await import("@/lib/midtrans");
    const payload = {
      order_id: "GRM-SUB-SUB-202610-000001",
      status_code: "200",
      gross_amount: "50000.00",
      signature_key: signFor(BILLING_SERVER_KEY, {
        order_id: "GRM-SUB-SUB-202610-000001",
        status_code: "200",
        gross_amount: "50000.00",
      }),
    };

    expect(verifyNotificationSignature(payload, "POS")).toBe(false);
  });

  it("throws mentioning GROOMA_BILLING_MIDTRANS_SERVER_KEY specifically when that one is unset", async () => {
    delete process.env.GROOMA_BILLING_MIDTRANS_SERVER_KEY;
    const { verifyNotificationSignature } = await import("@/lib/midtrans");
    const payload = {
      order_id: "GRM-SUB-SUB-202610-000001",
      status_code: "200",
      gross_amount: "50000.00",
      signature_key: "irrelevant",
    };

    expect(() => verifyNotificationSignature(payload, "BILLING")).toThrow(
      /GROOMA_BILLING_MIDTRANS_SERVER_KEY/,
    );
  });

  it("throws mentioning MIDTRANS_SERVER_KEY specifically when that one is unset — not the billing var", async () => {
    delete process.env.MIDTRANS_SERVER_KEY;
    const { verifyNotificationSignature } = await import("@/lib/midtrans");
    const payload = {
      order_id: "GRM-20261016-000001",
      status_code: "200",
      gross_amount: "25000.00",
      signature_key: "irrelevant",
    };

    expect(() => verifyNotificationSignature(payload, "POS")).toThrow(
      /(?<!GROOMA_BILLING_)MIDTRANS_SERVER_KEY/,
    );
  });
});

describe("createQrisCharge / getTransactionStatus — separate cached clients per credential set", () => {
  const chargeMock = vi.fn().mockResolvedValue({
    transaction_id: "t-1",
    order_id: "o-1",
    transaction_status: "pending",
    gross_amount: "1000",
    actions: [],
  });
  const statusMock = vi.fn().mockResolvedValue({
    order_id: "o-1",
    transaction_id: "t-1",
    transaction_status: "pending",
    gross_amount: "1000",
  });
  const constructorCalls: Array<{
    isProduction: boolean;
    serverKey: string;
    clientKey: string;
  }> = [];

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    constructorCalls.length = 0;
    setBothCredentialSets();
  });

  it("constructs one client per credential set (not a shared global), and reuses each once cached", async () => {
    vi.doMock("midtrans-client", () => {
      class FakeCoreApi {
        charge = chargeMock;
        transaction = { status: statusMock };
        constructor(config: {
          isProduction: boolean;
          serverKey: string;
          clientKey: string;
        }) {
          constructorCalls.push(config);
        }
      }
      class FakeMidtransError extends Error {
        httpStatusCode?: number;
      }
      return {
        default: { CoreApi: FakeCoreApi, MidtransError: FakeMidtransError },
      };
    });

    const { createQrisCharge, getTransactionStatus } = await import(
      "@/lib/midtrans"
    );

    await createQrisCharge({ orderId: "o-1", grossAmount: 1000 }, "POS");
    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0]).toMatchObject({
      serverKey: POS_SERVER_KEY,
      clientKey: POS_CLIENT_KEY,
      isProduction: false,
    });

    // Same credential set again — must reuse the cached client, not
    // construct a second one.
    await getTransactionStatus("o-1", "POS");
    expect(constructorCalls).toHaveLength(1);

    // Different credential set — must construct a genuinely separate
    // client with BILLING's own keys, not reuse POS's.
    await createQrisCharge({ orderId: "o-2", grossAmount: 50000 }, "BILLING");
    expect(constructorCalls).toHaveLength(2);
    expect(constructorCalls[1]).toMatchObject({
      serverKey: BILLING_SERVER_KEY,
      clientKey: BILLING_CLIENT_KEY,
      isProduction: true,
    });

    // BILLING again — cached, still only 2 constructions total.
    await getTransactionStatus("o-2", "BILLING");
    expect(constructorCalls).toHaveLength(2);
  });
});
