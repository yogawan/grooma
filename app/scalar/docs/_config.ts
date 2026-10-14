// @/app/scalar/docs/_config.ts
export const info = {
  title: "Grooma API Documentation",
  description: "Barbershop POS & Management System Backend API",
  version: "0.1.0",
};

// One deployment serves one HOST (PRD §3.5), so there is no single "the
// production server" to name here — a hardcoded URL would be wrong on every
// deployment but the one it was written for. The base URL comes from the
// deployment's own environment instead.
//
// APP_BASE_URL is the explicit setting; VERCEL_PROJECT_PRODUCTION_URL /
// VERCEL_URL are read as a convenience so a Vercel deployment needs no extra
// configuration. Docs are hidden entirely when
// APPLICATION_ENVIRONMENT=production (see ./route.ts), so in practice this
// list describes the dev or staging instance being browsed.
function resolveBaseUrl(): string | null {
  const explicit = process.env.APP_BASE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }

  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim();
  if (vercelHost) {
    return `https://${vercelHost.replace(/\/+$/, "")}`;
  }

  return null;
}

const LOCAL_SERVER = {
  url: "http://localhost:3000",
  description: "Development server",
};

const baseUrl = resolveBaseUrl();

export const servers =
  baseUrl && baseUrl !== LOCAL_SERVER.url
    ? [{ url: baseUrl, description: "This deployment" }, LOCAL_SERVER]
    : [LOCAL_SERVER];

// Global default; endpoints that are actually public (login, the Midtrans
// webhook) override this with `security: []` on the operation itself.
export const security = [{ sessionCookie: [] }];

export const tags = [
  { name: "Authentication", description: "Login, logout, session management" },
  { name: "Profile", description: "Own-profile read/update (all roles)" },
  { name: "Branches", description: "Branch management (HOST only)" },
  { name: "Users", description: "Staff account management (HOST only)" },
  { name: "Customers", description: "Customer records (HOST/AGENT)" },
  { name: "Services", description: "Service catalog" },
  { name: "Transactions", description: "POS transactions" },
  { name: "Approvals", description: "Transaction change requests" },
  { name: "Payments", description: "QRIS payments & Midtrans webhook" },
  { name: "Inventory", description: "Stock management" },
  { name: "Dashboard", description: "Analytics & reporting" },
  { name: "Subscriptions", description: "HOST-facing platform subscription" },
  { name: "Admin", description: "GROOMA_ADMIN platform controls" },
  { name: "Internal", description: "Cron / service-to-service endpoints" },
];
