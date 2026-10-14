// @/app/scalar/docs/paths/admin.ts
const planResponse = {
  "application/json": {
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", enum: [true] },
        data: {
          type: "object",
          properties: {
            plan: { $ref: "#/components/schemas/SubscriptionPlan" },
          },
        },
      },
    },
  },
};

const subscriptionResponse = {
  "application/json": {
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", enum: [true] },
        data: {
          type: "object",
          properties: {
            subscription: { $ref: "#/components/schemas/Subscription" },
          },
        },
      },
    },
  },
};

const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string" },
};

export const adminPaths = {
  "/api/v1/admin/subscription-plans": {
    get: {
      tags: ["Admin"],
      operationId: "listSubscriptionPlans",
      summary: "List all subscription plans (GROOMA_ADMIN only)",
      responses: {
        "200": {
          description: "List of plans",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      plans: {
                        type: "array",
                        items: {
                          $ref: "#/components/schemas/SubscriptionPlan",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "401": { description: "Not authenticated" },
        "403": { description: "Not GROOMA_ADMIN" },
      },
    },
    post: {
      tags: ["Admin"],
      operationId: "createSubscriptionPlan",
      summary: "Create a subscription plan (GROOMA_ADMIN only)",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                code: { type: "string", minLength: 1, maxLength: 32 },
                name: { type: "string", minLength: 1, maxLength: 100 },
                description: { type: "string", maxLength: 500 },
                price: { type: "number", minimum: 0 },
                currency: {
                  type: "string",
                  enum: ["IDR", "USD"],
                  default: "IDR",
                },
                billingCycle: {
                  type: "string",
                  enum: ["MONTHLY", "ANNUAL"],
                  default: "MONTHLY",
                },
                graceDays: {
                  type: "integer",
                  minimum: 0,
                  maximum: 30,
                  default: 3,
                },
                maxBranches: { type: "integer", minimum: 1, default: 1 },
              },
              required: ["code", "name", "price"],
            },
          },
        },
      },
      responses: {
        "201": { description: "Plan created", content: planResponse },
        "400": { description: "Validation error" },
        "401": { description: "Not authenticated" },
        "403": { description: "Not GROOMA_ADMIN" },
        "409": { description: "Plan code already exists" },
      },
    },
  },
  "/api/v1/admin/subscription-plans/{id}": {
    get: {
      tags: ["Admin"],
      operationId: "getSubscriptionPlan",
      summary: "Get plan detail (GROOMA_ADMIN only)",
      parameters: [idParam],
      responses: {
        "200": { description: "Plan detail", content: planResponse },
        "401": { description: "Not authenticated" },
        "403": { description: "Not GROOMA_ADMIN" },
        "404": { description: "Plan not found" },
      },
    },
    patch: {
      tags: ["Admin"],
      operationId: "updateSubscriptionPlan",
      summary: "Update a plan (GROOMA_ADMIN only; code is immutable)",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string", minLength: 1, maxLength: 100 },
                description: { type: "string", maxLength: 500 },
                price: { type: "number", minimum: 0 },
                graceDays: { type: "integer", minimum: 0, maximum: 30 },
                maxBranches: { type: "integer", minimum: 1 },
                isActive: { type: "boolean" },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Plan updated", content: planResponse },
        "400": { description: "Validation error" },
        "401": { description: "Not authenticated" },
        "403": { description: "Not GROOMA_ADMIN" },
        "404": { description: "Plan not found" },
      },
    },
  },
  "/api/v1/admin/subscriptions": {
    get: {
      tags: ["Admin"],
      operationId: "listAllSubscriptions",
      summary: "List all HOST subscriptions platform-wide (GROOMA_ADMIN only)",
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
            enum: ["ACTIVE", "PAST_DUE", "EXPIRED", "CANCELLED"],
          },
        },
        { name: "hostId", in: "query", schema: { type: "string" } },
      ],
      responses: {
        "200": {
          description: "Paginated list of subscriptions",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      subscriptions: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Subscription" },
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
        "403": { description: "Not GROOMA_ADMIN" },
      },
    },
  },
  "/api/v1/admin/subscriptions/{id}": {
    get: {
      tags: ["Admin"],
      operationId: "getSubscription",
      summary: "Get subscription detail (GROOMA_ADMIN only)",
      parameters: [idParam],
      responses: {
        "200": {
          description: "Subscription detail",
          content: subscriptionResponse,
        },
        "401": { description: "Not authenticated" },
        "403": { description: "Not GROOMA_ADMIN" },
        "404": { description: "Subscription not found" },
      },
    },
    patch: {
      tags: ["Admin"],
      operationId: "overrideSubscriptionStatus",
      summary: "Manually override a subscription's status (GROOMA_ADMIN only)",
      description: "cancelReason is required when setting status to CANCELLED.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                status: {
                  type: "string",
                  enum: ["ACTIVE", "PAST_DUE", "EXPIRED", "CANCELLED"],
                },
                cancelReason: { type: "string", maxLength: 500 },
              },
              required: ["status"],
            },
          },
        },
      },
      responses: {
        "200": { description: "Status updated", content: subscriptionResponse },
        "400": {
          description:
            "Validation error, or status=CANCELLED without cancelReason",
        },
        "401": { description: "Not authenticated" },
        "403": { description: "Not GROOMA_ADMIN" },
        "404": { description: "Subscription not found" },
      },
    },
  },
};
