← [Phase 2 Summary](Phase-2-summary.md)

# HC-012 — Overpayment / Recoupment

| Field | Value |
|---|---|
| **Type** | Story |
| **Priority** | Low |
| **Phase** | 2 — Operational Realism |
| **Labels** | finance, payout, business-logic |
| **Depends on** | — |

---

## Summary

Detect and track overpaid claims and offset the excess against a future payout rather than demanding immediate cash repayment. Currently the system has no mechanism to flag or recover overpayments caused by adjuster error or a post-payment Coordination of Benefits update.

## Background

Overpayments arise from:
- **Adjuster error** — approved amount entered incorrectly
- **COB update** (HC-013) — a secondary insurer pays after the primary already overpaid
- **Retroactive policy change** — a policy is cancelled back-dated, reducing entitlement

Without a recoupment model, these errors are unrecoverable in the system. Finance must handle them out-of-band, and there is no audit trail.

## Acceptance Criteria

- [ ] New `Overpayment` entity: `id`, `claimId`, `originalPayoutId`, `overpaidAmount`, `reason` (enum: `ADJUSTER_ERROR`, `COB_UPDATE`, `POLICY_CHANGE`), `status` (enum: `IDENTIFIED`, `OFFSET`, `WAIVED`), `createdAt`
- [ ] Finance Officer can flag a `PAID` claim as overpaid, entering the overpaid amount and reason; an `AuditLog` entry is created
- [ ] When the patient's next claim reaches `APPROVED`, the system automatically deducts the outstanding overpayment balance from the payout (up to 100% of the new payout — no negative payouts)
- [ ] Remaining unrecovered balance carries forward to subsequent claims until fully offset
- [ ] Finance Officer can waive an overpayment (moves to `WAIVED`); waiver requires a reason and is audit-logged
- [ ] Patient is notified when an overpayment offset is applied to their payout, with the reduced amount and explanation
- [ ] Unit tests cover: full offset in one payout, partial offset carrying forward, waiver flow

## Technical Notes

- Negative payouts must be prevented at the `Payout` creation layer — clamp reimbursable to `max(0, reimbursable - pendingRecoupment)`
- The offset logic should live in `backend/src/services/payouts.ts` (or equivalent) alongside existing payout calculation
- Overpayment records are immutable once in `OFFSET` or `WAIVED`; status transitions are append-only via `ClaimEvent`-style log
