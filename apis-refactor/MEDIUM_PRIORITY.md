# MEDIUM PRIORITY API Refactoring

**Timeline:** Week 3-4 | **Effort:** Low-Medium | **Impact:** Important

These 6 items improve data consistency, operational safety, and code organization. Can be done in parallel with or after High Priority.

---

## Task #5: Extract Date Filtering & Search Patterns

**Status:** ⬜ TODO

**Effort:** 3-4 hours | **Complexity:** Medium

**Problem:** Date range filtering and text search duplicated across multiple endpoints:
- Claims filter by `dateFrom`, `dateTo`
- Payouts filter by date range
- Audit logs filter by date range
- Each endpoint reimplements validation and Prisma query logic

**Solution:** Utility functions for common filter patterns.

**Implementation Plan:**

1. Create `backend/src/utils/filters.ts`:
```typescript
export interface DateRangeFilter {
  from?: Date
  to?: Date
}

export function parseDateRangeParams(from?: string, to?: string): DateRangeFilter
export function buildDateRangeWhere(filter: DateRangeFilter, field: string): any
export function buildSearchWhere(searchTerm: string, fields: string[]): any
export function parseSearchParams(q?: string, fields?: string[]): any
```

2. Utility functions to extract:
   - `parseDateRangeParams()` — validate and parse dateFrom/dateTo query strings
   - `buildDateRangeWhere()` — generate Prisma where clause for date ranges
   - `buildSearchWhere()` — generate Prisma where clause for text search
   - `parseSearchParams()` — extract and validate search query

3. Update these endpoints:
   - GET /claims (filters: status, type, dateFrom, dateTo, search)
   - GET /admin/audit-logs (filters: dateFrom, dateTo)
   - GET /payouts (filters: dateFrom, dateTo)
   - GET /reports/tat (filters: dateFrom, dateTo)

**Files to Change:**
- Backend: utils/filters.ts (new), routes/claims.ts, routes/admin.ts, routes/payouts.ts, routes/reports.ts

**Testing:**
- Unit tests for filter parsing and where clause generation
- Integration tests for endpoints using new filters

---

## Task #6: Add Transaction Support

**Status:** ⬜ TODO

**Effort:** 2-3 hours | **Complexity:** Medium

**Problem:** Multi-step operations that should be atomic are not wrapped in transactions:
- Claim submission: create claim + create claim event + create audit log
- Claim action execution: update claim + create event + create notification
- Payout processing: update multiple claims + create payout record

If one step fails, data becomes inconsistent.

**Solution:** Wrap all multi-step operations in Prisma transactions.

**Implementation Plan:**

1. Identify transaction boundaries:
   - Claim state transitions (submit, approve, reject, etc.)
   - Payout processing (batch claim updates)
   - Auto-assignment (claim update + event creation)

2. Update these handlers:
   - POST /claims (create + event + audit)
   - POST /claims/:id/actions (update + event + audit + notification)
   - POST /payouts (process all claims as atomic unit)
   - Claim auto-assignment in assignment service

3. Pattern:
```typescript
await prisma.$transaction([
  prisma.claim.update({...}),
  prisma.claimEvent.create({...}),
  prisma.auditLog.create({...}),
])
```

**Files to Change:**
- Backend: routes/claims.ts, routes/payouts.ts, services/assignment.ts, routes/documents.ts (upload)

**Testing:**
- Integration tests that simulate transaction failures
- Verify rollback behavior when steps fail

---

## Task #7: Soft Deletes

**Status:** ⬜ TODO

**Effort:** 4-5 hours | **Complexity:** Medium

**Problem:** Hard deletes (destructive, unauditable) currently used for:
- Deleting claims
- Deleting documents
- Deactivating users

Should support:
- Audit trail (who deleted, when, why)
- Recovery/undelete capability
- Query filters to exclude deleted records by default

**Solution:** Add `deletedAt` timestamp field to models; implement soft delete pattern.

**Schema Changes:**

Add to Prisma models:
```prisma
deletedAt DateTime?
deletedBy String?

user User? @relation(fields: [deletedBy], references: [id])
```

Affected models:
- Claim
- Document
- User
- Notification (optional)

**Implementation Plan:**

1. Update schema:
   - Add `deletedAt` and `deletedBy` to Claim, Document, User
   - Run `pnpm db:push`

2. Utility function `backend/src/utils/softDelete.ts`:
```typescript
export async function softDelete(model: any, id: string, userId: string)
export function excludeDeleted(where: any, field: string = 'deletedAt'): any
```

