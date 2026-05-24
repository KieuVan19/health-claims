[← Phase 3 Summary](Phase-3-summary.md)

# HC-014 — ICD-10 Diagnosis Codes

| Field | Value |
|---|---|
| **Type** | Story |
| **Priority** | High |
| **Phase** | 3 — Advanced / Enterprise |
| **Labels** | billing, schema, eligibility, compliance |
| **Depends on** | — |

---

## Summary

Add ICD-10 diagnosis code support to claims so the system can enforce medical necessity rules, communicate with clearinghouses, and satisfy CMS requirements. Without standardized diagnosis codes, the system cannot interface with any real payer or billing ecosystem.

## Background

Every claim submitted through a clearinghouse (837 transaction) must include at least one ICD-10-CM diagnosis code. Adjudicators also use ICD-10 to apply coverage rules — e.g., an MRI (CPT 70553) may be covered for diagnosis G35 (multiple sclerosis) but not for Z00.00 (routine exam). The current `Claim` model has no diagnosis field at all; the claim `description` is free text with no structured coding.

ICD-10-CM has ~72,000 codes. The system does not need to validate against the full codeset in Phase 3 — format validation (`[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?`) is sufficient. Full codeset lookup is an operational enhancement.

## Acceptance Criteria

- [ ] `Claim` schema gains a `diagnosisCodes` field: ordered array of ICD-10 codes (primary diagnosis first), min 1, max 12 (837 limit)
- [ ] Claim submission endpoint validates each code against the ICD-10 format regex; rejects malformed codes with a 400 and a field-level error
- [ ] Existing claims without diagnosis codes are treated as legacy (`diagnosisCodes: []`) and do not fail validation retroactively
- [ ] Frontend claim submission form includes a repeatable diagnosis code input (add/remove rows) with format hint
- [ ] Adjudicator claim detail view displays diagnosis codes with a label ("Primary", "Secondary")
- [ ] `tsc --noEmit` passes on both packages after schema change

## Technical Notes

- Add `diagnosisCodes String` (JSON array serialized, SQLite) or `DiagnosisCode[]` relation (PostgreSQL) to the `Claim` model; JSON serialization is simpler for Phase 3
- Run `pnpm db:migrate` from `backend/` after schema change
- ICD-10 format regex: `/^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/`
- Primary diagnosis is always `diagnosisCodes[0]`; this ordering matters for 837 segment ordering in HC-019
- HC-015 (CPT codes) will reference diagnosis codes at the line level — keep the array on `Claim` as the claim-level principal diagnoses; line-level diagnosis pointers come with HC-015
