# 🟡 Medium Priority Refactoring

Do these after high priority. **Estimated: 2-3 weeks, ~30-40 hours combined.**

---

## 5. Extract Date Filtering & Search Patterns

**Current State:** Repeated logic across routes
```typescript
// In claims.ts:
if (dateFrom || dateTo) {
  where['incidentDate'] = {
    ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
    ...(dateTo ? { lte: new Date(new Date(dateTo).setHours(23, 59, 59, 999)) } : {}),
  };
}

if (search) {
  where['OR'] = [
    { claimNumber: { contains: search } },
    { description: { contains: search } },
    { patient: { firstName: { contains: search } } },
    { patient: { lastName: { contains: search } } },
  ];
}

// Same pattern repeated in payouts.ts, overpayments.ts, admin.ts...
```

**Refactor To:** Reusable utilities
```typescript
// backend/src/utils/filters.ts
export function parseDateRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  
  const dateFilter: Record<string, Date> = {};
  if (from) dateFilter.gte = new Date(from);
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    dateFilter.lte = toDate;
  }
  return dateFilter;
}

export function buildSearchWhere(
  searchTerm: string | undefined,
  fields: string[]
): Record<string, unknown> | undefined {
  if (!searchTerm) return undefined;
  
  return {
    OR: fields.map(field => ({
      [field]: { contains: searchTerm }
    }))
  };
}

// Usage:
const dateFilter = parseDateRange(from, to);
if (dateFilter) where['incidentDate'] = dateFilter;

const searchWhere = buildSearchWhere(search, ['claimNumber', 'description']);
if (searchWhere) where['OR'] = searchWhere['OR'];
```

**Why:**
- Eliminates copy-paste bugs
- Consistent date/search handling across API
- Easier to add full-text search later

**Impact:**
- 🟢 Reduces ~100+ lines of duplicated filter code
- 🟢 Consistent date filtering behavior (UTC handling, boundaries)
- 🟢 Easier to test filtering logic once

**Effort:** Low
- Create `backend/src/utils/filters.ts` (~40 lines)
- Update ~6 routes that use date/search filtering

**Files:**
- Add `backend/src/utils/filters.ts`
- Update `backend/src/routes/{claims, payouts, overpayments, admin, reports}.ts`

**Risk:** Low — just extracting existing logic

---

## 6. Add Transaction Support for State Transitions

**Current State:** Multiple separate DB calls, no rollback
```typescript
// In claims.ts - approve endpoint:
const claim = await prisma.claim.update({
  where: { id: claimId },
  data: { status: 'APPROVED' }
});

await prisma.claimEvent.create({
  data: { claimId, fromStatus: 'SUBMITTED', toStatus: 'APPROVED', ... }
});

await createNotification({
  userId: claim.patientId,
  message: 'Claim approved'
});
```

**Problem:** If notification creation fails, claim is already updated. Data is now inconsistent.

**Refactor To:** Atomic transactions
```typescript
await prisma.$transaction(async (tx) => {
  const claim = await tx.claim.update({
    where: { id: claimId },
    data: { status: 'APPROVED', updatedAt: new Date() }
  });

  await tx.claimEvent.create({
    data: { claimId, fromStatus: 'SUBMITTED', toStatus: 'APPROVED', ... }
  });

  // If this fails, entire transaction rolls back
  await tx.notification.create({
    data: { userId: claim.patientId, message: 'Claim approved' }
  });

  return claim;
});
```

**Why:**
- Data integrity: claim status, event log, and notifications always sync
- Healthcare compliance: audit trail is always complete
- Debugging: no orphaned events or notifications

**Impact:**
- 🟢 Zero data inconsistency risk
- 🟢 Better error handling (fail completely or not at all)
- 🟢 Audit trail is always accurate

**Effort:** Medium
- Wrap ~15 state-transition endpoints in `prisma.$transaction()`
- Add transaction tests
- No schema changes

**Files:**
- Update `backend/src/routes/claims.ts` (all action handlers)
- Update `backend/src/routes/payouts.ts` (pay claim)
- Update `backend/src/routes/overpayments.ts` (resolve, waive)

**Risk:** Low — same result, just atomic

**Testing:**
- Manually trigger failures in middleware to test rollback
- Verify no orphaned claimEvents or notifications

---

## 7. Implement Soft Deletes

**Current State:** Hard deletes (data lost forever)
```typescript
// In documents.ts:
await prisma.document.delete({ where: { id } });  // Gone forever

// In some routes, deletion not possible at all (claims, users)
```

**Refactor To:** Soft deletes with `deletedAt`
```typescript
// Schema change (prisma/schema.prisma):
model Document {
  id String @id @default(cuid())
  ...
  deletedAt DateTime?
  @@unique([claimId, filename])  // Allow re-upload same filename after soft delete
}

// Queries (exclude soft deleted by default):
const documents = await prisma.document.findMany({
  where: { claimId, deletedAt: null }
});

// Delete (soft):
await prisma.document.update({
  where: { id },
  data: { deletedAt: new Date() }
});

// Restore (if needed):
await prisma.document.update({
  where: { id },
  data: { deletedAt: null }
});

// Admin can see deleted (with filter):
const allDocs = await prisma.document.findMany({
  where: { claimId },  // No deletedAt filter
});
```

**Why:**
- Audit trail: can see what was deleted and when
- Recovery: can restore if user changes mind
- Compliance: financial/healthcare audits require deletion history
- No data loss

