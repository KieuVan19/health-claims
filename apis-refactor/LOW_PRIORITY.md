# 🟢 Low Priority Refactoring

Do these when you have spare time. **Estimated: 1-2 weeks, ~15-25 hours combined.**

---

## 10. Add Request ID Tracking

**Current State:** No request correlation
```typescript
// When an error occurs, logs don't link back to user's request
console.error('[Error]', err);  // Which user? Which request? Unclear.
```

**Refactor To:** UUID-based request tracking
```typescript
// Middleware:
import { v4 as uuidv4 } from 'uuid';

app.use((req: Request, res: Response, next: NextFunction) => {
  req.id = req.get('x-request-id') || uuidv4();
  res.setHeader('x-request-id', req.id);
  next();
});

// Usage:
console.error(`[${req.id}] Error:`, err);

// Response:
res.status(500).json({ error: 'Internal server error', requestId: req.id });

// Frontend can see requestId and pass to support team
```

**Why:**
- Debugging: can trace full request flow in logs
- User support: "Your request ID is X" → can look up logs
- Observability: correlate backend logs with frontend errors

**Impact:**
- 🟢 Much faster debugging
- 🟢 Better customer support (can find issues by ID)
- 🟢 Audit trail improvement

**Effort:** Trivial
- Add UUID middleware (~10 lines)
- Update error handler to log `requestId`
- Optional: store in AuditLog

**Files:**
- Update `backend/src/index.ts` (add middleware)
- Update `backend/src/middleware/error.ts` (include in responses)

**Risk:** None — purely additive

---

## 11. Standardize Batch Operations Pattern

**Note:** This overlaps with Medium Priority #9. See that for details.

**Quick Version:**
- Add `POST /resources/bulk-actions` pattern to all major resources
- Consistent response: `{succeeded: [...], failed: [...]}`
- Standardize in `backend/src/utils/batch.ts`

**Files:**
- `backend/src/utils/batch.ts` (batch processing helper)
- `backend/src/routes/{claims, payouts, overpayments}.ts`

---

## 12. Add RBAC Visibility to Swagger

**Current State:** Role requirements in code, not visible in docs
```typescript
// In claims.ts:
router.post('/approve',
  authenticate,
  requireRole('ADJUSTER', 'FINANCE_OFFICER'),  // Not in Swagger!
  handler
);
```

**Refactor To:** RBAC in OpenAPI docs
```typescript
/**
 * @openapi
 * /claims/{id}/approve:
 *   post:
 *     tags: [Claims]
 *     summary: Approve a claim
 *     security:
 *       - bearerAuth: []
 *     x-required-roles: [ADJUSTER, FINANCE_OFFICER]  // Custom field
 *     requestBody: ...
 *     responses: ...
 */

// Or use standard OpenAPI security:
router.post('/approve',
  authenticate,
  requireRole('ADJUSTER', 'FINANCE_OFFICER'),
  handler
);
```

**Why:**
- Clients see which roles can call each endpoint
- No guessing about permissions
- Better Swagger documentation

**Impact:**
- 🟢 RBAC clarity in API docs
- 🟢 Developers don't guess which role to use
- 🟢 Better security documentation

**Effort:** Low
- Update ~15 endpoints with role info in JSDoc
- No code changes needed

**Files:**
- `backend/src/routes/*.ts` (add role documentation)

**Risk:** None — documentation only

---

## 13. Full Response Schema Documentation

**Current State:** Responses described as text
```typescript
/**
 * @openapi
 * /claims:
 *   get:
 *     responses:
 *       200:
 *         description: Paginated list of claims  // Not a schema!
 */
```

**Refactor To:** Full OpenAPI schemas
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
 * 
 * components:
 *   schemas:
 *     Claim:
 *       type: object
 *       properties:
 *         id: { type: string }
 *         claimNumber: { type: string }
 *         status: { type: string, enum: [DRAFT, SUBMITTED, ...] }
 *         totalAmount: { type: number }
 *         ...
 *     Pagination:
 *       type: object
 *       properties:
 *         total: { type: integer }
 *         page: { type: integer }
 *         limit: { type: integer }
 *         totalPages: { type: integer }
 */
