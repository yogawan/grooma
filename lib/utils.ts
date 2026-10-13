// @/lib/utils.ts

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Works whether a populated ref field is a raw ObjectId or a populated
// sub-document (Mongoose returns either depending on whether .populate()
// was called on that path).
export function extractRefId(ref: unknown): string {
  if (ref && typeof ref === "object" && "_id" in ref) {
    return String((ref as { _id: unknown })._id);
  }
  return String(ref);
}
