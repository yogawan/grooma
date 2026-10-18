// @/lib/pagination.ts
//
// One definition of the pagination contract (docs/PAGINATION-CONTRACT.md), so
// the `pages` vs `totalPages` split that this module replaces cannot happen
// again: four services each hand-rolled the same object literal, and one of
// them named the fourth field differently.
import { z } from "zod";

export const PAGINATION_MAX_LIMIT = 100;
export const PAGINATION_DEFAULT_LIMIT = 20;

// Spread into a list-query schema rather than exported as a ready-made object
// so each schema keeps its own filter fields alongside these two:
//   z.object({ ...paginationQueryFields, search: z.string().optional() })
//
// Deliberately NOT .strict() at the call sites: every pre-existing list-query
// schema in validations/ is non-strict, and query strings legitimately collect
// params the server does not own (cache-busters, analytics tags). Request
// *bodies* are the place .strict() earns its keep.
export const paginationQueryFields = {
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(PAGINATION_MAX_LIMIT)
    .optional()
    .default(PAGINATION_DEFAULT_LIMIT),
};

export const paginationQuerySchema = z.object(paginationQueryFields);
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  pagination: PaginationMeta;
}

export function paginationSkip(query: PaginationQuery): number {
  return (query.page - 1) * query.limit;
}

// `page`/`limit` are echoed as requested, not clamped to what was actually
// served: a client sitting on page 99 of a 7-page result needs to see its own
// position next to `totalPages` to correct it. Clamping to 7 here would make
// the overshoot invisible.
export function buildPaginationMeta(
  query: PaginationQuery,
  total: number,
): PaginationMeta {
  return {
    page: query.page,
    limit: query.limit,
    total,
    // Math.ceil(0 / n) is already 0, so an empty result reports totalPages: 0
    // rather than a phantom first page.
    totalPages: Math.ceil(total / query.limit),
  };
}

export function toPaginated<T>(
  items: T[],
  query: PaginationQuery,
  total: number,
): Paginated<T> {
  return { items, pagination: buildPaginationMeta(query, total) };
}

// Mongoose's Query and Aggregate don't share an interface, and .lean() /
// .populate() change the resolved type per call site, so the two halves are
// taken as already-built thenables. Running them with Promise.all keeps the
// count concurrent with the fetch, which is what every call site did by hand.
export async function paginateQueries<T>(
  findQuery: PromiseLike<T[]>,
  countQuery: PromiseLike<number>,
  query: PaginationQuery,
): Promise<Paginated<T>> {
  const [items, total] = await Promise.all([findQuery, countQuery]);
  return toPaginated(items, query, total);
}

// Appends a unique tie-breaker to a sort spec. Offset pagination is only
// correct over a total order: with `{ name: 1 }` alone, two items sharing a
// name may come back in either relative order per query, so paging through
// the set can skip one row and repeat another. `_id` inherits the primary
// key's direction so the overall ordering stays intuitive.
//
// Takes the sort spec rather than being applied inside each service so the
// intent is greppable and a new list endpoint has an obvious thing to call.
export function stableSort<T extends Record<string, 1 | -1>>(
  sort: T,
): T & { _id: 1 | -1 } {
  const directions = Object.values(sort);
  const last = directions[directions.length - 1];
  return { ...sort, _id: last === -1 ? -1 : 1 };
}
