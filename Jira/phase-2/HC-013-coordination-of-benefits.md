← [Phase 2 Summary](Phase-2-summary.md)

# HC-013 — Coordination of Benefits (COB)

| Field | Value |
|---|---|
| **Type** | Story |
| **Priority** | Low |
| **Phase** | 2 — Operational Realism |
| **Labels** | business-logic, eligibility, finance, multi-payer |
| **Depends on** | HC-010 (In-network / Out-of-network Rates) |

---

## Summary

Implement primary/secondary payer logic so that patients covered by two insurance plans receive correct combined reimbursement. The primary insurer pays first; the secondary insurer covers the remaining patient responsibility up to its own limits. Currently, duplicate coverage is completely unmodelled.

## Background

When a patient has two active policies (e.g., their own employer plan + a spouse's plan), both insurers may have liability on the same claim. Without COB logic:
- The patient could be reimbursed twice (overpayment)
- Or the secondary insurer has no structured way to calculate its share

COB rules are governed by NAIC model regulation and ACA provisions. The standard approach: the primary pays as if the secondary did not exist; the secondary then pays up to 100% of the patient's out-of-pocket remainder, subject to its own limits.

## Acceptance Criteria

- [ ] `UserPolicy` (or a new `CobRecord`) gains a `payerOrder` field: `PRIMARY` or `SECONDARY`
- [ ] On claim submission, if a patient has two active policies the system detects the COB scenario and flags it on the claim
- [ ] Adjudicator UI shows COB flag and prompts for primary payer adjudication first
- [ ] After primary adjudication and payout, a secondary claim can be initiated against the secondary policy; the secondary payout is capped at `patientResponsibility` from the primary EOB
- [ ] Secondary payout cannot cause total reimbursement to exceed `claimAmount` (no profit for patient)
- [ ] Both payouts are linked to the same originating claim and appear together in the patient claim detail
- [ ] If the primary is an external insurer (not in this system), Finance Officer can manually enter the primary EOB data to initiate secondary adjudication
- [ ] Unit tests cover: standard COB (full primary + partial secondary), secondary capped at patient responsibility, external primary manual entry path

## Technical Notes

- COB interacts with the deductible accumulator (HC-001): both primary and secondary accumulators must be updated after adjudication
- The "birthday rule" (which plan is primary for a dependent) is out of scope — assume payer order is explicitly configured by admin
- External primary entry field needs: `primaryInsurerName`, `primaryPaidAmount`, `primaryEOBDate`; store on the `Claim` or a child `CobDetail` record
