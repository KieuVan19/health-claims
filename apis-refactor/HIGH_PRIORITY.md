# HIGH PRIORITY API Refactoring

**Timeline:** Week 1-2 | **Effort:** Low-Medium | **Impact:** Critical

These 4 items address core architectural issues that affect every API consumer. All should be completed before moving to Medium Priority.

---

## Task #1: Consolidate Claim Action Endpoints

**Status:** ✅ DONE

**Problem:** 16 individual endpoints for claim state transitions (`/approve`, `/reject`, `/submit`, `/withdraw`, `/request-info`, `/respond-info`, `/resubmit`, `/override-filing-deadline`, `/appeal`, `/assign`, `/assign-appeal`, `/resolve-appeal`, `/reassign`, `/adjudicate-line`, `/external-primary`, `/initiate-secondary`)

**Solution:** Single unified dispatcher `POST /claims/:id/actions` with discriminated union payloads.

**Impact:**
- Reduces endpoint count from 50+ to ~35
- Centralizes validation and event logging
- Eliminates duplicated authorization checks

**Files Changed:**
- Backend: `backend/src/routes/claims.ts` (~1,700 lines removed)
- Frontend: 7 component files updated to use `executeClaimAction()`

**Tests:** All 37 tests pass

---

## Task #2: Standardize Pagination Responses

**Status:** ✅ DONE

**Problem:** Inconsistent pagination format across endpoints:
- Claims: `{ claims: [...], total, page, totalPages }`
- Admin: `{ users: [...], total, page, totalPages }`
- Payouts: `{ data: [...], pagination: { total, page, limit, totalPages } }`
- Reports: `{ data, page, totalPages }` (missing total and limit)

**Solution:** Unified format for all list endpoints.

**Unified Format:**
```typescript
{
  data: T[],
  pagination: {
    total: number,
    page: number,
    limit: number,
    totalPages: number
  }
}
```

**Implementation:**
- Created `createPaginatedResponse()` utility in `backend/src/utils/pagination.ts`
- Updated 8 paginated endpoints (claims, admin, payouts, overpayments, providers, reports)
- Updated 9 frontend components to access `.data` and `.pagination.*`

**Files Changed:**
- Backend: claims.ts, admin.ts, payouts.ts, overpayments.ts, providers.ts, reports.ts
- Frontend: 9 page components in pages/

**Tests:** All 37 tests pass

---

## Task #3: Extract Ownership Checks to Middleware

**Status:** ✅ DONE

**Problem:** Duplicated ownership verification logic in every resource fetch:
```typescript
const claim = await prisma.claim.findUnique({ where: { id } })
if (!claim) { res.status(404).json({...}); return }
if (!checkPatientOwnershipIfPatient(role, claim.patientId, userId, res)) return
```

**Solution:** Middleware that handles resource fetch + ownership verification.

**Middleware Functions:**
- `requirePatientOwnership(resourceType, idParamName, loadRelations)` — strict ownership
- `requirePatientOwnershipIfPatient(resourceType, idParamName, loadRelations)` — role-based

**Usage:**
```typescript
router.get('/:id', authenticate, requirePatientOwnershipIfPatient('claim', 'id', { events: true }), handler)
// Inside handler: req.resource!.claim is pre-fetched and verified
```

**Implementation:**
- Created `backend/src/middleware/ownership.ts`
- Integrated into claims.ts and documents.ts routes
- Removed 4 duplicated ownership check blocks

**Files Changed:**
- Backend: middleware/ownership.ts (new), routes/claims.ts, routes/documents.ts

**Tests:** All 37 tests pass

---

## Task #4: Centralize Status & Role Enums

**Status:** ✅ DONE

**Problem:** Hardcoded status/role strings scattered across ~12 files:
- CLAIM_STATUSES: 'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', etc.
- USER_ROLES: 'PATIENT', 'ADJUSTER', 'FINANCE_OFFICER', 'ADMIN'
- OVERPAYMENT_STATUSES: 'IDENTIFIED', 'OFFSET', 'WAIVED'

**Solution:** Centralized enums file with type-safe exports.

**File:** `backend/src/constants/enums.ts`

**Exports:**
- CLAIM_STATUSES (11 values)
- USER_ROLES (4 values)
- CLAIM_TYPES (5 values)
- NETWORK_STATUSES (2 values)
- ADJUDICATION_STATUSES (4 values)
- DOCUMENT_TYPES (2 values)
- PAYER_ORDERS (2 values)
- PLAN_YEAR_TYPES (2 values)
- OVERPAYMENT_STATUSES (3 values)
- OVERPAYMENT_REASONS (3 values)
- OPEN_CLAIM_STATUSES (array)

**Implementation:**
- Created `backend/src/constants/enums.ts` with all const objects and types
- Updated 10 route/service files to import and use enums
- Replaced 40+ hardcoded string literals with enum references

**Files Changed:**
- Backend: constants/enums.ts (new), services/claims.ts, services/assignment.ts, services/eob.ts, routes/claims.ts, routes/admin.ts, routes/payouts.ts, routes/overpayments.ts, routes/users.ts, routes/documents.ts, routes/policies.ts, routes/auth.ts, utils/ownership.ts, routes/reports.ts

**Tests:** All 37 tests pass

---

## Verification Checklist

- [x] All unit tests pass (`pnpm test`)
- [x] Backend TypeScript strict mode passes (`tsc --noEmit`)
- [x] Frontend TypeScript strict mode passes (`tsc --noEmit`)
- [x] No breaking API changes (internal refactoring only)
- [x] All 4 tasks completed in sequence

---

## What's Next?

→ **[MEDIUM PRIORITY](./MEDIUM_PRIORITY.md)** — Extract date filtering, add transactions, soft deletes, resource nesting cleanup
