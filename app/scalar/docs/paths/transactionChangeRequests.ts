// @/app/scalar/docs/paths/transactionChangeRequests.ts
const transactionResponse = {
  "application/json": {
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", enum: [true] },
        data: {
          type: "object",
          properties: {
            transaction: { $ref: "#/components/schemas/Transaction" },
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
  description:
    "This is the Transaction's id — a change request has no collection/id of its own.",
  schema: { type: "string" },
};

export const transactionChangeRequestPaths = {
  "/api/v1/transaction-change-requests": {
    get: {
      tags: ["Approvals"],
      operationId: "listPendingChangeRequests",
      summary:
        "List all PENDING change requests across every branch (HOST only)",
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", default: 1 } },
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", default: 20, maximum: 100 },
        },
      ],
      responses: {
        "200": {
          description:
            "Paginated list of transactions with a pending change request",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      transactions: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Transaction" },
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
        "403": { description: "Not HOST" },
      },
    },
  },
  "/api/v1/transaction-change-requests/{id}": {
    get: {
      tags: ["Approvals"],
      operationId: "getChangeRequest",
      summary:
        "Get a change request's detail (HOST, or the AGENT who submitted it)",
      parameters: [idParam],
      responses: {
        "200": {
          description: "Change request detail",
          content: transactionResponse,
        },
        "401": { description: "Not authenticated" },
        "403": { description: "Not HOST and not the original requester" },
        "404": { description: "No change request exists for this transaction" },
      },
    },
  },
  "/api/v1/transaction-change-requests/{id}/approve": {
    post: {
      tags: ["Approvals"],
      operationId: "approveChangeRequest",
      summary:
        "Approve a pending change request (HOST only, cannot approve your own request)",
      description:
        "Re-validates the requested service/customer against current state (not just what was true at submission time) and writes a permanent changeHistory entry recording before/after.",
      parameters: [idParam],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                reviewNote: { type: "string", maxLength: 1000 },
                approvalReference: { type: "string", maxLength: 255 },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Request approved and changes applied",
          content: transactionResponse,
        },
        "400": { description: "Validation error" },
        "401": { description: "Not authenticated" },
        "403": {
          description: "Not HOST, or attempting to approve your own request",
        },
        "404": { description: "Transaction not found" },
        "409": { description: "Change request is not PENDING" },
        "422": {
          description: "Requested service/customer is no longer available",
        },
      },
    },
  },
  "/api/v1/transaction-change-requests/{id}/reject": {
    post: {
      tags: ["Approvals"],
      operationId: "rejectChangeRequest",
      summary:
        "Reject a pending change request (HOST only, reviewNote required)",
      description:
        "The transaction itself is left untouched — only the change request's own status changes.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                reviewNote: { type: "string", minLength: 1, maxLength: 1000 },
              },
              required: ["reviewNote"],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Request rejected",
          content: transactionResponse,
        },
        "400": { description: "Validation error" },
        "401": { description: "Not authenticated" },
        "403": { description: "Not HOST" },
        "404": { description: "Transaction not found" },
        "409": { description: "Change request is not PENDING" },
      },
    },
  },
};