3. Update these routes:
   - DELETE /claims/:id → soft delete instead of hard delete
   - DELETE /documents/:id → soft delete
   - POST /admin/users/:id/deactivate → use soft delete with note

4. Update all list queries to exclude deleted records by default:
```typescript
where: { ...otherFilters, deletedAt: null }
```

**Files to Change:**
- Backend: schema.prisma, utils/softDelete.ts (new), routes/claims.ts, routes/documents.ts, routes/admin.ts

**Testing:**
- Verify deleted records excluded from queries
- Test undelete capability
- Verify audit trail on deletion

---

## Task #8: Resource Nesting Cleanup

**Status:** ⬜ TODO

**Effort:** 2-3 hours | **Complexity:** Low

**Problem:** Inconsistent resource nesting patterns across endpoints:
- Some use nested routes: GET /claims/:claimId/documents/:id
- Some use query filters: GET /documents?claimId=...
- Some use path params inconsistently

**Solution:** Standardize on query filters for flexibility and consistency.

**Current State:**
```
POST   /claims/:claimId/upload              (nested)
GET    /claims/:claimId/documents           (nested)
GET    /documents/:id/download              (flat, but should support nested)
DELETE /documents/:id                       (flat)
```

**Target State:**
```
POST   /documents/upload?claimId=...        (flat with query param)
GET    /documents?claimId=...               (flat with filter)
GET    /documents/:id/download              (flat, no change)
DELETE /documents/:id                       (flat, no change)
```

**Benefits:**
- Consistent API structure
- Easier permission middleware (applies to all /documents routes)
- Simpler client logic (no nested path building)

**Implementation Plan:**

1. Rename route handlers:
   - Move `POST /claims/:claimId/upload` → `POST /documents/upload`
   - Move `GET /claims/:claimId/documents` → `GET /documents`

2. Update query parameter handling:
   - Accept `claimId` as query param instead of path param
   - Add validation for claimId presence where required

3. Update frontend:
   - Change upload call from `POST /claims/${id}/upload` → `POST /documents/upload?claimId=${id}`
   - Change fetch call from `GET /claims/${id}/documents` → `GET /documents?claimId=${id}`

**Files to Change:**
- Backend: routes/documents.ts
- Frontend: pages/adjuster/ClaimReview.tsx, pages/finance/PayoutDetail.tsx, components/FileUpload.tsx

**Testing:**
- Integration tests for new routes
- Frontend integration tests for upload and fetch

---

## Task #9: Response Schema Documentation

**Status:** ✅ DONE (completed via PR #28 — `docs/openapi-schemas`)

**Effort:** 2-3 hours | **Complexity:** Low

**Problem:** Swagger docs exist but response schemas are incomplete:
- Many endpoints return `@openapi 200:` with no schema
- Inconsistent description of error responses
- Pagination structure not documented in some endpoints

**Solution:** Add complete OpenAPI schemas to all endpoints.

**Implementation Plan:**

1. For each route handler, add `@openapi` response schema:
```typescript
/**
 * @openapi
 * /claims:
 *   get:
 *     responses:
 *       200:
 *         description: Paginated list of claims
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Claim'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
```

2. Define shared schemas in swagger.ts:
   - Pagination
   - Claim
   - User
   - Document
   - etc.

3. Update endpoints in:
   - routes/claims.ts
   - routes/admin.ts
   - routes/payouts.ts
   - routes/documents.ts

**Files to Change:**
- Backend: swagger.ts, routes/*.ts (JSDoc comments)

**Testing:**
- Validate Swagger output: `http://localhost:3001/api/docs`
- Ensure all 50+ endpoints have documented schemas

---

## Verification Checklist

- [ ] Task #5: Date filter tests pass, endpoints updated
- [ ] Task #6: Transaction tests pass, no data consistency issues
- [ ] Task #7: Soft delete queries work, deletedAt filters applied
- [ ] Task #8: Flat routes work, frontend updated, no nested params
- [ ] Task #9: Swagger docs show all schemas, no validation errors
- [ ] All 37+ tests still pass after changes
- [ ] `tsc --noEmit` passes

---

## Dependencies

- Task #5 has no dependencies (can start immediately)
- Task #6 has no dependencies (can start immediately)
- Task #7 requires schema migration (depends on Prisma being available)
- Task #8 is independent
- Task #9 is independent

**Recommended order:** Start with #5, #6, #8, #9 in parallel; #7 after schema is tested.

---

## What's Next?

→ **[LOW PRIORITY](./LOW_PRIORITY.md)** — Request ID tracking, batch operations, RBAC visibility, performance
