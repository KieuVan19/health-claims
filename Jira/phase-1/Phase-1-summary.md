# Phase 1 — Compliance & Correctness

## Goal

Fix everything that is **silently wrong or legally required** before the system can be used in production.
This phase addresses two categories:

- **Silent correctness bugs** — the app runs but produces wrong financial results (deductible always reapplied in full, no OOP cap). Every patient with more than one claim per year is affected.
- **Legal obligations** — EOB generation (ACA §2715), HIPAA access audit logging, and claim filing deadlines are regulatory requirements, not optional features.

No Phase 2 or Phase 3 work should begin until all Critical and High tickets in this phase are closed.

---

## Tickets

| Order | Ticket | Summary | Priority | Depends on |
|---|---|---|---|---|
| 1 | ✅ [HC-006](HC-006-plan-year-boundary.md) | Plan Year Boundary & Deductible Reset | Medium | — |
| 2 | ✅ [HC-001](HC-001-deductible-accumulator.md) | Deductible Accumulator | Critical | HC-006 |
| 3 | ✅ [HC-002](HC-002-out-of-pocket-maximum.md) | Out-of-Pocket Maximum | Critical | HC-001, HC-006 |
| 4a | ✅ [HC-004](HC-004-claim-filing-deadline.md) | Claim Filing Deadline Enforcement | High | — |
| 4b | ✅ [HC-005](HC-005-hipaa-read-audit-logging.md) | HIPAA Read-Access Audit Logging | High | — |
| 5 | ✅ [HC-003](HC-003-eob-generation.md) | EOB Generation | High | HC-001, HC-002 |

---

## Dependency Order

```
HC-006  ──►  HC-001  ──►  HC-002  ──►  HC-003
             (accumulator needs    (EOB needs correct
              plan year scope)      amounts first)

HC-004  (standalone)
HC-005  (standalone)
```

Suggested delivery order:

1. **HC-006** — implement plan year boundary utility (unblocks everything)
2. **HC-001** — deductible accumulator (unblocks HC-002 and HC-003)
3. **HC-002** — OOP maximum (unblocks HC-003)
4. **HC-004 + HC-005** — can be done in parallel with HC-001/002
5. **HC-003** — EOB generation (last, depends on correct amounts from HC-001/002)

---

## Definition of Done (Phase 1)

- [ ] All 6 tickets closed
- [ ] `calculateEligible()` unit tests cover: first claim of year, mid-year after partial deductible, post-OOP-max claim
- [ ] EOB document generated and accessible for every APPROVED and REJECTED claim
- [ ] Filing deadline validation blocks late submissions with a clear error message
- [ ] Read events appear in the Admin audit log for claims, documents, and patient profiles
- [ ] `tsc --noEmit` passes on both `backend/` and `frontend/`
