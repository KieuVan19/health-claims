# Health Claims Portal — Feature Roadmap

---

## Phase 1 — Compliance & Correctness

> Things that are **silently wrong or legally required today**. Ship these before going live.

| Priority | Feature | Why it matters |
|---|---|---|
| Critical | **Deductible accumulator** | Current logic applies full deductible on every claim. A patient who already paid $400 this year owes only $100 more. Every eligibility calc after claim #1 is wrong. |
| Critical | **Out-of-pocket maximum** | ACA-mandated. Once OOP max is hit, copay drops to 0%. No model or logic for this at all. |
| High | **EOB generation (Explanation of Benefits)** | Legally required per ACA §2715. Every adjudicated claim must produce a document: billed, allowed, insurance paid, patient responsibility. |
| High | **Claim filing deadline enforcement** | Policies require filing within 90–365 days of service. `incidentDate` exists in the schema but nothing validates it against submission date. |
| High | **HIPAA read-access audit logging** | Current `AuditLog` captures writes only. HIPAA requires logging who *viewed* a patient record, not just who changed it. |
| Medium | **Plan year boundary & deductible reset** | Deductibles reset on anniversary/Jan 1. Without this, the accumulator will never clear between years. |

---

## Phase 2 — Operational Realism

> Features that make the system work like an actual insurer's operations team expects.

| Priority | Feature | Why it matters |
|---|---|---|
| High | **Appeal workflow** | Rejected claims are currently dead ends. ACA mandates internal + external appeal rights. Needs new statuses (`APPEAL_PENDING`, `APPEAL_APPROVED`, `APPEAL_DENIED`) and a second adjudicator assignment. |
| High | **SLA / TAT tracking** | Most states require acknowledgement within 10 days, adjudication within 30–45 days. Need an aging indicator in the adjuster queue ("Day 28 — at risk") and a compliance report. |
| Medium | **Provider entity (NPI)** | Claims are filed against a treating provider (doctor/hospital), not free text. NPI lookup enables in-network vs out-of-network rate differentiation. |
| Medium | **In-network vs out-of-network rates** | Same claim, different deductible/copay depending on provider network status. Requires Provider entity first. |
| Medium | **Claim auto-assignment** | Adjusters currently have no queue management. Real systems assign by workload, specialty (dental adjuster for dental claims), or geography. |
| Low | **Overpayment / recoupment** | When a claim is overpaid (adjuster error, COB update), the system needs to flag it and offset against a future payment rather than demand cash back. |
| Low | **Coordination of Benefits (COB)** | Patient with two insurers needs primary/secondary payer logic. The primary pays first; secondary covers the gap up to its limits. |

---

## Phase 3 — Advanced / Enterprise

> Correctness-optional today, but required to interface with real healthcare billing ecosystems.

| Priority | Feature | Why it matters |
|---|---|---|
| High | **ICD-10 diagnosis codes** | Standardized diagnosis codes required by CMS and all clearinghouses. Enables automated eligibility rules ("this CPT is not covered for this ICD"). |
| High | **CPT procedure codes + line-item claims** | Real claims are itemized: each service billed separately. Adjudicators approve/deny at the line level, not the whole claim. |
| Medium | **Pre-authorization workflow** | Many procedures (surgery, MRI) require insurer sign-off *before* service. Needs a separate `PreAuth` entity with its own lifecycle, separate from claims. |
| Medium | **ACH / EFT payment details** | Real finance teams don't enter payment refs manually — they export a NACHA file or trigger an ACH transfer. Needs bank account fields on patient profile and EFT batch export. |
| Low | **Digital claim signature** | Patients must attest that the claim is accurate. Currently no signature capture or audit of consent. |
| Low | **Clearinghouse integration (X12 EDI 837/835)** | The industry standard for submitting claims (837) and receiving remittances (835). Required to talk to real payers and providers at scale. |

---

## Summary

```
Phase 1 — Fix before go-live        6 features   (2× Critical, 3× High, 1× Medium)
Phase 2 — Operational completeness  7 features   (2× High, 3× Medium, 2× Low)
Phase 3 — Enterprise / ecosystem    6 features   (2× High, 2× Medium, 2× Low)
```

The two Critical items (deductible accumulator + OOP max) are the only ones where the app produces
**incorrect financial results today** — everything else is a missing feature rather than a wrong one.
