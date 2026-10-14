// @/app/scalar/docs/paths/profile.ts
const profileResponseContent = {
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

export const profilePaths = {
  "/api/v1/profile": {
    get: {
      tags: ["Profile"],
      operationId: "getOwnProfile",
      summary: "Get the current user's own profile (HOST or AGENT)",
      responses: {
        "200": { description: "Own profile", content: profileResponseContent },
        "401": { description: "Not authenticated" },
      },
    },
    patch: {
      tags: ["Profile"],
      operationId: "updateOwnProfile",
      summary: "Update the current user's own profile",
      description:
        "name/phone/address/photoUrl only — role, branch, username, and status can never be changed through this endpoint.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string", minLength: 1, maxLength: 100 },
                phone: { type: "string", maxLength: 32 },
                address: { type: "string", maxLength: 255 },
                photoUrl: { type: "string", maxLength: 2048 },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Profile updated",
          content: profileResponseContent,
        },
        "400": { description: "Validation error" },
        "401": { description: "Not authenticated" },
      },
    },
  },
};
