# 🔴 High Priority Refactoring

Do these first. **Estimated: 1-2 weeks, ~40-50 hours combined.**

---

## 1. Consolidate Claim Action Endpoints

**Current State:** 10+ separate endpoints for different claim operations
```
POST /claims/:id/approve
POST /claims/:id/reject
POST /claims/:id/request-info
POST /claims/:id/respond-info
POST /claims/:id/assign
POST /claims/:id/unassign
POST /claims/:id/withdraw
POST /claims/:id/appeal
POST /claims/:id/adjudicate-line
POST /claims/:id/generate-eob
...
```

**Refactor To:** Single action dispatcher
```
POST /claims/:id/actions
{
  "action": "approve" | "reject" | "request-info" | "respond-info" | "assign" | ...
  "notes": "...",
  "eligibleAmount": 500,
  "adjusterId": "...",
  "denialReason": "...",
  ...
}
```

**Why:**
- Each action is essentially a state transition on the claim resource
- Current design mixes HTTP verbs with business logic
- Action-based consolidation captures intent better (important for audit/compliance)

**Impact:**
- 🟢 Reduces route file size by ~30% (less boilerplate)
- 🟢 Single validation point for state machine rules
- 🟢 Easier to add new actions later (just new case in switch)
- 🟢 Better for event-driven architecture

**Effort:** Medium
- Rewrite claims router action handlers (~200 lines)
- Consolidate into dispatcher with switch statement
- Update frontend API calls (search `POST /claims/` in frontend)
- Add integration tests for each action

**File Impact:**
- `backend/src/routes/claims.ts` — consolidate handlers into one dispatcher
- `frontend/src/api/claims.ts` — update API calls

**Risk:** Low — internal refactor, no schema changes

---

## 2. Standardize Pagination Responses

**Current State:** Inconsistent pagination format
```javascript
// Overpayments (good):
{
  "data": [...],
  "pagination": {
    "total": 50,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}

// Claims (bad):
[...]  // Just an array, no metadata

// Payouts (ok but different):
{
  "data": [...],
  "pagination": { "total": 50, "page": 1, "limit": 20, "totalPages": 3 }
}
```

