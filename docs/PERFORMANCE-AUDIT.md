# Performance Audit — Phase 7 Hardening

Systematic review of indexing strategy, N+1 query risks, and pagination compliance.

> **Erratum 2026-10-19.** The "Pagination Compliance" section and the pagination line in
> the Verdict asserted a level of compliance that the code never had. Both have been
> corrected in place and the incorrect claims are quoted so the drift stays traceable.
> The normative pagination contract is now **`docs/PAGINATION-CONTRACT.md`**.

---

## Database Indexes Review

### User Collection
**Current indexes:**
- `username` (unique)
- `branch` (ref to Branch)

**N+1 Risk Assessment:**
- ✓ `listUsers`: populates branch once per user → branch data fetched in bulk via Mongoose populate
- ✓ `getUserById`: populates branch as single ref

**Recommendation:**
- Add index on `status` for fast filtering of active/inactive users
- Index on `role` (some reports may filter by role)

**Decision:** Post-MVP. Indexes on enum fields help for large datasets (10k+ docs). Current user count is expected to be hundreds per branch.

---

### Branch Collection
**Current indexes:**
- `branchCode` (unique)

**N+1 Risk Assessment:**
- ✓ No queries that loop over branches with nested lookups
- ✓ Used mostly as a ref target; queries are direct

**No action needed.**

---

### Transaction Collection
**Current indexes:**
- `agent` (ref to User)
- `customer` (ref to Customer)
- `service` (ref to Service)
- `branch` (ref to Branch)
- `transactionCode` (unique)
- `createdAt` (for time-range queries)

**N+1 Risk Assessment:**
- ✓ `listTransactions`: populates agent, branch, customer all together in one populate chain
- ✓ `getReceiptPrint`: same populate
- ✓ Dashboard aggregations: use $group _id/$sum to avoid fetching full docs

**Potential improvements:**
- Compound index on `(branch, transactionStatus)` would optimize `baseTransactionMatch(branchId)` with status filter
- Compound index on `(branch, createdAt)` would optimize dashboard date-range queries per branch

**Decision:** Add compound indexes for branch-scoped dashboard queries (high query volume expected from reporting).

---

### Customer Collection
**Current indexes:**
- `branchId` (ref)
- `phone` (not currently indexed, but used for deduplication)

**N+1 Risk Assessment:**
- ✓ `listCustomers`: no populate, only text search via $regex
- ✓ Phone deduplication: generates phoneVariants and uses $in, but phoneVariants is a computed-on-read array, not pre-indexed

**Recommended improvements:**
- Add index on `phone` to accelerate the deduplication check (phoneVariants query should be fast)
- Compound index on `(branch, isActive)` for branch-scoped listing

**Decision:** Add `phone` index for deduplication performance.

---

### Service Collection
**Current indexes:**
- `branchId` (ref)

**N+1 Risk Assessment:**
- ✓ `listServices`: no populate needed
- ✓ `getServiceById`: single lookup

**Compound index on `(branch, isActive)` recommended for AGENT role's force-to-active filter.**

---

### Payment Collection
**Current indexes:**
- `transaction` (ref, unique)
- `providerOrderId` (unique)

**N+1 Risk Assessment:**
- ✓ `processMidtransNotification`: looks up payment by providerOrderId, then populates transaction
- ✓ No query loops

**No action needed. providerOrderId uniqueness prevents duplicates.**

---

### Inventory Collection
**Current indexes:**
- `(branch, status)` compound index

**N+1 Risk Assessment:**
- ✓ `listItems`: filters by branch and lowStockOnly, uses $expr to avoid extra fetch
- ✓ `adjustStock`: reads one doc, modifies it within transaction (no N+1)
- ✓ Stock movements: appended to array, no separate collection query

**Compound index on `(branch, isActive)` recommended for list filters.**

---

### Session Collection
**Current indexes:**
- `expiresAt` (TTL index for auto-cleanup)
- `user` (ref)

**N+1 Risk Assessment:**
- ✓ `getSessionUser`: looks up session by token hash, populates user once
- ✓ No query loops

**No action needed.**

---

### Rate Limit Counter Collection
**Current indexes:**
- `key` (for fast increment)
- `resetAt` (TTL index for auto-cleanup)

**N+1 Risk Assessment:**
- ✓ `checkRateLimit`: one atomic update per request

**No action needed.**

---

## Pagination Compliance

> **CORRECTED 2026-10-19.** The original version of this section claimed `GET /users`,
> `GET /customers`, and `GET /services` were "paginated (1-100, default 20)" and that all
> list endpoints were compliant. None of those three has ever accepted `page`/`limit` —
> the claim was never true. The list also omitted `/branches`,
> `/inventory/{id}/stock-movements`, `/subscription/invoices`, and five of the six
> `/dashboard/*` endpoints. The table below was re-derived by reading
> `app/api/v1/**`, `services/*.ts`, and `validations/*.ts` directly.
>
> The canonical pagination contract now lives in **`docs/PAGINATION-CONTRACT.md`** —
> that document, not this section, is the source of truth for the required shape.

### Actual state (verified against code, 2026-10-19)

**Paginated — `page`/`limit` via Zod, bounds 1–100, default 20:**
- `GET /transactions` → `{ transactions, pagination: { page, limit, total, totalPages } }`
- `GET /transaction-change-requests` → `{ transactions, pagination: { …totalPages } }`
- `GET /inventory` → `{ items, pagination: { …totalPages } }`
- `GET /inventory/{id}/stock-movements` → `{ movements, pagination: { …totalPages } }`
- `GET /subscription/invoices` → `{ invoices, pagination: { page, limit, total, pages } }`
  — same bounds, but the fourth field is named `pages`, not `totalPages`
  (see PAGINATION-CONTRACT §9.1). Its `status` filter is validated then discarded (§9.3),
  and the "no subscription yet" early-return hardcodes `page: 1, limit: 20` regardless of
  what the client asked for (§9.2).

