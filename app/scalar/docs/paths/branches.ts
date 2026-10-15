// @/app/scalar/docs/paths/branches.ts
const branchResponse = {
  "application/json": {
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", enum: [true] },
        data: {
          type: "object",
          properties: { branch: { $ref: "#/components/schemas/Branch" } },
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

export const branchPaths = {
  "/api/v1/branches": {
    get: {
      tags: ["Branches"],
      operationId: "listBranches",
      summary: "List branches — HOST sees all, AGENT sees only their own",
      responses: {
        "200": {
          description: "List of branches",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      branches: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Branch" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "401": { description: "Not authenticated" },
        "402": { $ref: "#/components/responses/SubscriptionRequired" },
      },
    },
    post: {
      tags: ["Branches"],
      operationId: "createBranch",
      summary: "Create a branch (HOST only)",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                branchCode: { type: "string", minLength: 1, maxLength: 32 },
                name: { type: "string", minLength: 1, maxLength: 100 },
                address: { type: "string", maxLength: 255 },
                phone: { type: "string", maxLength: 32 },
                timezone: {
                  type: "string",
                  description: "IANA timezone, defaults to Asia/Jakarta",
                },
              },
              required: ["branchCode", "name"],
            },
          },
        },
      },
      responses: {
        "201": { description: "Branch created", content: branchResponse },
        "400": { description: "Validation error" },
        "401": { description: "Not authenticated" },
        "402": { $ref: "#/components/responses/SubscriptionRequired" },
        "403": { description: "Not HOST" },
        "409": { description: "branchCode already exists" },
      },
    },
  },
  "/api/v1/branches/{id}": {
    get: {
      tags: ["Branches"],
      operationId: "getBranch",
      summary: "Get branch detail",
      parameters: [idParam],
      responses: {
        "200": { description: "Branch detail", content: branchResponse },
        "401": { description: "Not authenticated" },
        "402": { $ref: "#/components/responses/SubscriptionRequired" },
        "403": {
          description: "AGENT requesting a branch other than their own",
        },
        "404": { description: "Branch not found" },
      },
    },
    patch: {
      tags: ["Branches"],
      operationId: "updateBranch",
      summary: "Update a branch (HOST only, branchCode is immutable)",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string", minLength: 1, maxLength: 100 },
                address: { type: "string", maxLength: 255 },
                phone: { type: "string", maxLength: 32 },
                timezone: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Branch updated", content: branchResponse },
        "400": { description: "Validation error" },
        "401": { description: "Not authenticated" },
        "402": { $ref: "#/components/responses/SubscriptionRequired" },
        "403": { description: "Not HOST" },
        "404": { description: "Branch not found" },
      },
    },
  },
  "/api/v1/branches/{id}/status": {
    patch: {
      tags: ["Branches"],
      operationId: "setBranchStatus",
      summary: "Set branch status ACTIVE/INACTIVE (HOST only)",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                status: { type: "string", enum: ["ACTIVE", "INACTIVE"] },
              },
              required: ["status"],
            },
          },
        },
      },
      responses: {
        "200": { description: "Status updated", content: branchResponse },
        "400": { description: "Validation error" },
        "401": { description: "Not authenticated" },
        "402": { $ref: "#/components/responses/SubscriptionRequired" },
        "403": { description: "Not HOST" },
        "404": { description: "Branch not found" },
      },
    },
  },
};
