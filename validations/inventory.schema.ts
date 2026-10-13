// @/validations/inventory.schema.ts
import { z } from "zod";

const CATEGORY = ["HAIR_PRODUCT", "EQUIPMENT", "CONSUMABLE", "OTHER"] as const;

// branchId is only ever meaningful for HOST (who has no "own" branch to
// default to); AGENT's is always ignored in favor of their session branch,
// same precedent as Transaction creation — never trusted from the body.
export const createInventorySchema = z
  .object({
    itemCode: z.string().trim().min(1).max(32),
    branchId: z.string().min(1).optional(),
    name: z.string().trim().min(1).max(100),
    category: z.enum(CATEGORY).optional(),
    unit: z.string().trim().min(1).max(20).optional(),
    quantity: z.number().int().nonnegative().optional().default(0),
    unitCost: z.number().nonnegative().optional().default(0),
    minimumStock: z.number().int().nonnegative().optional(),
    supplier: z.string().trim().max(100).optional(),
  })
  .strict();
export type CreateInventoryInput = z.infer<typeof createInventorySchema>;

// itemCode is an identifier assigned at creation; quantity can only change
// through POST /inventory/:id/stock-movements, never this generic update —
// otherwise a direct quantity edit would bypass the InventoryMovement audit
// trail entirely (§5.7).
export const updateInventorySchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    category: z.enum(CATEGORY).optional(),
    unit: z.string().trim().min(1).max(20).optional(),
    unitCost: z.number().nonnegative().optional(),
    minimumStock: z.number().int().nonnegative().optional(),
    supplier: z.string().trim().max(100).optional(),
  })
  .strict();
export type UpdateInventoryInput = z.infer<typeof updateInventorySchema>;

export const listInventoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  branchId: z.string().min(1).optional(),
  search: z.string().trim().min(1).optional(),
  lowStockOnly: z.coerce.boolean().optional(),
});
export type ListInventoryQuery = z.infer<typeof listInventoryQuerySchema>;

// IN/OUT are relative (received N / used N); ADJUSTMENT is absolute (the
// true count is N, e.g. after a physical stock take) — matches how stock
// corrections are actually expressed, rather than forcing the caller to
// compute a signed delta themselves.
export const stockMovementSchema = z.discriminatedUnion("movementType", [
  z
    .object({
      movementType: z.literal("IN"),
      quantity: z.number().positive(),
      reason: z.string().trim().min(1).max(500),
    })
    .strict(),
  z
    .object({
      movementType: z.literal("OUT"),
      quantity: z.number().positive(),
      reason: z.string().trim().min(1).max(500),
    })
    .strict(),
  z
    .object({
      movementType: z.literal("ADJUSTMENT"),
      newQuantity: z.number().int().nonnegative(),
      reason: z.string().trim().min(1).max(500),
    })
    .strict(),
]);
export type StockMovementInput = z.infer<typeof stockMovementSchema>;

export const listStockMovementsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});
export type ListStockMovementsQuery = z.infer<
  typeof listStockMovementsQuerySchema
>;
