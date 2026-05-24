# HC-005 — HIPAA Read-Access Audit Logging

| Field | Value |
|---|---|
| **Type** | Story |
| **Priority** | High |
| **Phase** | 1 — Compliance & Correctness |
| **Labels** | security, hipaa-compliance, audit, backend |
| **Depends on** | None |

---

## Summary

Extend the existing `AuditLog` to capture read-access events (who viewed a patient's claim, document, or profile) in addition to the mutations it already tracks. HIPAA's Security Rule requires a full access audit trail for all Protected Health Information (PHI), not just write operations.

## Background

The current `AuditLog` records state changes (status transitions, payout processing, etc.) but silently ignores reads. Under HIPAA 45 CFR §164.312(b), covered entities must log all access to PHI — including reads — so that unauthorized access can be detected and reported. An adjuster viewing a patient record must be traceable.

## Acceptance Criteria

- [ ] Read events are logged to `AuditLog` for the following resources:
  - `GET /api/claims/:id` (claim detail viewed)
  - `GET /api/claims/:id/documents` (document list viewed)
  - `GET /api/documents/:id` (document downloaded or viewed)
  - `GET /api/users/:id` (patient profile viewed by non-patient role)
- [ ] Each log entry captures: `userId`, `action` (`VIEW`), `resource`, `resourceId`, `ipAddress`, `userAgent`, `createdAt`
- [ ] Read logs are visible in the Admin audit log UI alongside existing mutation logs
- [ ] Read logging does not add more than 50ms to any read endpoint (use async fire-and-forget write)
- [ ] Patients viewing their own claims are logged with `action = 'VIEW_OWN'` to distinguish from cross-user access
- [ ] Unit tests verify that read endpoints produce the correct `AuditLog` entry

## Technical Notes

- Implement as a reusable middleware or service helper `audit.logRead(userId, resource, resourceId, req)` — avoids duplicating log calls in every route handler
- Fire-and-forget: `audit.logRead(...)` should not be awaited in the route handler to avoid blocking the response
- `ipAddress` from `req.ip`; `userAgent` from `req.headers['user-agent']`
- Consider a separate `AuditLog` category/flag for read vs. write events to simplify compliance report queries
