# LOW PRIORITY API Refactoring

**Timeline:** Later | **Effort:** Trivial-Low | **Impact:** Nice-to-have

These 5 items improve observability, batch efficiency, and documentation. Work on these after High and Medium Priority are complete, or when team capacity allows.

---

## Task #10: Request ID Tracking

**Status:** ⬜ TODO

**Effort:** 1-2 hours | **Complexity:** Trivial

**Problem:** API requests are not uniquely identified, making debugging and log correlation difficult. When a user reports an issue, support cannot easily trace the exact request through logs.

**Solution:** Generate unique request IDs and include in responses.

**Implementation Plan:**

1. Create middleware `backend/src/middleware/requestId.ts`:
```typescript
import { v4 as uuid } from 'uuid'

export function generateRequestId(req: Request, res: Response, next: NextFunction) {
  const requestId = req.headers['x-request-id'] as string || uuid()
  req.id = requestId
  res.setHeader('x-request-id', requestId)
  next()
}
```

2. Mount before all routes in `index.ts`:
```typescript
app.use(generateRequestId)
```

3. Include in error responses:
```typescript
res.status(400).json({
  error: 'Invalid request',
  requestId: req.id,  // Add this
  ...
})
```

4. Include in audit logs:
```typescript
await createAuditLog({
  requestId: req.id,  // Add this field to schema
  action: 'VIEW_CLAIM',
  ...
})
```

**Files to Change:**
- Backend: middleware/requestId.ts (new), index.ts, middleware/error.ts, utils/audit.ts, schema.prisma (add requestId to AuditLog)

**Testing:**
- Verify request ID in response headers
- Verify request ID in error responses
- Verify request ID persisted in audit logs

---

## Task #11: Batch Operations

**Status:** ⬜ TODO

**Effort:** 2-3 hours | **Complexity:** Low

**Problem:** Bulk operations are not supported. When finance needs to process 100 claims, they must call individual approve endpoints 100 times instead of a single batch endpoint.

**Solution:** Add batch operation endpoints for common multi-record operations.

**Implementation Plan:**

1. Create batch action handler in `backend/src/routes/claims.ts`:
```typescript
POST /claims/batch/actions
Body: {
  claimIds: string[],
  action: 'APPROVE' | 'REJECT',
  payload?: {...}
}
Response: {
  processed: number,
  failed: number,
  results: [{ claimId, status, error? }]
}
```

2. Batch endpoints to add:
   - POST /claims/batch/actions — bulk action (approve, reject, etc.)
   - POST /claims/batch/assign — bulk reassignment
   - POST /documents/batch/delete — bulk document deletion

3. Implementation:
```typescript
router.post('/batch/actions', authenticate, requireRole('ADJUSTER', 'ADMIN'), async (req, res) => {
  const { claimIds, action, payload } = req.body
  const results = await Promise.all(
    claimIds.map(id => executeClaimAction(id, action, payload).catch(e => ({ error: e.message })))
  )
  res.json({ processed: results.filter(r => !r.error).length, failed: results.filter(r => r.error).length, results })
})
```

**Files to Change:**
- Backend: routes/claims.ts, routes/documents.ts

**Testing:**
- Integration tests for batch operations
- Verify error handling (partial failures)
- Verify audit trail created for each item

---

## Task #12: RBAC Enforcement Visibility

**Status:** ⬜ TODO

**Effort:** 1-2 hours | **Complexity:** Low

**Problem:** It's hard to know why a request was denied. A user gets a generic "403 Forbidden" without understanding which role was required.

**Solution:** Include role requirements in error messages and response headers.

**Implementation Plan:**

1. Update `middleware/roles.ts`:
```typescript
export function requireRole(...roles: string[]) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({
        error: 'Insufficient permissions',
        required: roles,           // Add this
        userRole: req.user?.role,  // Add this
        details: `This endpoint requires one of: ${roles.join(', ')}`
      })
      return
    }
    next()
  }
}
```

2. Update error middleware to include required permissions:
```typescript
if (err instanceof PermissionError) {
  res.json({
    error: err.message,
    requiredRole: err.requiredRole,
    userRole: req.user?.role
  })
}
```

3. Add metadata header to responses:
```typescript
res.setHeader('x-required-role', roles.join(','))
```

**Files to Change:**
- Backend: middleware/roles.ts, middleware/error.ts

**Testing:**
- Verify 403 responses include role information
- Verify headers reflect required roles
- Test with different user roles

---

## Task #13: Response Schema Validation

**Status:** ⬜ TODO

**Effort:** 2-3 hours | **Complexity:** Low

**Problem:** Response shapes are documented in Swagger but not validated at runtime. A code change can accidentally break the documented API without being caught.

**Solution:** Runtime validation of response schemas using Zod.

**Implementation Plan:**

