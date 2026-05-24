# HC-001 — Deductible Accumulator

| Field | Value |
|---|---|
| **Type** | Story |
| **Priority** | Critical |
| **Phase** | 1 — Compliance & Correctness |
| **Labels** | business-logic, eligibility, finance |
| **Depends on** | HC-006 (Plan Year Boundary) |

---

## Summary

Implement a deductible accumulator so the system tracks how much of a patient's annual deductible has already been satisfied by prior claims in the same plan year. The current logic applies the full deductible on every claim, producing incorrect reimbursable amounts for any patient with more than one claim per year.

## Background

`calculateEligible()` in `backend/src/services/claims.ts` currently computes:

```
reimbursable = (claimAmount - deductible) * (1 - copayPercent)
```

The `deductible` value is taken directly from the policy tier with no regard for what the patient has already paid. A patient with a $500 deductible who filed a $600 claim in January (satisfying $500 of deductible) owes $0 deductible on a February claim — but the system charges them $500 again.

## Acceptance Criteria

- [ ] A `deductiblePaid` accumulator is tracked per patient per policy per plan year
- [ ] When a claim is adjudicated, the system reads the accumulator to determine remaining deductible (`max(0, deductible - deductiblePaid)`)
- [ ] After adjudication, the accumulator is incremented by the deductible amount applied to this claim
- [ ] Accumulator resets to 0 at the start of each plan year (see HC-006)
- [ ] `calculateEligible()` accepts and uses the remaining deductible, not the tier default
- [ ] All existing tests for `calculateEligible()` are updated to reflect the new signature
- [ ] New unit tests cover: first claim of year, mid-year claim after partial satisfaction, claim after full deductible met

## Technical Notes

- Accumulator can be stored as a computed aggregate (`SUM` of deductible applied across paid/approved claims in the plan year) rather than a persisted field — avoids sync issues
- Plan year boundaries come from `UserPolicy.startDate` (see HC-006)
- Must be recalculated if a claim is reversed or rejected after adjudication