**Impact:**
- 🟢 Can comply with audit requirements
- 🟢 Can restore deleted documents if needed
- 🟢 Deletion history preserved

**Effort:** Medium
- Add `deletedAt` field to resources (Document, maybe others)
- Run `pnpm db:push` to sync schema
- Update all queries to filter `deletedAt: null` by default
- Add admin endpoint to view/restore deleted resources

**Files:**
- `backend/prisma/schema.prisma` (add `deletedAt` to Document, User, Claim if needed)
- `backend/src/utils/queryFilters.ts` (add helper: `notDeleted()`)
- `backend/src/routes/documents.ts` (update queries to filter deleted)
- `backend/src/routes/admin.ts` (add restore endpoint)

**Risk:** Low — mostly additive, existing hard deletes can stay as soft

**Testing:**
- [ ] Soft delete works
- [ ] Deleted documents don't appear in normal queries
- [ ] Admin can restore

---

## 8. Standardize Resource Nesting

**Current State:** Mix of conventions
```typescript
// Good (nested):
POST   /documents/claims/:claimId/upload
GET    /documents/claims/:claimId
GET    /documents/:id/download

// Bad (ambiguous):
GET    /:id/download  // What is :id? Document? User? Ambiguous.
DELETE /:id           // Same ambiguity

// Inconsistent:
GET    /policies/:id  // Policy, clear
GET    /users/:id     // User, clear
GET    /:id           // Ambiguous without context
```

**Refactor To:** Consistent nesting where useful
```typescript
// Good patterns:
// Documents (always nested under claim):
POST   /documents/claims/:claimId/upload
GET    /documents/claims/:claimId
GET    /documents/:documentId/download
DELETE /documents/:documentId

// Users (standalone):
GET    /users
GET    /users/:userId
PATCH  /users/:userId

// Notifications (user's notifications):
GET    /users/:userId/notifications
GET    /users/:userId/notifications/:notificationId
PATCH  /users/:userId/notifications/:notificationId

// Or, if notifications are per-user, keep as:
GET    /notifications
GET    /notifications/:notificationId  // Clearer with full path
```

**Why:**
- Resource paths are unambiguous
- OpenAPI spec is clearer
- RESTful convention: nested when resource belongs to parent

**Impact:**
- 🟢 No ambiguity about what `:id` refers to
- 🟢 Cleaner Swagger docs
- 🟢 Less client confusion

**Effort:** Low
- Audit all routes for ambiguity
- Rename as needed (~5-10 endpoints)
- Update frontend API calls

**Files:**
- `backend/src/routes/*.ts` (rename ambiguous routes)
- `frontend/src/api/*.ts` (update API calls)

**Risk:** Low — just renaming, no behavior change

---

## 9. Batch Operations Pattern

**Current State:** Only payouts supports batch
```typescript
// In payouts.ts:
POST /payouts/batch-pay {
  claimIds: [...],
  paymentRef: "...",
  notes: "..."
}

// But claims doesn't have:
// POST /claims/bulk-approve, /bulk-reject, etc.
```

**Refactor To:** Standardized batch pattern
```typescript
// For claims:
POST /claims/bulk-actions
{
  "ids": ["claim1", "claim2", ...],
  "action": "approve" | "reject" | "request-info",
  "notes": "...",
  "eligibleAmount": 500  // If approve
}

// Returns:
{
  "succeeded": ["claim1", "claim2"],
  "failed": [{"id": "claim3", "error": "Already paid"}]
}

// For overpayments:
POST /overpayments/bulk-actions
{
  "ids": [...],
  "action": "resolve" | "waive",
  "waiverReason": "..."
}
```

**Why:**
- Better UX: Finance can pay 50 claims in one request
- Consistency: same pattern across resources
- Efficiency: batch validation + single transaction

**Impact:**
- 🟢 Faster bulk workflows (50% reduction in API calls)
- 🟢 Easier to implement "select all" + "action on selected"
- 🟢 Consistency across API

**Effort:** Low-Medium
- Add batch route handler to ~2-3 resources (claims, overpayments, payouts)
- Each handler validates all IDs, then applies action in transaction
- Update frontend to use batch endpoints

**Files:**
- `backend/src/routes/claims.ts` (add `POST /bulk-actions`)
- `backend/src/routes/overpayments.ts` (add `POST /bulk-actions`)
- `frontend/src/api/*.ts` (use batch endpoints where applicable)

**Risk:** Low — new endpoints, no breaking changes

---

## Implementation Order

1. **#5 (Date/Search Filters)** — Trivial, immediate code reduction
2. **#8 (Resource Nesting)** — Low effort, clarity gain
3. **#6 (Transactions)** — High impact on data integrity
4. **#7 (Soft Deletes)** — Compliance requirement (do if needed)
5. **#9 (Batch Operations)** — Polish (do last if time permits)

**Estimated Timeline:**
- Filters: 4 hours
- Nesting: 3 hours
- Transactions: 12 hours
- Soft deletes: 8 hours
- Batch ops: 10 hours

**Total: ~37 hours**

---

## Testing Checklist

After each refactor:
- [ ] All endpoints still return correct data
- [ ] Error cases handled (invalid IDs, permission denied, etc.)
- [ ] Date filtering works across timezones
- [ ] Search is case-insensitive (if applicable)
- [ ] Transactions roll back on errors
- [ ] Soft deleted items don't appear in normal queries
