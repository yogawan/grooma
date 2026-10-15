// @/app/scalar/docs/paths/payments.ts
const paymentResponse = {
  "application/json": {
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", enum: [true] },
        data: {
          type: "object",
          properties: { payment: { $ref: "#/components/schemas/Payment" } },
        },
      },
    },
  },
};

export const paymentPaths = {
  "/api/v1/payments/qris": {
    post: {
      tags: ["Payments"],
      operationId: "createQrisPayment",
      summary:
        "Create a fresh QRIS payment for an existing transaction (AGENT only)",
      description:
        "Used to retry after a failed charge at transaction-creation time, or after a prior QRIS code expired. Fails if the transaction is already PAID, CANCELLED, or already has a live (unexpired) pending payment.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                transactionId: {
                  type: "string",
                  pattern: "^[0-9a-f]{24}$",
                },
              },
              required: ["transactionId"],
            },
          },
        },
      },
      responses: {
        "201": {
          description: "Payment created with a fresh QRIS code",
          content: paymentResponse,
        },
        "400": { description: "Validation error" },
        "401": { description: "Not authenticated" },
        "402": { $ref: "#/components/responses/SubscriptionRequired" },
        "403": { description: "Not AGENT, or different branch" },
        "404": { description: "Transaction not found" },
        "409": {
          description:
            "Transaction already PAID, CANCELLED, or has a live pending payment",
        },
        "422": { description: "Transaction's paymentMethod is not QRIS" },
        "502": { description: "Midtrans charge request failed" },
      },
    },
  },
  "/api/v1/payments/{id}": {
    get: {
      tags: ["Payments"],
      operationId: "getPayment",
      summary:
        "Get payment detail (HOST, or the AGENT whose branch owns the underlying transaction)",
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": { description: "Payment detail", content: paymentResponse },
        "401": { description: "Not authenticated" },
        "402": { $ref: "#/components/responses/SubscriptionRequired" },
        "403": { description: "Different branch" },
        "404": { description: "Payment not found" },
      },
    },
  },
  "/api/v1/payments/midtrans/notification": {
    post: {
      tags: ["Payments"],
      operationId: "midtransNotification",
      summary: "Midtrans payment-gateway webhook (public, signature-verified)",
      description:
        'No session auth — trust comes entirely from HMAC signature verification plus re-fetching the authoritative status directly from Midtrans (the webhook body itself is never trusted beyond routing). Routes to the POS Payment flow or the subscription-billing SubscriptionInvoice flow based on the order_id prefix (GRM-SUB = billing). "Nothing to apply" outcomes — unknown order id, stale/duplicate notification, unrecognized status — are modeled as normal 200 responses (`applied: false`), not errors, since retrying them would never succeed and Midtrans would otherwise retry forever.',
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              description: "Raw Midtrans notification payload.",
              properties: {
                order_id: { type: "string" },
                status_code: { type: "string" },
                gross_amount: { type: "string" },
                signature_key: { type: "string" },
                transaction_status: { type: "string" },
              },
              required: [
                "order_id",
                "status_code",
                "gross_amount",
                "signature_key",
              ],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Notification processed (applied or safely ignored)",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      applied: { type: "boolean" },
                      reason: {
                        type: "string",
                        description:
                          "status_updated | idempotent_no_op | unknown_order | unmapped_status | invalid_transition",
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "400": {
          description:
            "Malformed payload, or gross_amount mismatch vs. the stored payment",
        },
        "403": { description: "Invalid notification signature" },
      },
    },
  },
};
