// @/app/api/v1/dashboard/routeGuards.test.ts
//
// Guard-rail for H-2. The behavioural half of this fix lives in
// lib/authorization.test.ts ("dashboard access policy"), which proves
// requireRole rejects a role outside the allowed list. That alone would not
// notice if someone deleted the requireRole call from a route, which is
// exactly how the gap existed in the first place — all six routes ran on
// requireAuth only, and dashboardService then resolved its branch filter to
// "no filter" for a branch-less platform role and returned business-wide
// figures (PRD §3.1/§3.2).
//
// Reading source text is a blunt instrument, but it is the only check that
// actually fails when the gate disappears, short of booting the route with a
// database behind it.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DASHBOARD_ROUTES = [
  "summary",
  "revenue",
  "services",
  "agents",
  "transactions",
  "inventory",
];

function routeSource(name: string): string {
  const file = path.join(
    process.cwd(),
    "app/api/v1/dashboard",
    name,
    "route.ts",
  );
  // Collapse whitespace so formatting changes don't break the assertion.
  return readFileSync(file, "utf8").replace(/\s+/g, " ");
}

describe("dashboard routes are gated to HOST and AGENT", () => {
  it.each(DASHBOARD_ROUTES)("%s route calls requireRole", (name) => {
    const source = routeSource(name);

    expect(source).toContain("requireAuth");
    expect(source).toContain('requireRole(user, ["HOST", "AGENT"])');
  });

  it("covers every dashboard route that exists on disk", async () => {
    const { readdirSync } = await import("node:fs");
    const dir = path.join(process.cwd(), "app/api/v1/dashboard");
    const onDisk = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    // If a new dashboard endpoint is added, this fails until it is added to
    // DASHBOARD_ROUTES above and gated like the rest.
    expect(onDisk).toEqual([...DASHBOARD_ROUTES].sort());
  });
});
