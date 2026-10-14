// @/lib/midtrans.ts
import { createHash } from "node:crypto";
import midtransClient from "midtrans-client";
import { Errors } from "./errors";

// Credentials are read lazily, NOT at module scope. A SELF_RECORDED
// deployment (§9.6) belongs to a host that collects on its own QRIS and
// therefore has no Midtrans account at all — yet this module sits on the
// import path of every transaction route (transactionService ->
// paymentService -> here). Throwing at import time would make those routes
// fail to load entirely on a perfectly valid deployment.
function requireServerKey(): string {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    throw Errors.paymentGateway(
      "Midtrans is not configured for this deployment (MIDTRANS_SERVER_KEY is unset).",
    );
  }
  return serverKey;
}

// Credentials never leave the server: this module is only ever imported
// from route handlers / services, never from client components (§9.1).
let cachedCoreApi: InstanceType<typeof midtransClient.CoreApi> | null = null;

function getCoreApi() {
  if (cachedCoreApi) {
    return cachedCoreApi;
  }

  const clientKey = process.env.MIDTRANS_CLIENT_KEY;
  if (!clientKey) {
    throw Errors.paymentGateway(
      "Midtrans is not configured for this deployment (MIDTRANS_CLIENT_KEY is unset).",
    );
  }

  cachedCoreApi = new midtransClient.CoreApi({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
    serverKey: requireServerKey(),
    clientKey,
  });

  return cachedCoreApi;
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

export async function createQrisCharge(params: {
  orderId: string;
  grossAmount: number;
}): Promise<QrisChargeResult> {
  let response: Record<string, unknown>;

  try {
    response = await withTimeout(
      getCoreApi().charge({
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
): Promise<MidtransStatusResult> {
  let response: Record<string, unknown>;

  try {
    response = await withTimeout(
      getCoreApi().transaction.status(orderId),
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
// documented notification signature formula (§9.3).
export function verifyNotificationSignature(
  payload: MidtransNotificationPayload,
): boolean {
  const expected = createHash("sha512")
    .update(
      `${payload.order_id}${payload.status_code}${payload.gross_amount}${requireServerKey()}`,
    )
    .digest("hex");

  return expected === payload.signature_key;
}
