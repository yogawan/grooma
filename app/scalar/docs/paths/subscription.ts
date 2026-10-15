// @/app/scalar/docs/paths/subscription.ts
export const subscriptionPaths = {
  "/api/v1/subscription": {
    get: {
      tags: ["Subscriptions"],
      operationId: "getOwnSubscription",
      summary: "Get the current HOST's own platform subscription",
      responses: {
        "200": {
          description: "Subscription detail, or null if the HOST has none yet",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      subscription: {
                        oneOf: [
                          { $ref: "#/components/schemas/Subscription" },
                          { type: "null" },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "401": { description: "Not authenticated" },
      },
    },
  },
  "/api/v1/subscription/invoices": {
    get: {
      tags: ["Subscriptions"],
      operationId: "listOwnSubscriptionInvoices",
      summary: "List the current HOST's own subscription invoices",
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", default: 1 } },
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", default: 20, maximum: 100 },
        },
        {
          name: "status",
          in: "query",
          schema: {
            type: "string",
            enum: ["PENDING", "PAID", "FAILED", "EXPIRED", "REFUNDED"],
          },
        },
      ],
      responses: {
        "200": {
          description:
            "Paginated list of invoices (empty list if the HOST has no subscription yet)",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      invoices: {
                        type: "array",
                        items: {
                          $ref: "#/components/schemas/SubscriptionInvoice",
                        },
                      },
                      pagination: {
                        $ref: "#/components/schemas/PaginationAlt",
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "400": { description: "Validation error" },
        "401": { description: "Not authenticated" },
      },
    },
  },
  "/api/v1/subscription/invoices/{id}": {
    get: {
      tags: ["Subscriptions"],
      operationId: "getOwnSubscriptionInvoice",
      summary: "Get one of the current HOST's own invoices by id",
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": {
          description: "Invoice detail",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      invoice: {
                        $ref: "#/components/schemas/SubscriptionInvoice",
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "401": { description: "Not authenticated" },
        "403": {
          description:
            "The invoice exists but belongs to a different HOST's subscription.",
        },
        "404": {
          description:
            "The HOST has no subscription yet, or the invoice doesn't exist.",
        },
      },
    },
  },
};
