// @/app/scalar/docs/paths/inventory.ts
const itemResponse = {
  "application/json": {
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", enum: [true] },
        data: {
          type: "object",
          properties: { item: { $ref: "#/components/schemas/InventoryItem" } },
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

export const inventoryPaths = {
  "/api/v1/inventory": {
    get: {
      tags: ["Inventory"],
      operationId: "listInventory",
      summary: "List inventory items (HOST/AGENT, scoped to a branch)",
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", default: 1 } },
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", default: 20, maximum: 100 },
        },
        {
          name: "branchId",
          in: "query",
          schema: { type: "string" },
          description: "HOST only",
        },
        {
          name: "search",
          in: "query",
          schema: { type: "string" },
          description: "Matches item name",
        },
        { name: "lowStockOnly", in: "query", schema: { type: "boolean" } },
      ],
      responses: {
        "200": {
          description: "Paginated list of inventory items",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      items: {
                        type: "array",
                        items: { $ref: "#/components/schemas/InventoryItem" },
                      },
                      pagination: { $ref: "#/components/schemas/Pagination" },
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
      tags: ["Inventory"],
      operationId: "createInventoryItem",
      summary: "Create an inventory item (HOST/AGENT)",
      description:
        "branchId is required when the caller is HOST (no \"own\" branch to default to); for AGENT it's always ignored in favor of their session branch. A nonzero initial quantity auto-generates an IN stock movement so there's always an audit trail.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                itemCode: { type: "string", minLength: 1, maxLength: 32 },
                branchId: {
                  type: "string",
                  description: "Required for HOST, ignored for AGENT.",
                },
                name: { type: "string", minLength: 1, maxLength: 100 },
                category: {
                  type: "string",
                  enum: ["HAIR_PRODUCT", "EQUIPMENT", "CONSUMABLE", "OTHER"],
                },
                unit: { type: "string", maxLength: 20, default: "PCS" },
                quantity: { type: "integer", minimum: 0, default: 0 },
                unitCost: { type: "number", minimum: 0, default: 0 },
                minimumStock: { type: "integer", minimum: 0 },
                supplier: { type: "string", maxLength: 100 },
              },
              required: ["itemCode", "name"],
            },
          },
        },
      },
      responses: {
        "201": { description: "Item created", content: itemResponse },
        "400": { description: "Validation error, or branch does not exist" },
        "401": { description: "Not authenticated" },
        "403": { description: "Not HOST/AGENT" },
        "409": { description: "itemCode already exists" },
        "422": { description: "Agent has no assigned branch" },
      },
    },
  },
  "/api/v1/inventory/{id}": {
    get: {
      tags: ["Inventory"],
      operationId: "getInventoryItem",
      summary: "Get item detail (HOST/AGENT)",
      parameters: [idParam],
      responses: {
        "200": { description: "Item detail", content: itemResponse },
        "401": { description: "Not authenticated" },
        "403": { description: "Different branch" },
        "404": { description: "Item not found" },
      },
    },
    patch: {
      tags: ["Inventory"],
      operationId: "updateInventoryItem",
      summary: "Update an item (HOST/AGENT) — quantity cannot be changed here",
      description:
        "itemCode is immutable, and quantity is absent entirely — stock levels only ever change through POST .../stock-movements, so every quantity change is guaranteed an audit record.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string", minLength: 1, maxLength: 100 },
                category: {
                  type: "string",
                  enum: ["HAIR_PRODUCT", "EQUIPMENT", "CONSUMABLE", "OTHER"],
                },
                unit: { type: "string", maxLength: 20 },
                unitCost: { type: "number", minimum: 0 },
                minimumStock: { type: "integer", minimum: 0 },
                supplier: { type: "string", maxLength: 100 },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Item updated", content: itemResponse },
        "400": { description: "Validation error" },
        "401": { description: "Not authenticated" },
        "403": { description: "Different branch" },
        "404": { description: "Item not found" },
      },
    },
    delete: {
      tags: ["Inventory"],
      operationId: "deleteInventoryItem",
      summary: "Soft-delete an item (HOST/AGENT)",
      description:
        "A real HTTP DELETE, but always a soft delete under the hood (isActive: false) — items with stock history are never permanently removed.",
      parameters: [idParam],
      responses: {
        "200": { description: "Item deactivated", content: itemResponse },
        "401": { description: "Not authenticated" },
        "403": { description: "Different branch" },
        "404": { description: "Item not found" },
      },
    },
  },
  "/api/v1/inventory/{id}/stock-movements": {
    get: {
      tags: ["Inventory"],
      operationId: "listStockMovements",
      summary: "List stock movements for an item (HOST/AGENT)",
      parameters: [
        idParam,
        { name: "page", in: "query", schema: { type: "integer", default: 1 } },
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", default: 20, maximum: 100 },
        },
      ],
      responses: {
        "200": {
          description: "Paginated list of movements",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      movements: {
                        type: "array",
                        items: {
                          $ref: "#/components/schemas/InventoryMovement",
                        },
                      },
                      pagination: { $ref: "#/components/schemas/Pagination" },
                    },
                  },
                },
              },
            },
          },
        },
        "401": { description: "Not authenticated" },
        "403": { description: "Different branch" },
        "404": { description: "Item not found" },
      },
    },
    post: {
      tags: ["Inventory"],
      operationId: "createStockMovement",
      summary: "Record a stock movement — IN, OUT, or ADJUSTMENT (HOST/AGENT)",
      description:
        "IN/OUT are relative deltas (received N / used N); ADJUSTMENT takes the absolute true count instead, for stock-take corrections. Applied inside a MongoDB transaction so the Inventory quantity update and the InventoryMovement audit record are always atomic, with automatic retry on write conflicts from concurrent adjustments to the same item.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              oneOf: [
                {
                  type: "object",
                  properties: {
                    movementType: { type: "string", enum: ["IN"] },
                    quantity: { type: "number", exclusiveMinimum: 0 },
                    reason: { type: "string", minLength: 1, maxLength: 500 },
                  },
                  required: ["movementType", "quantity", "reason"],
                },
                {
                  type: "object",
                  properties: {
                    movementType: { type: "string", enum: ["OUT"] },
                    quantity: { type: "number", exclusiveMinimum: 0 },
                    reason: { type: "string", minLength: 1, maxLength: 500 },
                  },
                  required: ["movementType", "quantity", "reason"],
                },
                {
                  type: "object",
                  properties: {
                    movementType: { type: "string", enum: ["ADJUSTMENT"] },
                    newQuantity: { type: "integer", minimum: 0 },
                    reason: { type: "string", minLength: 1, maxLength: 500 },
                  },
                  required: ["movementType", "newQuantity", "reason"],
                },
              ],
            },
          },
        },
      },
      responses: {
        "201": {
          description: "Movement recorded",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      item: { $ref: "#/components/schemas/InventoryItem" },
                      movement: {
                        $ref: "#/components/schemas/InventoryMovement",
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
        "403": { description: "Different branch" },
        "404": { description: "Item not found" },
        "422": {
          description:
            "Item is inactive, or the resulting quantity would go negative (OUT exceeding stock)",
        },
      },
    },
  },
};
