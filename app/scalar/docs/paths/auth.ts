// @/app/scalar/docs/paths/auth.ts
const userResponseContent = {
  "application/json": {
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", enum: [true] },
        data: {
          type: "object",
          properties: {
            user: { $ref: "#/components/schemas/User" },
          },
        },
      },
    },
  },
};

export const authPaths = {
  "/api/v1/auth/login": {
    post: {
      tags: ["Authentication"],
      operationId: "login",
      summary: "Login with username and password, sets the session cookie",
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                username: { type: "string", minLength: 1, maxLength: 64 },
                password: { type: "string", minLength: 1, maxLength: 128 },
              },
              required: ["username", "password"],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Login successful, grooma_session cookie set",
          content: userResponseContent,
        },
        "400": { description: "Validation error" },
        "401": {
          description: "Invalid credentials, or account is INACTIVE",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        "429": {
          description: "Too many login attempts (10 per 15 min per IP)",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
      },
    },
  },
  "/api/v1/auth/logout": {
    post: {
      tags: ["Authentication"],
      operationId: "logout",
      summary: "Revoke the current session and clear the session cookie",
      responses: {
        "200": { description: "Logout successful" },
        "401": { description: "Not authenticated" },
      },
    },
  },
  "/api/v1/auth/me": {
    get: {
      tags: ["Authentication"],
      operationId: "getCurrentUser",
      summary: "Get the current session's user profile",
      responses: {
        "200": {
          description: "Current user profile",
          content: userResponseContent,
        },
        "401": { description: "Not authenticated" },
      },
    },
  },
  "/api/v1/auth/change-password": {
    post: {
      tags: ["Authentication"],
      operationId: "changePassword",
      summary: "Change the current user's own password",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                currentPassword: {
                  type: "string",
                  minLength: 1,
                  maxLength: 128,
                },
                newPassword: { type: "string", minLength: 8, maxLength: 128 },
              },
              required: ["currentPassword", "newPassword"],
            },
          },
        },
      },
      responses: {
        "200": { description: "Password updated" },
        "400": { description: "Validation error" },
        "401": { description: "Not authenticated" },
        "422": {
          description:
            "currentPassword does not match (BUSINESS_RULE_VIOLATION)",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        "429": {
          description: "Too many attempts (5 per 15 min per user)",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
      },
    },
  },
};
