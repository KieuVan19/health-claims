# Phase 2 — Operational Realism

## Goal

Make the system work the way an actual insurer's operations team expects. Phase 1 fixed silent
correctness bugs and legal obligations. Phase 2 adds the operational infrastructure — appeal
rights, SLA visibility, structured provider data, queue management, and financial edge cases — that
separates a demo from a production-grade claims platform.

Do not begin Phase 3 (enterprise / ecosystem features) until the two High tickets in this phase
are closed, as they address ACA-mandated appeal rights and state-mandated turnaround compliance.

---

## Tickets

| Order | Ticket | Summary | Priority | Depends on |
|---|---|---|---|---|
| 1a | ✅ [HC-007](HC-007-appeal-workflow.md) | Appeal Workflow | High | — |
| 1b | ✅ [HC-008](HC-008-sla-tat-tracking.md) | SLA / TAT Tracking | High | — |
| 2 | ✅ [HC-009](HC-009-provider-entity-npi.md) | Provider Entity (NPI) | Medium | — |
| 3 | ✅ [HC-010](HC-010-in-network-out-of-network-rates.md) | In-Network vs Out-of-Network Rates | Medium | HC-009 |
| 4 | ✅ [HC-011](HC-011-claim-auto-assignment.md) | Claim Auto-Assignment | Medium | HC-009 (optional) |
| 5 | ✅ [HC-012](HC-012-overpayment-recoupment.md) | Overpayment / Recoupment | Low | — |
| 6 | ✅ [HC-013](HC-013-coordination-of-benefits.md) | Coordination of Benefits (COB) | Low | HC-010 |

---

## Dependency Order

```
HC-007  (standalone — appeal statuses and workflow)
HC-008  (standalone — SLA age calculation)

HC-009  ──►  HC-010  ──►  HC-013
(provider     (OON rates    (COB needs
 entity)       need NPI)     rate schedules)

HC-009  ──►  HC-011  (specialty routing uses provider.specialty)
              (workload balancing works without HC-009)

HC-012  (standalone — overpayment offset logic)
```

Suggested delivery order:

1. **HC-007 + HC-008** — ship appeal rights and SLA tracking in parallel (both standalone, both High)
2. **HC-009** — provider entity; unblocks HC-010 and HC-011
3. **HC-010 + HC-011** — can be parallelised once HC-009 is merged
4. **HC-012** — standalone, low risk, can be done any time after HC-007
5. **HC-013** — last, depends on correct rate schedules from HC-010

---

## Schema Changes Summary

| Ticket | Model(s) affected |
|---|---|
| HC-007 | `ClaimStatus` enum, `ClaimEvent.eventType` enum |
| HC-009 | New `Provider` model; `Claim.providerId` FK |
| HC-010 | `Policy` / `PolicyTierConfig` — OON rate fields |
| HC-011 | `Claim.assignedAdjusterId` FK; `User.specialty` optional field |
| HC-012 | New `Overpayment` model |
| HC-013 | `UserPolicy.payerOrder` enum; optional `CobDetail` model |

All schema changes require `pnpm db:migrate` run from `backend/`.

---

## Definition of Done (Phase 2)

- [ ] All 7 tickets closed
- [ ] Appeal workflow: patient can initiate, second adjudicator resolves, all transitions logged as `ClaimEvent`
- [ ] SLA dashboard shows age in days, amber/red indicators, and compliance report accessible to Admin/Finance
- [ ] Provider entity seeded with demo data; NPI validation (10-digit Luhn check) enforced
- [ ] `calculateEligible()` selects correct rate schedule based on `claim.provider.inNetwork`
- [ ] Claims auto-assigned on submission; adjuster queue filtered to own claims by default
- [x] Overpayment offset applied automatically on next payout; Finance can waive with audit trail
- [ ] COB scenario: secondary payout capped at primary patient responsibility; total ≤ claim amount
- [ ] `tsc --noEmit` passes on both `backend/` and `frontend/`
