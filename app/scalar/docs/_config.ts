// @/app/scalar/docs/_config.ts
export const info = {
  title: "Grooma API Documentation",
  description: "Barbershop POS & Management System Backend API",
  version: "0.1.0",
};

export const servers = [
  { url: "http://localhost:3000", description: "Development server" },
  {
    url: "https://grooma-core-service.vercel.app",
    description: "Production server (placeholder — update once deployed)",
  },
];

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
