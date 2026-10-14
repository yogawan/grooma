// @/lib/paymentConfig.ts

// §9.6: Grooma runs one deployment per HOST (§3.5), so the payment
// integration mode is a property of the deployment, not a row in its
// database — it is set once during provisioning alongside MONGODB_URI and
// the Midtrans credentials, which is the only moment it can actually
// change.
export type PaymentIntegrationMode = "MANAGED" | "SELF_RECORDED";

const VALID_MODES: PaymentIntegrationMode[] = ["MANAGED", "SELF_RECORDED"];

function hasMidtransCredentials(): boolean {
  return Boolean(
    process.env.MIDTRANS_SERVER_KEY && process.env.MIDTRANS_CLIENT_KEY,
  );
}

function parseMode(raw: string | undefined): PaymentIntegrationMode {
  // Unset means MANAGED, which keeps the Midtrans-backed behavior that
  // predates this variable. That is only a safe default because the
  // credential check below turns "forgot to set the mode" into a boot
  // failure rather than a deployment that silently waits for webhooks from
  // a Midtrans account it doesn't have.
  if (raw === undefined || raw.trim() === "") {
    return "MANAGED";
  }

  const normalized = raw.trim();
  if (!VALID_MODES.includes(normalized as PaymentIntegrationMode)) {
    throw new Error(
      `Invalid PAYMENT_INTEGRATION_MODE "${raw}". Expected one of: ${VALID_MODES.join(", ")}.`,
    );
  }

  return normalized as PaymentIntegrationMode;
}

export function getPaymentIntegrationMode(): PaymentIntegrationMode {
  return parseMode(process.env.PAYMENT_INTEGRATION_MODE);
}

// Fail at boot rather than at the first attempted sale. MANAGED without
// credentials is unrecoverable at runtime, and the failure would otherwise
// surface as a broken checkout in front of a customer.
//
// The inverse (SELF_RECORDED *with* credentials left in place) is allowed:
// harmless, and common when a host migrates from MANAGED to its own QRIS.
if (getPaymentIntegrationMode() === "MANAGED" && !hasMidtransCredentials()) {
  throw new Error(
    "PAYMENT_INTEGRATION_MODE is MANAGED but MIDTRANS_SERVER_KEY/MIDTRANS_CLIENT_KEY are missing. " +
      "Set both (this host collects through Grooma's Midtrans integration), " +
      'or set PAYMENT_INTEGRATION_MODE="SELF_RECORDED" if the host collects on its own QRIS.',
  );
}
