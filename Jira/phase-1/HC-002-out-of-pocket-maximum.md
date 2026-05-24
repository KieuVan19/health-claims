# HC-002 — Out-of-Pocket Maximum

| Field | Value |
|---|---|
| **Type** | Story |
| **Priority** | Critical |
| **Phase** | 1 — Compliance & Correctness |
| **Labels** | business-logic, eligibility, aca-compliance |
| **Depends on** | HC-001 (Deductible Accumulator), HC-006 (Plan Year Boundary) |

---

## Summary

Implement an out-of-pocket (OOP) maximum per policy. Once a patient's cumulative cost-sharing (deductible + copay payments) reaches the OOP max for the plan year, the insurer covers 100% of subsequent eligible expenses. This is legally required under the ACA.

## Background

The ACA caps annual out-of-pocket costs per enrollee. Currently the system applies copay on every claim indefinitely with no ceiling. A patient who has already paid $7,000 in deductibles and copays this year would, in the real world, owe nothing on their next claim — but the system keeps charging them.

## Acceptance Criteria

- [ ] Each policy tier has a configurable `oopMax` value (e.g. Basic: $8,000 / Standard: $6,000 / Premium: $4,000)
- [ ] A per-patient, per-plan-year OOP accumulator tracks total cost-sharing paid (deductible applied + copay applied)
- [ ] When the accumulator reaches `oopMax`, `calculateEligible()` sets copay to 0% and remaining deductible to $0 for that claim
- [ ] The OOP accumulator is updated after each adjudicated claim
- [ ] OOP accumulator resets at plan year start (see HC-006)
- [ ] `oopMax` is displayed on the patient's policy detail page
- [ ] Unit tests cover: claim before OOP hit, claim that partially hits OOP mid-calculation, claim after OOP fully met

## Technical Notes

- `oopMax` should be added to the `Policy` model in Prisma schema alongside `deductible` and `copayPercent`
- Admin UI should allow per-policy configuration of `oopMax` (consistent with existing deductible/copay config pattern)
- OOP accumulator = sum of `(deductible applied + copay applied)` across all approved/paid claims in the plan year
