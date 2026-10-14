// @/app/scalar/docs/paths/services.ts
const serviceResponse = {
  "application/json": {
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", enum: [true] },
        data: {
          type: "object",
          properties: { service: { $ref: "#/components/schemas/Service" } },
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

const revenueSharing = {
  type: "object",
  description: "ownerPercentage + employeePercentage must sum to exactly 100.",
  properties: {
    ownerPercentage: { type: "number", minimum: 0, maximum: 100 },
    employeePercentage: { type: "number", minimum: 0, maximum: 100 },
  },
  required: ["ownerPercentage", "employeePercentage"],
};

export const servicePaths = {
  "/api/v1/services": {
    get: {
      tags: ["Services"],
      operationId: "listServices",
      summary: "List services — HOST sees all, AGENT sees active only",
      responses: {
        "200": {
          description: "List of services",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      services: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Service" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "401": { description: "Not authenticated" },
        "403": { description: "Not HOST/AGENT" },
      },
    },
    post: {
      tags: ["Services"],
      operationId: "createService",
      summary: "Create a service (HOST only)",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                serviceCode: { type: "string", minLength: 1, maxLength: 32 },
                name: { type: "string", minLength: 1, maxLength: 100 },
                description: { type: "string", maxLength: 1000 },
                category: { type: "string", maxLength: 50 },
                price: { type: "number", minimum: 0 },
                durationMinutes: { type: "integer", minimum: 1 },
                revenueSharing,
              },
              required: ["serviceCode", "name", "price", "revenueSharing"],
            },
          },
        },
      },
      responses: {
        "201": { description: "Service created", content: serviceResponse },
        "400": {
          description:
            "Validation error, or revenueSharing percentages don't sum to 100",
        },
        "401": { description: "Not authenticated" },
        "403": { description: "Not HOST" },
        "409": { description: "serviceCode already exists" },
      },
    },
  },
  "/api/v1/services/{id}": {
    get: {
      tags: ["Services"],
      operationId: "getService",
      summary: "Get service detail (HOST/AGENT)",
      parameters: [idParam],
      responses: {
        "200": { description: "Service detail", content: serviceResponse },
        "401": { description: "Not authenticated" },
        "403": { description: "Not HOST/AGENT" },
        "404": { description: "Service not found" },
      },
    },
    patch: {
      tags: ["Services"],
      operationId: "updateService",
      summary: "Update a service (HOST only, serviceCode is immutable)",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string", minLength: 1, maxLength: 100 },
                description: { type: "string", maxLength: 1000 },
                category: { type: "string", maxLength: 50 },
                price: { type: "number", minimum: 0 },
                durationMinutes: { type: "integer", minimum: 1 },
                revenueSharing,
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Service updated", content: serviceResponse },
        "400": {
          description:
            "Validation error, or revenueSharing percentages don't sum to 100",
        },
        "401": { description: "Not authenticated" },
        "403": { description: "Not HOST" },
        "404": { description: "Service not found" },
      },
    },
  },
  "/api/v1/services/{id}/status": {
    patch: {
      tags: ["Services"],
      operationId: "setServiceStatus",
      summary: "Activate/deactivate a service (HOST only)",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { isActive: { type: "boolean" } },
              required: ["isActive"],
            },
          },
        },
      },
      responses: {
        "200": { description: "Status updated", content: serviceResponse },
        "400": { description: "Validation error" },
        "401": { description: "Not authenticated" },
        "403": { description: "Not HOST" },
        "404": { description: "Service not found" },
      },
    },
  },
};
