# Implementation Checklist

Track progress as you work through refactoring.

---

## 🔴 HIGH PRIORITY

### 1. Consolidate Claim Action Endpoints
- [ ] Create dispatcher in `routes/claims.ts`
- [ ] Update all action handlers to use dispatcher
- [ ] Add validation for action + required fields
- [ ] Update frontend API calls
- [ ] Write integration tests
- [ ] Manual test on localhost
- [ ] Verify Swagger docs update
- [ ] Commit with message: "refactor: consolidate claim action endpoints"

**Effort:** 20-30 hours | **Blocker:** None

---

### 2. Standardize Pagination Responses
- [ ] Create `utils/response.ts` with `paginatedResponse()` utility
- [ ] Update claims list endpoint
- [ ] Update policies list endpoint
- [ ] Update users list endpoint (admin)
- [ ] Update payouts list endpoint
- [ ] Update overpayments list endpoint
- [ ] Update notifications list (if paginated)
- [ ] Update other list endpoints
- [ ] Update frontend API calls to use new format
- [ ] Manual test pagination (page 1, last page, out of range)
- [ ] Commit: "refactor: standardize pagination responses"

**Effort:** 8-10 hours | **Blocker:** None

---

### 3. Extract Ownership Checks to Middleware
- [ ] Create `middleware/ownership.ts`
- [ ] Define ownership rules for each resource type
- [ ] Update claims routes to use middleware
- [ ] Update documents routes to use middleware
- [ ] Update notifications routes to use middleware
- [ ] Update users routes to use middleware
- [ ] Test access denied cases
- [ ] Commit: "refactor: extract ownership checks to middleware"

**Effort:** 4-6 hours | **Blocker:** #2 (pagination)

---

### 4. Centralize Status & Role Enums
- [ ] Create `constants/enums.ts`
- [ ] Add `CLAIM_STATUSES` constant
- [ ] Add `USER_ROLES` constant
- [ ] Add `OVERPAYMENT_REASONS` constant
- [ ] Add other enums as needed
- [ ] Update claims routes to import enums
- [ ] Update admin routes to import enums
- [ ] Update overpayments routes to import enums
- [ ] Update remaining routes
- [ ] Type-check: `pnpm tsc --noEmit`
- [ ] Commit: "refactor: centralize status and role enums"

**Effort:** 1-2 hours | **Blocker:** None

**Status Checklist:**
- [ ] All 4 high-priority items complete
- [ ] All tests pass
- [ ] Zero TypeScript errors
- [ ] Code review completed
- [ ] Ready to merge to main

---

## 🟡 MEDIUM PRIORITY

### 5. Extract Date Filtering & Search Patterns
- [ ] Create `utils/filters.ts` with utilities:
  - [ ] `parseDateRange(from, to)`
  - [ ] `buildSearchWhere(term, fields)`
- [ ] Update claims routes to use utilities
- [ ] Update payouts routes to use utilities
- [ ] Update overpayments routes to use utilities
- [ ] Update admin routes to use utilities
- [ ] Test date edge cases (boundaries, UTC)
- [ ] Test search (case sensitivity, special chars)
- [ ] Commit: "refactor: extract date and search utilities"

**Effort:** 4 hours | **Blocker:** None

---

### 6. Add Transaction Support for State Transitions
- [ ] Wrap claim approval in `prisma.$transaction()`
- [ ] Wrap claim rejection in transaction
- [ ] Wrap claim info request in transaction
- [ ] Wrap claim assignment in transaction
- [ ] Wrap payout in transaction
- [ ] Wrap overpayment resolution in transaction
- [ ] Test rollback scenarios (trigger failures)
- [ ] Verify audit logs created on success only
- [ ] Commit: "refactor: add transaction support for state transitions"

**Effort:** 12 hours | **Blocker:** None

---

### 7. Implement Soft Deletes
- [ ] Add `deletedAt: DateTime?` to schema (Document, User if needed)
- [ ] Run `pnpm db:push`
- [ ] Create `notDeleted()` helper in utils
- [ ] Update document queries to filter `deletedAt: null`
- [ ] Add soft delete in documents route
- [ ] Add admin restore endpoint for deleted documents
- [ ] Test: soft-deleted items don't appear in normal queries
- [ ] Test: admin can see and restore deleted items
- [ ] Commit: "refactor: implement soft deletes for documents"

**Effort:** 8 hours | **Blocker:** DB schema change

---

### 8. Standardize Resource Nesting
- [ ] Audit all routes for ambiguous `:id` parameters
- [ ] Rename ambiguous routes to full paths
- [ ] Update frontend API calls
- [ ] Test all endpoints still work
- [ ] Verify Swagger docs match new paths
- [ ] Commit: "refactor: standardize resource nesting conventions"

