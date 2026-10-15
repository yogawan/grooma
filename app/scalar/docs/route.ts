// @/app/scalar/docs/route.ts
import { ApiReference } from "@scalar/nextjs-api-reference";
import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";
import { info, security, servers, tags } from "./_config";
import { responses, schemas, securitySchemes } from "./_schemas";
import { authPaths } from "./paths/auth";
import { branchPaths } from "./paths/branches";
import { customerPaths } from "./paths/customers";
import { dashboardPaths } from "./paths/dashboard";
import { internalPaths } from "./paths/internal";
import { inventoryPaths } from "./paths/inventory";
import { paymentPaths } from "./paths/payments";
import { profilePaths } from "./paths/profile";
import { servicePaths } from "./paths/services";
import { subscriptionPaths } from "./paths/subscription";
import { transactionChangeRequestPaths } from "./paths/transactionChangeRequests";
import { transactionPaths } from "./paths/transactions";
import { userPaths } from "./paths/users";

const specHandler = ApiReference({
  pageTitle: "Grooma API Documentation",
  content: {
    openapi: "3.1.0",
    info,
    servers,
    security,
    tags,
    components: { securitySchemes, schemas, responses },
    paths: {
      ...authPaths,
      ...profilePaths,
      ...branchPaths,
      ...userPaths,
      ...customerPaths,
      ...servicePaths,
      ...transactionPaths,
      ...transactionChangeRequestPaths,
      ...paymentPaths,
      ...inventoryPaths,
      ...dashboardPaths,
      ...subscriptionPaths,
      ...internalPaths,
    },
  },
});

// Hide Scalar docs in production — manually maintained spec, not meant to
// be a public-facing surface.
export const GET = async (_request: NextRequest) => {
  if (process.env.APPLICATION_ENVIRONMENT === "production") {
    notFound();
  }
  return specHandler();
};
