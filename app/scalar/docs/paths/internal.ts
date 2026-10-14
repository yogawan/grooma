// @/app/scalar/docs/paths/internal.ts
export const internalPaths = {
  "/api/v1/internal/subscriptions/run-billing-cycle": {
    post: {
      tags: ["Internal"],
      operationId: "runBillingCycle",
      summary:
        "Billing-cycle cron job: expire overdue invoices/subscriptions, generate new period invoices",
      description:
        "Not part of the session-cookie API — authenticated with a static bearer secret (INTERNAL_CRON_SECRET) meant for a scheduler to call, and its response shape doesn't follow the usual { success, data } / { success: false, error } envelope used everywhere else.",
      security: [{ cronSecret: [] }],
      responses: {
        "200": {
          description: "Cycle completed",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  results: {
                    type: "object",
                    properties: {
                      invoicesGenerated: { type: "integer" },
                      invoicesExpired: { type: "integer" },
                      subscriptionsExpired: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
        "401": {
          description:
            "Missing or incorrect Authorization: Bearer <INTERNAL_CRON_SECRET> header",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  error: { type: "string", enum: ["Unauthorized"] },
                },
              },
            },
          },
        },
        "500": {
          description: "Unhandled failure during the cycle",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { error: { type: "string" } },
              },
            },
          },
        },
      },
    },
  },
};