**Effort:** 3 hours | **Blocker:** None

---

### 9. Batch Operations Pattern
- [ ] Create `utils/batch.ts` with batch processing helpers
- [ ] Add `POST /claims/bulk-actions` endpoint
- [ ] Add `POST /overpayments/bulk-actions` endpoint
- [ ] Add batch operations to payouts if not present
- [ ] Test: bulk approve multiple claims in one request
- [ ] Test: error handling (partial failures)
- [ ] Update frontend to use batch endpoints
- [ ] Commit: "refactor: add batch operations pattern"

**Effort:** 10 hours | **Blocker:** None

**Status Checklist:**
- [ ] All 5 medium-priority items complete
- [ ] All tests pass
- [ ] Transactions working correctly
- [ ] Soft deletes working (if implemented)
- [ ] Code review completed

---

## 🟢 LOW PRIORITY

### 10. Add Request ID Tracking
- [ ] Add UUID middleware to `index.ts`
- [ ] Set `x-request-id` header in middleware
- [ ] Update error handler to log `requestId`
- [ ] Include `requestId` in error responses
- [ ] Optional: store in AuditLog
- [ ] Test: request ID appears in responses
- [ ] Commit: "feat: add request ID tracking"

**Effort:** 1 hour | **Blocker:** None

---

### 11. Add RBAC Visibility to Swagger
- [ ] Update auth endpoints with role docs
- [ ] Update claims endpoints with role docs
- [ ] Update admin endpoints with role docs
- [ ] Update payouts endpoints with role docs
- [ ] Update overpayments endpoints with role docs
- [ ] Verify Swagger UI shows role requirements
- [ ] Commit: "docs: add RBAC visibility to Swagger"

**Effort:** 3 hours | **Blocker:** None

---

### 12. Full Response Schema Documentation
- [ ] Add `Claim` schema to `swagger.ts`
- [ ] Add `User` schema
- [ ] Add `Policy` schema
- [ ] Add `Document` schema
- [ ] Add `Notification` schema
- [ ] Add `Payout` schema
- [ ] Update all endpoints to reference schemas
- [ ] Verify Swagger UI shows response shape
- [ ] Commit: "docs: add full response schemas to OpenAPI"

**Effort:** 12 hours | **Blocker:** None

---

### 13. Consolidate Notification Routes
- [ ] Consolidate `GET /notifications/:id/read` into `PATCH /notifications/:id`
- [ ] Consolidate `PUT /notifications/read-all` into `PATCH /notifications` with body `{action: 'mark-all-read'}`
- [ ] Update frontend API calls
- [ ] Test all notification operations
- [ ] Commit: "refactor: consolidate notification routes"

**Effort:** 2 hours | **Blocker:** None

---

### 14. API Versioning (Optional, skip for now)
- [ ] Update route prefixes to `/api/v1/...`
- [ ] Add version endpoint
- [ ] Update frontend base URL
- [ ] Test all endpoints work with v1 prefix
- [ ] Commit: "refactor: add API versioning"

**Effort:** 5 hours | **Blocker:** Not required yet

---

## Summary Progress

| Priority | Status | Items | Complete |
|----------|--------|-------|----------|
| 🔴 High | ![Progress] | 4 | 0/4 |
| 🟡 Medium | ![Progress] | 5 | 0/5 |
| 🟢 Low | ![Progress] | 5 | 0/5 |

---

## Testing Strategy

After each refactor phase:

```bash
# Type check
cd backend && npx tsc --noEmit
cd ../frontend && npx tsc --noEmit

# Run tests
pnpm test

# Manual testing
pnpm dev
# Open http://localhost:3001/api/docs
# Open http://localhost:5173
# Test key workflows in browser
```

---

## Commit Guidelines

Each refactor should be a separate commit:

```
refactor: consolidate claim action endpoints

- Merge 10+ action endpoints into single POST /claims/:id/actions dispatcher
- Add validation for action-specific required fields
- Update frontend API calls to use new format
- Add integration tests for each action

Affects:
- backend/src/routes/claims.ts
- frontend/src/api/claims.ts
```

---

## Rollback Plan

If a refactor breaks something:

```bash
# Find the commit that introduced the issue
git log --oneline | head -20

# Revert the specific commit
git revert <commit-hash>

# Or, if not pushed yet:
git reset --soft HEAD~1  # Undo last commit but keep changes
git reset --hard HEAD~1  # Undo last commit and discard changes
```

---

## Notes

- Each priority level can be done independently
- No blocking dependencies between levels
- Use feature branches: `git checkout -b refactor/claim-actions`
- All tests must pass before merging
- Get code review on each PR
