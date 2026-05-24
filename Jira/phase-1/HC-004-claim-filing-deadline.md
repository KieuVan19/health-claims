# HC-004 — Claim Filing Deadline Enforcement

| Field | Value |
|---|---|
| **Type** | Story |
| **Priority** | High |
| **Phase** | 1 — Compliance & Correctness |
| **Labels** | business-logic, submission, validation |
| **Depends on** | None |

---

## Summary

Enforce a configurable claim filing deadline: a claim may not be submitted if the incident date is more than N days before the submission date. The `incidentDate` field already exists on the `Claim` model but is never validated against the submission timestamp.

## Background

Standard insurance policies require claims to be filed within 90–365 days of the date of service. Accepting a claim for an incident from three years ago exposes the insurer to significant financial and fraud risk. Currently any `incidentDate` value is accepted without validation.

## Acceptance Criteria

- [ ] A `filingDeadlineDays` value is configurable per policy (default: 365)
- [ ] On claim submission (`DRAFT → SUBMITTED`), the backend validates that `incidentDate >= submissionDate - filingDeadlineDays`
- [ ] If validation fails, the API returns a `422` with a clear error message: _"Claim filing deadline exceeded. Claims for this policy must be filed within {N} days of the incident date."_
- [ ] The frontend surfaces this error on the patient claim submission form
- [ ] A warning is shown (not a block) when `incidentDate` is within 30 days of the deadline
- [ ] Admins can override the deadline for a specific claim with an audit log entry
- [ ] Unit tests cover: within deadline, past deadline, exactly on deadline, admin override

## Technical Notes

- Validation belongs in the claim service (`submitClaim()`), not the route handler
- `filingDeadlineDays` can be added to the `Policy` model in Prisma schema
- The admin override should create an `AuditLog` entry with `action = 'OVERRIDE_FILING_DEADLINE'`