**Not paginated — whole collection returned in one response:**
- `GET /customers` — only a raw `search` param, read straight off `searchParams` with no
  Zod schema at all. Without `search`, returns every customer row.
- `GET /users` — no query params. Same file estimates "hundreds per branch" above.
- `GET /services` — no query params.
- `GET /branches` — no query params (AGENT always gets ≤ 1 row; HOST gets all).

**Aggregate endpoints — capped server-side, no pagination param:**
- `GET /dashboard/services` — hard `$limit: 10`, cap not exposed in the response
- `GET /dashboard/inventory` — hard `.limit(20)`, cap not exposed in the response
- `GET /dashboard/transactions` — bounded by enum cardinality (safe structurally)
- `GET /dashboard/summary` — single object (not a list)

**Aggregate endpoints with no upper bound at all:**
- `GET /dashboard/agents` — no `$limit`; row count grows with the number of agents who
  transacted in the window
- `GET /dashboard/revenue` → `byPeriod` — bucket count is driven by the client's
  `from`/`to`; `?period=DAY&from=2015-01-01&to=2026-12-31` yields thousands of buckets
  from one request that passes validation

**Sort stability:** none of the five paginated queries appends a unique tie-breaker to its
`sort`. Offset pagination over a non-unique sort key can skip or duplicate rows across
pages — see PAGINATION-CONTRACT §4.

**Score:** 4 of 11. The denominator is `GET` endpoints whose row count has **no structural
upper bound** — the four paginated-and-compliant, `/subscription/invoices`, the four
unpaginated collections, and the two unbounded aggregations. The hard-capped and
enum-bounded dashboard endpoints are excluded: their volume is safe, their problem is that
a truncated result is indistinguishable from a complete one.

**Decision:** adopt `docs/PAGINATION-CONTRACT.md` as the normative shape and work the
staged rollout checklist in its §10. No code was changed as part of this correction.

---

## Query Performance Bottlenecks

### High-volume queries (dashboard):
1. **getSummary**: $group entire transaction collection within date range
   - ✓ Uses $match on createdAt early to limit docs before $group
   - ✓ Single aggregation, minimal stages
   - **Optimization:** Compound index on `(branch, createdAt)` would skip collection scan

2. **getRevenue**: two separate aggregations (byPeriod + paymentBreakdown)
   - ✓ Both use early $match filter
   - ⚠ `byPeriod` has no bound on bucket count — the client controls `from`/`to` and
     `period`, so the output row count is client-controlled (corrected 2026-10-19)
   - **Optimization:** Could combine into single $facet for one pass

3. **getServicePerformance**: $group by service within date range
   - ✓ Sorted by revenue descending, limited to top 10
   - ✓ serviceSnapshot is embedded (no separate fetch)
   - ⚠ The cap is not visible in the response — a truncated top-10 is indistinguishable
     from a complete list

4. **getAgentPerformance**: $group by agent within date range
   - ✓ Agent name NOT hydrated (stored as agent ID only) per design
   - Clients fetch agent metadata separately
   - ⚠ **No `$limit` stage at all** — unlike getServicePerformance, which caps at 10.
     Nothing bounds the row count (corrected 2026-10-19)

5. **getInventorySummary**: find() with $expr filter
   - ✓ Limits to 20 results
   - ✓ Branch scoped
   - ⚠ Cap not exposed in the response; a HOST with 60 low-stock items sees 20 with no
     indication the list was cut

---

## Connection & Caching

**Session caching:** ✓
- `globalThis.__groomaMongooseCache` persists connection across hot reloads
- Single connection reused per serverless instance

**No N+1 on populate chains:** ✓
- All `.populate()` calls use multiple fields in one chain, not sequential populates
- Example: `.populate("agent").populate("customer")` in `listTransactions`

---

## Recommended Index Additions (Phase 7)

```javascript
// Transaction collection
db.transactions.createIndex({ branch: 1, transactionStatus: 1 })
db.transactions.createIndex({ branch: 1, createdAt: -1 })

// Customer collection
db.customers.createIndex({ phone: 1 })
db.customers.createIndex({ branch: 1, isActive: 1 })

// Service collection
db.services.createIndex({ branch: 1, isActive: 1 })

// Inventory collection
db.inventory.createIndex({ branch: 1, isActive: 1 })

// User collection
db.users.createIndex({ status: 1 })
db.users.createIndex({ role: 1 })
```

**Expected benefit:** 10-50ms faster queries for branch-scoped filtering and date-range dashboards on large datasets (10k+ transactions).

---

## Verdict

**Status: ACCEPTABLE for MVP launch.**

Current implementation:
- ✓ No obvious N+1 query patterns
- ✓ Populate chains consolidated
- ✗ ~~Pagination enforced on all list endpoints~~ — **withdrawn 2026-10-19.** 4 of 11
  multi-row `GET` endpoints are paginated; `/customers`, `/users`, `/services`, and
  `/branches` return their whole collection, and two dashboard aggregations have no
  upper bound. See the corrected Pagination Compliance section above.
- ✓ TTL indexes for session/rate-limit auto-cleanup

Post-MVP improvements:
- Add compound indexes on frequently filtered fields (branch + status/createdAt)
- Add phone index for customer deduplication
- Optionally add pagination to dashboard aggregations for very high volumes (1000+ results)

**Sign-off:** Phase 7 performance audit COMPLETE — *with the pagination claim since
withdrawn.* The rest of this document (index review, N+1 assessment, connection caching)
was not re-audited on 2026-10-19 and remains as originally written; treat it with the
same scepticism until independently verified.
