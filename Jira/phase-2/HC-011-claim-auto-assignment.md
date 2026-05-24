← [Phase 2 Summary](Phase-2-summary.md)

# HC-011 — Claim Auto-Assignment

| Field | Value |
|---|---|
| **Type** | Story |
| **Priority** | Medium |
| **Phase** | 2 — Operational Realism |
| **Labels** | operations, adjudication, queue-management |
| **Depends on** | HC-009 (Provider Entity / NPI) — optional; needed for specialty routing |

---

## Summary

Automatically assign newly submitted claims to an adjuster based on workload balancing, provider specialty, or geography. Currently, claims land in an unassigned pool and must be manually picked up — there is no queue management and no visibility into adjuster capacity.

## Background

The current adjuster queue shows all unassigned `SUBMITTED` claims to all adjusters. There is no assignment model — any adjuster can pick any claim. In a real operations environment:
- Adjusters have a maximum concurrent workload
- Dental/vision/mental-health claims are routed to specialists
- Some plans use geography-based routing

Without auto-assignment, overloading one adjuster while others are idle is invisible until SLA breaches occur.

## Acceptance Criteria

- [ ] `Claim` model gains an `assignedAdjusterId` nullable FK to `User`
- [ ] On submission, an assignment rule engine selects an adjuster and sets `assignedAdjusterId`; a `ClaimEvent` of type `ASSIGNED` is created
- [ ] Default rule: **round-robin by current open-claim count** (assign to the adjuster with the fewest claims in `SUBMITTED` or `UNDER_REVIEW`)
- [ ] Optional specialty rule: if `claim.provider.specialty` matches an adjuster's `specialty` field (new optional field on `User`), prefer that adjuster over workload alone
- [ ] Adjusters see only their own assigned claims in their queue by default; a toggle reveals all unassigned claims (for manual re-assignment)
- [ ] Admin can manually reassign a claim to a different adjuster from the claim detail view
- [ ] Admin dashboard shows per-adjuster open claim count
- [ ] Unit tests cover: round-robin with two adjusters, specialty match overriding workload, no-adjuster-available fallback (claim remains unassigned, admin alerted)

## Technical Notes

- Assignment logic lives in a new `backend/src/services/assignment.ts` — keep it out of the route handler
- The specialty field on `User` is optional and admin-managed; absence means "general" (eligible for any claim)
- If no eligible adjuster exists (all at capacity or no specialist available), log a warning via `audit.ts` and leave claim unassigned rather than blocking submission
- Geography routing is explicitly out of scope for this ticket
