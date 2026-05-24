← [Phase 2 Summary](Phase-2-summary.md)

# HC-010 — In-Network vs Out-of-Network Rates

| Field | Value |
|---|---|
| **Type** | Story |
| **Priority** | Medium |
| **Phase** | 2 — Operational Realism |
| **Labels** | business-logic, eligibility, provider, finance |
| **Depends on** | HC-009 (Provider Entity / NPI) |

---

## Summary

Apply differentiated deductible and copay rates depending on whether the treating provider is in-network or out-of-network. The same claim amount should produce different reimbursable amounts based on network status, which is currently not modelled at all.

## Background

`calculateEligible()` in `backend/src/services/claims.ts` uses a single deductible + copay per policy tier. Real policies have separate in-network and out-of-network schedules — out-of-network typically carries a higher deductible and a higher copay (or is uncovered entirely for HMO plans). Without this distinction, every out-of-network claim is incorrectly calculated.

Example for a Standard plan patient:
| | In-network | Out-of-network |
|---|---|---|
| Deductible | $250 | $500 |
| Copay | 20% | 40% |

## Acceptance Criteria

- [ ] `Policy` model (or a `PolicyTierConfig` entity) gains separate `oonDeductible` and `oonCopayPercent` fields alongside existing in-network values
- [ ] `calculateEligible()` accepts a `networkStatus: 'IN' | 'OUT'` parameter and selects the correct deductible/copay schedule
- [ ] Network status is derived from `claim.provider.inNetwork` (set in HC-009); claims without a provider default to in-network rates
- [ ] EOB document (HC-003) displays the applicable network tier and rate schedule used
- [ ] Admin can configure out-of-network rates per policy tier in the Policy management UI
- [ ] Seed data updated to include out-of-network rate values for all three tiers
- [ ] Unit tests cover: in-network calculation, out-of-network calculation, missing provider (defaults to in-network), post-Phase-1 accumulator interaction (HC-001)

## Technical Notes

- Out-of-network deductibles and in-network deductibles are tracked via **separate accumulators** — a patient paying toward their OON deductible does not reduce their in-network deductible (see HC-001)
- Run `pnpm db:migrate` from `backend/` after schema changes
- This ticket deliberately excludes HMO "no OON coverage" logic — that is a policy-level flag, not a rate; descope if it bloats this ticket
