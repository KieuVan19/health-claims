[← Phase 3 Summary](Phase-3-summary.md)

# HC-015 — CPT Procedure Codes + Line-Item Claims

| Field | Value |
|---|---|
| **Type** | Story |
| **Priority** | High |
| **Phase** | 3 — Advanced / Enterprise |
| **Labels** | billing, schema, eligibility, finance |
| **Depends on** | HC-014 (ICD-10 Diagnosis Codes) |

---

## Summary

Replace the single-amount `Claim` model with an itemized line structure. Each service billed on a claim becomes a `ClaimLine` with its own CPT code, units, billed amount, and adjudication outcome. Adjudicators approve or deny at the line level, not the whole claim.

## Background

Real medical claims (CMS-1500, UB-04) are itemized: a single visit may generate lines for an office visit (CPT 99213), a blood draw (CPT 36415), and a lab panel (CPT 80053), each billed and adjudicated separately. The current `Claim.totalAmount` is a single scalar — impossible to map to clearinghouse formats or apply procedure-level coverage rules. This is the single biggest structural gap between the current system and real-world claims processing.

CPT codes are maintained by the AMA. The system needs to store and validate the format (5-digit numeric string) — it does not need a full CPT codeset lookup in Phase 3.

## Acceptance Criteria

- [ ] New `ClaimLine` entity in Prisma schema with fields: `id`, `claimId`, `lineNumber` (1-based), `cptCode` (5-digit string), `modifier` (optional 2-char), `diagnosisPointers` (array of indices into `Claim.diagnosisCodes`), `units` (positive integer), `billedAmount`, `allowedAmount` (nullable, set at adjudication), `adjudicationStatus` (`PENDING | APPROVED | DENIED | REDUCED`), `denialReason` (nullable string), `adjudicatorNote` (nullable)
- [ ] `Claim.totalAmount` is deprecated; `Claim.totalBilled` is computed as `SUM(ClaimLine.billedAmount)` and `Claim.totalAllowed` as `SUM(ClaimLine.allowedAmount)` on approved lines
- [ ] Claim submission accepts an array of line items (min 1); each line is validated (CPT format, units > 0, billedAmount > 0, diagnosisPointers reference valid indices)
- [ ] Adjudicator can approve/deny/reduce each line independently via a new line-level endpoint
- [ ] Overall claim status remains computed from line statuses: all lines approved → `APPROVED`; any line denied with no approved lines → `REJECTED`; mixed → `PARTIALLY_APPROVED` (new status)
- [ ] Eligibility calculation (`calculateEligible()`) operates on `totalAllowed` across approved lines
- [ ] Frontend adjudicator view shows a line-item table; each row has an approve/deny/reduce control
- [ ] Patient claim detail view shows line breakdown (CPT, description placeholder, billed, allowed, patient responsibility per line)
- [ ] All existing unit tests for `calculateEligible()` are updated to use multi-line claim fixtures
- [ ] `tsc --noEmit` passes on both packages

## Technical Notes

- New status `PARTIALLY_APPROVED` must be added to the `ClaimStatus` enum and to the frontend `StatusBadge` component
- `diagnosisPointers` is a JSON array of 0-based integers mapping to `Claim.diagnosisCodes`; e.g., `[0]` means this line is for the primary diagnosis
- CPT format regex: `/^\d{5}$/`; modifiers are two uppercase alphanumeric characters (e.g., `LT`, `59`)
- `ClaimEvent` should record line-level adjudication actions with a `lineId` reference for the audit trail
- HC-016 (Pre-auth) will reference `ClaimLine.cptCode` to check whether a procedure required pre-authorization
- HC-019 (EDI 837) maps directly to `ClaimLine` records as SV1 (professional) or SV2 (institutional) segments