```

**Why:**
- Swagger UI shows actual response shape (not a surprise)
- Can generate client code from schema (`openapi-generator`)
- Clients know exactly what fields exist and their types

**Impact:**
- 🟢 Zero surprise responses
- 🟢 Can auto-generate client SDKs
- 🟢 Better IDE autocomplete (if using client gen)

**Effort:** Medium
- Define schemas for: Claim, User, Policy, Document, Notification, Payout, etc.
- Update all endpoints to reference schemas
- ~60-80 lines per resource

**Files:**
- `backend/src/swagger.ts` (add component schemas)
- `backend/src/routes/*.ts` (update endpoints to reference schemas)

**Risk:** None — documentation only

**Option:** Generate schemas from TypeScript types using `typescript-to-json-schema` or similar

---

## 14. API Versioning (Optional)

**Current State:** No versioning
```
/api/claims
/api/auth
```

**Refactor To:** Versioned endpoints
```
/api/v1/claims
/api/v1/auth
```

**Why:**
- Breaking changes don't require all clients to update at once
- Can deprecate old versions gradually
- Standard practice for public APIs

**Impact:**
- 🟢 Can make breaking changes without breaking old clients
- 🟢 Can deprecate old endpoints gradually

**Effort:** Medium
- Update all route prefixes in `index.ts`
- Update frontend API calls
- Add version endpoint (`GET /api/version`)

**Files:**
- `backend/src/index.ts` (update routes to `/api/v1/...`)
- `frontend/src/api/*.ts` (update base URL)

**Risk:** Breaking change for clients — only do if needed

**When to Do:**
- Just before making breaking changes
- When you have 3+ major versions worth maintaining
- Skip for now (internal API)

---

## 15. Consolidate Notification Routes

**Current State:** Multiple endpoints for one resource
```
GET    /notifications
GET    /notifications/unread-count
PUT    /notifications/read-all
PUT    /notifications/:id/read
DELETE /notifications/:id
```

**Refactor To:** Fewer endpoints
```
GET    /notifications              // List
GET    /notifications/:id          // Get single
PATCH  /notifications/:id          // Update (mark read)
PATCH  /notifications              // Bulk update (mark all read)
DELETE /notifications/:id          // Delete
```

Or, use action pattern (if favored):
```
POST   /notifications/:id/actions
{
  "action": "mark-read"
}

POST   /notifications/actions
{
  "action": "mark-all-read"
}
```

**Why:**
- Fewer endpoints to learn
- Consistent CRUD pattern
- Simpler to document

**Impact:**
- 🟢 Fewer endpoints
- 🟢 Cleaner route organization

**Effort:** Low
- Consolidate routes (~30 lines)
- Update frontend API calls (~3 places)

**Files:**
- `backend/src/routes/notifications.ts` (consolidate routes)
- `frontend/src/api/notifications.ts` (update calls)

**Risk:** Low — mostly consolidation

---

## Implementation Order

If doing low-priority work:

1. **#10 (Request IDs)** — Trivial, big debugging win
2. **#12 (RBAC Visibility)** — Low effort, clarity gain
3. **#13 (Response Schemas)** — Medium effort, quality improvement
4. **#15 (Notification Routes)** — Low effort, consistency
5. **#11 (Batch Ops)** — If you skipped Medium #9
6. **#14 (Versioning)** — Only if making breaking changes

**Estimated Timeline:**
- Request IDs: 1 hour
- RBAC visibility: 3 hours
- Response schemas: 12 hours
- Notification routes: 2 hours
- Versioning: 5 hours

**Total: ~23 hours**

---

## Quick Wins (Do First if Busy)

If you only have 2-3 hours:
1. **Request IDs** (1 hour) — Massive debugging value
2. **RBAC visibility** (2 hours) — Clarity for developers
3. **Notification consolidation** (2 hours) — Consistency

This gives you better debugging, clearer docs, and cleaner routes with minimal effort.
