// @/vitest.setup.ts
//
// Several modules validate their environment at import time and throw when a
// variable is missing (lib/auth.ts SESSION_SECRET, lib/mongodb.ts
// MONGODB_URI, lib/paymentConfig.ts MANAGED-requires-Midtrans). Without this
// file those throws happen while Vitest is still *loading* a test module,
// which Vitest reports as a failed suite — and the tests inside it silently
// never run, without reducing the pass count. lib/authorization.test.ts was
// dead this way.
//
// Values are assigned with `??=` so a real environment (or a test that sets
// its own via vi.resetModules() + assignment) always wins.

process.env.SESSION_SECRET ??= "test-session-secret-not-used-in-production";
process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/grooma-test";
process.env.APPLICATION_ENVIRONMENT ??= "test";
process.env.INTERNAL_CRON_SECRET ??= "test-internal-cron-secret";

// lib/paymentConfig.ts treats an unset PAYMENT_INTEGRATION_MODE as MANAGED
// and then *requires* Midtrans credentials, so these two must be present for
// any test that transitively imports the payment or transaction services.
// Tests covering SELF_RECORDED override them explicitly.
process.env.MIDTRANS_SERVER_KEY ??= "SB-Mid-server-test-key";
process.env.MIDTRANS_CLIENT_KEY ??= "SB-Mid-client-test-key";
process.env.MIDTRANS_IS_PRODUCTION ??= "false";

// §23.8: subscription billing's Midtrans credentials are a SEPARATE,
// unconditional requirement in lib/paymentConfig.ts (not gated behind
// PAYMENT_INTEGRATION_MODE like the pair above) — every test that
// transitively imports it needs these set too, regardless of which payment
// mode that specific test is exercising.
process.env.GROOMA_BILLING_MIDTRANS_SERVER_KEY ??=
  "SB-Mid-billing-server-test-key";
process.env.GROOMA_BILLING_MIDTRANS_CLIENT_KEY ??=
  "SB-Mid-billing-client-test-key";
process.env.GROOMA_BILLING_MIDTRANS_IS_PRODUCTION ??= "false";
