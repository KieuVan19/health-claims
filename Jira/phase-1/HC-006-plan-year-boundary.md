# HC-006 — Plan Year Boundary & Deductible Reset

| Field | Value |
|---|---|
| **Type** | Story |
| **Priority** | Medium |
| **Phase** | 1 — Compliance & Correctness |
| **Labels** | business-logic, eligibility, policy |
| **Depends on** | None |
| **Blocks** | HC-001 (Deductible Accumulator), HC-002 (OOP Maximum) |

---

## Summary

Define and enforce plan year boundaries so that accumulators (deductible, out-of-pocket maximum) reset correctly at the start of each new plan year. Without this, HC-001 and HC-002 accumulators never clear, causing patients to pay $0 deductible for the rest of their life after their first claim year.

## Background

A plan year is a 12-month period defined by the policy start date. Each year on the anniversary of `UserPolicy.startDate`, all cost-sharing accumulators reset to zero. Some policies use a fixed calendar year (Jan 1), others use the policy anniversary date. Both patterns must be supported.

## Acceptance Criteria

- [ ] `UserPolicy` has a `planYearType` field: `CALENDAR` (resets Jan 1) or `ANNIVERSARY` (resets on `startDate` month/day each year)
- [ ] A `getPlanYearStart(userPolicy, referenceDate)` utility returns the start date of the plan year containing `referenceDate`
- [ ] Deductible and OOP accumulators (HC-001, HC-002) use `getPlanYearStart` to scope their aggregate queries
- [ ] When a claim is submitted, the plan year is determined and stored on the claim for immutable reference (`planYearStart` field)
- [ ] Admin UI shows the current plan year start date on the patient's policy detail
- [ ] Unit tests cover: mid-year claim, claim on exact anniversary, claim spanning year boundary (edge case)

## Technical Notes

- `getPlanYearStart` is a pure utility function with no DB dependency — easy to unit test
- `planYearStart` denormalized on `Claim` prevents recalculation bugs if policy dates are ever corrected retroactively
- Default `planYearType` to `CALENDAR` for all existing seeded policies in migration