1. Define response schemas in `backend/src/schemas/responses.ts`:
```typescript
import { z } from 'zod'
import { claimSchema, paginationSchema } from './common'

export const claimsListResponseSchema = z.object({
  data: z.array(claimSchema),
  pagination: paginationSchema,
})

export const claimDetailResponseSchema = claimSchema
```

2. Create middleware that validates responses:
```typescript
export function validateResponse(schema: ZodSchema) {
  return (req, res, next) => {
    const originalJson = res.json
    res.json = function(data) {
      const validated = schema.parse(data)  // Throws if invalid
      return originalJson.call(this, validated)
    }
    next()
  }
}
```

3. Apply to endpoints:
```typescript
router.get('/', authenticate, validateResponse(claimsListResponseSchema), async (req, res) => {
  // Response will be validated before sending
})
```

**Files to Change:**
- Backend: schemas/responses.ts (new), middleware/validation.ts (extend), routes/*.ts

**Testing:**
- Unit tests that verify schema validation catches mismatches
- Integration tests with actual endpoints
- Ensure no false positives (valid responses pass)

---

## Task #14: Performance Monitoring Hooks

**Status:** ⬜ TODO

**Effort:** 1-2 hours | **Complexity:** Trivial

**Problem:** No visibility into API performance. Slow endpoints are not identified.

**Solution:** Add request timing and query counting middleware.

**Implementation Plan:**

1. Create middleware `backend/src/middleware/performance.ts`:
```typescript
export function performanceMonitoring(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now()
  let queryCount = 0

  // Wrap Prisma to count queries
  const original = prisma.$executeRaw
  prisma.$executeRaw = (...args) => {
    queryCount++
    return original.apply(prisma, args)
  }

  res.on('finish', () => {
    const duration = Date.now() - startTime
    console.log(`[${req.method}] ${req.path} - ${duration}ms (${queryCount} queries)`)
    
    // Log to monitoring service if duration > 1000ms
    if (duration > 1000) {
      logger.warn(`Slow endpoint: ${req.path} took ${duration}ms`)
    }
  })

  next()
}
```

2. Mount in `index.ts`:
```typescript
app.use(performanceMonitoring)
```

3. Include in response headers:
```typescript
res.setHeader('x-response-time', `${duration}ms`)
res.setHeader('x-db-queries', queryCount)
```

**Files to Change:**
- Backend: middleware/performance.ts (new), index.ts

**Testing:**
- Verify timing logged for all requests
- Check headers on responses
- Test with slow queries (add artificial delay)

---

## Task #15: Deprecation Warnings

**Status:** ⬜ TODO

**Effort:** 1 hour | **Complexity:** Trivial

**Problem:** Old endpoints may be deprecated but still used by legacy clients. No way to notify clients that an endpoint is being sunset.

**Solution:** Add deprecation headers and warnings.

**Implementation Plan:**

1. Create utility function `backend/src/utils/deprecation.ts`:
```typescript
export function deprecated(message: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('deprecation', 'true')
    res.setHeader('sunset', new Date(Date.now() + 90*24*60*60*1000).toISOString())
    res.setHeader('x-deprecated-message', message)
    next()
  }
}
```

2. Apply to endpoints being phased out:
```typescript
router.get('/old-endpoint', deprecated('Use /new-endpoint instead'), handler)
```

3. Include in response:
```typescript
res.json({
  data: {...},
  _deprecated: {
    message: 'This endpoint is deprecated',
    alternatives: ['/new-endpoint']
  }
})
```

**Files to Change:**
- Backend: utils/deprecation.ts (new), routes/*.ts (apply as needed)

**Testing:**
- Verify deprecation headers present
- Verify message in response
- Test with client library (should show warning)

---

## Verification Checklist

- [ ] Task #10: Request IDs in logs and responses
- [ ] Task #11: Batch endpoints working for claims and documents
- [ ] Task #12: 403 responses show required role
- [ ] Task #13: Response schemas validated at runtime
- [ ] Task #14: Performance timing in headers and logs
- [ ] Task #15: Deprecation warnings on old endpoints
- [ ] All existing tests still pass
- [ ] `tsc --noEmit` passes

---

## Optional Enhancements (Future)

Beyond the 5 tasks above, consider:

- **Caching:** Add Redis caching for read-heavy endpoints (policies, providers)
- **Rate Limiting:** Per-user, per-IP rate limits on sensitive endpoints
- **Request Logging:** Structured logging with JSON for better analysis
- **GraphQL:** Consider GraphQL endpoint alongside REST for complex queries
- **API Versioning:** Support multiple API versions (v1, v2) for backwards compatibility

---

## What's Next?

All refactoring priorities complete! Next steps:

1. **Testing:** Comprehensive integration test suite covering all changes
2. **Documentation:** Update API guides, client SDKs, deployment procedures
3. **Performance Tuning:** Apply insights from monitoring to optimize slow queries
4. **Phase 3 Features:** Move on to PreAuth, EFT, Clearinghouse integration
