// @/app/scalar/docs/paths/customers.ts
const customerResponse = {
  "application/json": {
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", enum: [true] },
        data: {
          type: "object",
          properties: { customer: { $ref: "#/components/schemas/Customer" } },
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

const customerFieldsSchema = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1, maxLength: 100 },
    phone: { type: "string", maxLength: 32 },
    email: { type: "string", format: "email", maxLength: 254 },
    gender: {
      type: "string",
      enum: ["MALE", "FEMALE", "OTHER", "UNSPECIFIED"],
    },
    birthDate: { type: "string", format: "date" },
    address: { type: "string", maxLength: 255 },
    notes: { type: "string", maxLength: 1000 },
  },
};

export const customerPaths = {
  "/api/v1/customers": {
    get: {
      tags: ["Customers"],
      operationId: "listCustomers",
      summary:
        "List customers, optionally filtered by name/phone search (HOST/AGENT)",
      parameters: [
        {
          name: "search",
          in: "query",
          schema: { type: "string" },
          description:
            "Matches name (regex) or phone (normalized Indonesian format variants).",
        },
      ],
      responses: {
        "200": {
          description: "List of customers",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      customers: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Customer" },
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
      tags: ["Customers"],
      operationId: "createCustomer",
      summary: "Create a customer (HOST/AGENT)",
      description:
        "If phone matches an existing customer (in any Indonesian local/international format), that existing customer is returned instead of creating a duplicate.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { ...customerFieldsSchema, required: ["name"] },
          },
        },
      },
      responses: {
        "201": {
          description: "Customer created (or matched existing by phone)",
          content: customerResponse,
        },
        "400": { description: "Validation error" },
        "401": { description: "Not authenticated" },
        "403": { description: "Not HOST/AGENT" },
      },
    },
  },
  "/api/v1/customers/{id}": {
    get: {
      tags: ["Customers"],
      operationId: "getCustomer",
      summary: "Get customer detail (HOST/AGENT)",
      parameters: [idParam],
      responses: {
        "200": { description: "Customer detail", content: customerResponse },
        "401": { description: "Not authenticated" },
        "403": { description: "Not HOST/AGENT" },
        "404": { description: "Customer not found" },
      },
    },
    patch: {
      tags: ["Customers"],
      operationId: "updateCustomer",
      summary: "Update a customer (HOST/AGENT)",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: customerFieldsSchema } },
      },
      responses: {
        "200": { description: "Customer updated", content: customerResponse },
        "400": { description: "Validation error" },
        "401": { description: "Not authenticated" },
        "403": { description: "Not HOST/AGENT" },
        "404": { description: "Customer not found" },
      },
    },
  },
  "/api/v1/customers/{id}/status": {
    patch: {
      tags: ["Customers"],
      operationId: "setCustomerStatus",
      summary: "Activate/deactivate a customer (HOST only)",
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
        "200": { description: "Status updated", content: customerResponse },
        "400": { description: "Validation error" },
        "401": { description: "Not authenticated" },
        "403": { description: "Not HOST" },
        "404": { description: "Customer not found" },
      },
    },
  },
};
