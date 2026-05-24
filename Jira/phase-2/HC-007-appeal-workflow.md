← [Phase 2 Summary](Phase-2-summary.md)

# HC-007 — Appeal Workflow

| Field | Value |
|---|---|
| **Type** | Story |
| **Priority** | High |
| **Phase** | 2 — Operational Realism |
| **Labels** | workflow, adjudication, compliance, status |
| **Depends on** | — |

---

## Summary

Implement an internal appeal process for rejected claims so that patients can contest decisions, as mandated by ACA internal and external appeal rights. Rejected claims are currently dead ends with no recourse path.

## Background

When a claim reaches `REJECTED` status, the patient has no mechanism to challenge the decision. The ACA mandates that insurers provide:
- An internal appeal (reviewed by a different adjudicator)
- An external appeal (independent review organisation) if the internal appeal is also denied

The current `ClaimStatus` enum (`DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `INFO_REQUESTED`, `REJECTED`, `PAID`) has no appeal states and no second-adjudicator assignment model.

## Acceptance Criteria

- [ ] `ClaimStatus` enum extended with `APPEAL_PENDING`, `APPEAL_APPROVED`, `APPEAL_DENIED`
- [ ] Patient can initiate an appeal on any claim in `REJECTED` status; a `ClaimEvent` is recorded
- [ ] Appeal is assigned to a *different* adjudicator than the one who made the original decision
- [ ] Assigned adjudicator sees appeal claims in their queue with a distinct "Appeal" badge
- [ ] Adjudicator can resolve the appeal as `APPEAL_APPROVED` (triggers re-adjudication / payout flow) or `APPEAL_DENIED`
- [ ] `APPEAL_DENIED` generates an external appeal notice informing the patient of their right to an independent review
- [ ] All status transitions create immutable `ClaimEvent` records (do not bypass the event log)
- [ ] Role-check: only `PATIENT` role can initiate; only `ADJUSTER` role can resolve
- [ ] Unit tests cover: initiation from non-REJECTED state (should fail), same-adjudicator assignment (should fail), approved/denied resolution paths

## Technical Notes

- Add new statuses to `ClaimStatus` enum in `prisma/schema.prisma`; run `pnpm db:migrate` from `backend/`
- `ClaimEvent` `eventType` needs corresponding new values (`APPEAL_INITIATED`, `APPEAL_RESOLVED`)
- Second-adjudicator constraint: store `originalAdjudicatorId` on the claim or derive from the last `UNDER_REVIEW` event; reject assignment if IDs match
- `APPEAL_APPROVED` should re-enter the normal adjudication flow (`UNDER_REVIEW`) rather than auto-approve, so the second adjudicator can set the correct reimbursable amount
