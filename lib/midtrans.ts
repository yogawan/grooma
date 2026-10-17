// @/lib/midtrans.ts
import { createHash } from "node:crypto";
import midtransClient from "midtrans-client";
import { Errors } from "./errors";

// Two independent Midtrans merchant accounts (PRD §23.1/§23.8): "POS" is
// the HOST's own account (used only when PAYMENT_INTEGRATION_MODE=MANAGED,
// §9.6); "BILLING" is Grooma's own account for subscription invoices,
// required on every deployment regardless of the HOST's own mode. They
// must never be conflated — each is signed with its own server key, so
// using the wrong one for a notification doesn't just misattribute money,
// it fails signature verification outright. Every call site below must
// say which one it means; there is no default.
export type MidtransCredentialSet = "POS" | "BILLING";

interface MidtransCredentials {
  serverKey: string | undefined;
  clientKey: string | undefined;
  isProduction: boolean;
}

function readCredentials(set: MidtransCredentialSet): MidtransCredentials {
  if (set === "BILLING") {
    return {
      serverKey: process.env.GROOMA_BILLING_MIDTRANS_SERVER_KEY,
      clientKey: process.env.GROOMA_BILLING_MIDTRANS_CLIENT_KEY,
      isProduction:
        process.env.GROOMA_BILLING_MIDTRANS_IS_PRODUCTION === "true",
    };
  }

  return {
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY,
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  };
}

function envVarName(
  set: MidtransCredentialSet,
  key: "SERVER_KEY" | "CLIENT_KEY",
): string {
  return set === "BILLING"
    ? `GROOMA_BILLING_MIDTRANS_${key}`
    : `MIDTRANS_${key}`;
}

// Credentials are read lazily, NOT at module scope. A SELF_RECORDED
// deployment (§9.6) belongs to a host that collects on its own QRIS and
// therefore has no POS Midtrans account at all — yet this module sits on
// the import path of every transaction route (transactionService ->
// paymentService -> here). Throwing at import time would make those routes
// fail to load entirely on a perfectly valid deployment.
function requireServerKey(set: MidtransCredentialSet): string {
  const { serverKey } = readCredentials(set);
  if (!serverKey) {
    throw Errors.paymentGateway(
      `Midtrans is not configured for this deployment (${envVarName(set, "SERVER_KEY")} is unset).`,
    );
  }
  return serverKey;
}

// Credentials never leave the server: this module is only ever imported
// from route handlers / services, never from client components (§9.1).
// One cached client per credential set, not one global — POS and BILLING
// are different Midtrans accounts with different base behavior.
const cachedCoreApi: Partial<
  Record<MidtransCredentialSet, InstanceType<typeof midtransClient.CoreApi>>
> = {};

function getCoreApi(set: MidtransCredentialSet) {
  const cached = cachedCoreApi[set];
  if (cached) {
    return cached;
  }

  const { clientKey, isProduction } = readCredentials(set);
  if (!clientKey) {
    throw Errors.paymentGateway(
      `Midtrans is not configured for this deployment (${envVarName(set, "CLIENT_KEY")} is unset).`,
    );
  }

  const api = new midtransClient.CoreApi({
    isProduction,
    serverKey: requireServerKey(set),
    clientKey,
  });
  cachedCoreApi[set] = api;

  return api;
}

const QRIS_EXPIRY_MINUTES = 15;
const REQUEST_TIMEOUT_MS = 10_000;

// The SDK's internal axios instance sets no request timeout at all, so a
// slow/unresponsive upstream would otherwise hang the caller indefinitely
// (confirmed against the live sandbox — see PLAN-GROOMA.md Phase 3 notes).
function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(Errors.paymentGateway(`Midtrans ${label} request timed out.`));
    }, REQUEST_TIMEOUT_MS);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export interface QrisChargeResult {
  providerTransactionId: string;
  providerOrderId: string;
  transactionStatus: string;
  grossAmount: number;
  qrCodeUrl: string | null;
  qrString: string | null;
  expiresAt: Date;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof midtransClient.MidtransError) {
    return `${error.message} (http ${error.httpStatusCode ?? "?"})`;
  }
  return error instanceof Error ? error.message : String(error);
}

export async function createQrisCharge(
  params: { orderId: string; grossAmount: number },
  credentialSet: MidtransCredentialSet,
): Promise<QrisChargeResult> {
  let response: Record<string, unknown>;

  try {
    response = await withTimeout(
      getCoreApi(credentialSet).charge({
        payment_type: "qris",
        transaction_details: {
          order_id: params.orderId,
          gross_amount: params.grossAmount,
        },
        custom_expiry: {
          expiry_duration: QRIS_EXPIRY_MINUTES,
          unit: "minute",
        },
      }),
      "charge",
    );
  } catch (error) {
    throw Errors.paymentGateway(
      `Failed to create QRIS charge: ${toErrorMessage(error)}`,
    );
  }

  const actions = Array.isArray(response.actions) ? response.actions : [];
  const qrAction = actions.find(
    (action): action is { name: unknown; url: unknown } =>
      typeof action === "object" &&
      action !== null &&
      "name" in action &&
      (action as { name: unknown }).name === "generate-qr-code",
  );

  return {
    providerTransactionId: String(response.transaction_id ?? ""),
    providerOrderId: String(response.order_id ?? params.orderId),
    transactionStatus: String(response.transaction_status ?? "pending"),
    grossAmount: Number(response.gross_amount ?? params.grossAmount),
    qrCodeUrl:
      qrAction && typeof qrAction.url === "string" ? qrAction.url : null,
    qrString:
      typeof response.qr_string === "string" ? response.qr_string : null,
    expiresAt: new Date(Date.now() + QRIS_EXPIRY_MINUTES * 60 * 1000),
  };
}

export interface MidtransStatusResult {
  providerOrderId: string;
  providerTransactionId: string;
  transactionStatus: string;
  grossAmount: number;
  fraudStatus: string | null;
}

// Re-fetches the authoritative status directly from Midtrans using our
// server key, rather than trusting any field in an inbound webhook body
// (§9.2 step 2, §9.3).
export async function getTransactionStatus(
  orderId: string,
  credentialSet: MidtransCredentialSet,
): Promise<MidtransStatusResult> {
  let response: Record<string, unknown>;

  try {
    response = await withTimeout(
      getCoreApi(credentialSet).transaction.status(orderId),
      "status check",
    );
  } catch (error) {
    throw Errors.paymentGateway(
      `Failed to fetch transaction status: ${toErrorMessage(error)}`,
    );
  }

  return {
    providerOrderId: String(response.order_id ?? orderId),
    providerTransactionId: String(response.transaction_id ?? ""),
    transactionStatus: String(response.transaction_status ?? ""),
    grossAmount: Number(response.gross_amount ?? 0),
    fraudStatus:
      typeof response.fraud_status === "string" ? response.fraud_status : null,
  };
}

export interface MidtransNotificationPayload {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
}

// SHA512(order_id + status_code + gross_amount + server_key) — Midtrans's
// documented notification signature formula (§9.3). server_key must be the
// key belonging to whichever merchant account actually produced this
// notification — the caller picks credentialSet based on the order_id
// prefix (§9.5/§23.8) before this is ever called.
export function verifyNotificationSignature(
  payload: MidtransNotificationPayload,
  credentialSet: MidtransCredentialSet,
): boolean {
  const expected = createHash("sha512")
    .update(
      `${payload.order_id}${payload.status_code}${payload.gross_amount}${requireServerKey(credentialSet)}`,
    )
    .digest("hex");

  return expected === payload.signature_key;
}
