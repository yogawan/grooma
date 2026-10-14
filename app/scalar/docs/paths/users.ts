// @/app/scalar/docs/paths/users.ts
const userResponse = {
  "application/json": {
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", enum: [true] },
        data: {
          type: "object",
          properties: { user: { $ref: "#/components/schemas/User" } },
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

export const userPaths = {
  "/api/v1/users": {
    get: {
      tags: ["Users"],
      operationId: "listUsers",
      summary:
        "List staff accounts (HOST only; GROOMA_ADMIN accounts never appear)",
      responses: {
        "200": {
          description: "List of users",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      users: {
                        type: "array",
                        items: { $ref: "#/components/schemas/User" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "401": { description: "Not authenticated" },
        "403": { description: "Not HOST" },
      },
    },
    post: {
      tags: ["Users"],
      operationId: "createUser",
      summary:
        "Create a staff account (HOST only; role is HOST or AGENT, never GROOMA_ADMIN)",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                username: { type: "string", minLength: 3, maxLength: 64 },
                password: { type: "string", minLength: 8, maxLength: 128 },
                name: { type: "string", minLength: 1, maxLength: 100 },
                role: { type: "string", enum: ["HOST", "AGENT"] },
                branch: {
                  type: "string",
                  nullable: true,
                  description:
                    "Required for role=AGENT; must be null/absent for role=HOST.",
                },
                phone: { type: "string", maxLength: 32 },
                address: { type: "string", maxLength: 255 },
                photoUrl: { type: "string", maxLength: 2048 },
              },
              required: ["username", "password", "name", "role"],
            },
          },
        },
      },
      responses: {
        "201": { description: "User created", content: userResponse },
        "400": { description: "Validation error, or branch does not exist" },
        "401": { description: "Not authenticated" },
        "403": { description: "Not HOST" },
        "409": { description: "username already exists" },
      },
    },
  },
  "/api/v1/users/{id}": {
    get: {
      tags: ["Users"],
      operationId: "getUser",
      summary: "Get user detail (HOST only)",
      parameters: [idParam],
      responses: {
        "200": { description: "User detail", content: userResponse },
        "401": { description: "Not authenticated" },
        "403": { description: "Not HOST" },
        "404": { description: "User not found" },
      },
    },
    patch: {
      tags: ["Users"],
      operationId: "updateUser",
      summary:
        "Update a user (HOST only; username is immutable, password changes via self-service only)",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string", minLength: 1, maxLength: 100 },
                role: { type: "string", enum: ["HOST", "AGENT"] },
                branch: { type: "string", nullable: true },
                phone: { type: "string", maxLength: 32 },
                address: { type: "string", maxLength: 255 },
                photoUrl: { type: "string", maxLength: 2048 },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "User updated", content: userResponse },
        "400": { description: "Validation error, or branch does not exist" },
        "401": { description: "Not authenticated" },
        "403": { description: "Not HOST" },
        "404": { description: "User not found" },
      },
    },
  },
  "/api/v1/users/{id}/status": {
    patch: {
      tags: ["Users"],
      operationId: "setUserStatus",
      summary: "Set user status ACTIVE/INACTIVE (HOST only)",
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
        "200": { description: "Status updated", content: userResponse },
        "400": { description: "Validation error" },
        "401": { description: "Not authenticated" },
        "403": { description: "Not HOST" },
        "404": { description: "User not found" },
      },
    },
  },
};