**Refactor To:** Unified format for all list endpoints
```javascript
{
  "data": [...],
  "pagination": {
    "total": 50,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

**Why:**
- Clients shouldn't guess the response format per endpoint
- Pagination metadata is always useful (filtering, infinite scroll, etc.)
- Makes OpenAPI documentation clear

**Impact:**
- 🟢 Cleaner client code (always access `response.data` and `response.pagination`)
- 🟢 Consistent UI patterns for all list views
- 🟢 Better Swagger documentation

**Effort:** Low
- Create wrapper utility: `paginatedResponse(data, total, page, limit)`
- Update ~8 list endpoints (claims, users, policies, payouts, overpayments, notifications, admin users, reports)
- Update frontend to expect new format (~8 API calls)

**File Changes:**
- Add `backend/src/utils/response.ts`:
  ```typescript
  export function paginatedResponse(data: any[], total: number, page: number, limit: number) {
    return {
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
  ```
- Update all GET list endpoints to use it
- Update `frontend/src/api/*.ts` to handle new shape

**Risk:** Low — breaking change, but only for client code (update frontend)

---

## 3. Extract Ownership Checks to Middleware

**Current State:** Ownership checks duplicated in every handler
```typescript
// In claims.ts:
const claim = await prisma.claim.findUnique({ where: { id } });
if (!checkPatientOwnershipIfPatient(req.user!.role, claim.patientId, req.user!.id, res)) {
  return;
}

// In documents.ts:
const document = await prisma.document.findUnique({ where: { id } });
if (!checkPatientOwnershipIfPatient(req.user!.role, document.claim.patientId, req.user!.id, res)) {
  return;
}

// In notifications.ts:
const notification = await prisma.notification.findUnique({ where: { id } });
if (notification.userId !== req.user!.id) {
  res.status(403).json({ error: 'Access denied' });
  return;
}
```

**Refactor To:** Middleware that checks ownership
```typescript
// Middleware:
export function requireOwnership(resourceType: 'claim' | 'document' | 'notification') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const resource = await getResourceById(resourceType, req.params.id);
    if (!checkAccess(req.user!.role, resource, req.user!.id)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    req.resource = resource; // Attach to request for handler
    next();
  };
}

// In route handler:
router.get(
  '/:id',
  authenticate,
  requireOwnership('claim'),
  async (req: Request, res: Response) => {
    const claim = req.resource; // Already validated + owned
    res.json(claim);
  }
);
```

**Why:**
- Reduces repeated code
- Single point of access control logic (easier to audit)
- Clearer separation of concerns

**Impact:**
- 🟢 Eliminates ~20+ lines of duplicated ownership checks
- 🟢 Fewer bugs (one implementation, not 10)
- 🟢 Easier to add new resources

**Effort:** Low
- Create `backend/src/middleware/ownership.ts`
- Update ~15 endpoints to use middleware
- Remove manual checks from handlers

**Files:**
- Add `backend/src/middleware/ownership.ts`
- Update `backend/src/routes/claims.ts`, `documents.ts`, `notifications.ts`, `users.ts`

**Risk:** Low — refactor only, no behavior change

---

## 4. Centralize Status & Role Enums

**Current State:** Constants hardcoded everywhere
```typescript
// In claims.ts:
const validStatuses = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', ...];
z.enum(['DRAFT', 'SUBMITTED', ...])

// In payouts.ts:
const allowedStatuses = ['APPROVED', 'PARTIALLY_APPROVED', 'PAID'];

// In admin.ts:
const role = z.enum(['PATIENT', 'ADJUSTER', 'FINANCE_OFFICER', 'ADMIN']);

// In overpayments.ts:
reason: z.enum(['ADJUSTER_ERROR', 'COB_UPDATE', 'POLICY_CHANGE'])
```

**Refactor To:** Centralized constants
```typescript
// backend/src/constants/enums.ts
export const CLAIM_STATUSES = [
  'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 
  'APPROVED', 'REJECTED', 'INFO_REQUESTED',
  'PAID', 'WITHDRAWN', 'APPEAL_PENDING', ...
] as const;

export const USER_ROLES = ['PATIENT', 'ADJUSTER', 'FINANCE_OFFICER', 'ADMIN'] as const;

export const OVERPAYMENT_REASONS = ['ADJUSTER_ERROR', 'COB_UPDATE', 'POLICY_CHANGE'] as const;

// In routes:
import { CLAIM_STATUSES, USER_ROLES } from '../constants/enums';

const claimSchema = z.object({
  status: z.enum(CLAIM_STATUSES),
  role: z.enum(USER_ROLES),
});
```

**Why:**
- Single source of truth
- Schema changes in one place
- Easier to validate against allowed values
- Can export for frontend use (type safety across full stack)

**Impact:**
- 🟢 Consistency — all code uses same enum definitions
- 🟢 Easier to add new statuses (one place to update)
- 🟢 Can share enums with frontend

**Effort:** Trivial
- Create `backend/src/constants/enums.ts`
- Copy hardcoded values into it
- Replace hardcoded values in ~12 files with imports

**Files:**
- Add `backend/src/constants/enums.ts`
- Update all routes to import

**Risk:** None — just organizing existing values

---

## Implementation Order

1. **Start with #4 (Enums)** — Trivial, unblocks others
2. **Then #3 (Ownership Middleware)** — Low effort, reduces boilerplate
3. **Then #2 (Pagination)** — Low effort, high impact on client code
4. **Finally #1 (Claim Actions)** — Highest effort, but most impactful

**Estimated Timeline:**
- Enums: 1 hour
- Ownership middleware: 4 hours
- Pagination: 8 hours
- Claim actions: 20-30 hours

**Total: ~35-43 hours**

---

## Testing Checklist

After each refactor:
- [ ] `pnpm test` passes (backend + frontend)
- [ ] `npm run tsc --noEmit` passes (type check)
- [ ] Manually test on localhost:3001 and 5173
- [ ] Swagger docs update (if applicable)
- [ ] No console errors in browser dev tools
