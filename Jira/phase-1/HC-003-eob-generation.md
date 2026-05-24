# HC-003 — EOB Generation (Explanation of Benefits)

| Field | Value |
|---|---|
| **Type** | Story |
| **Priority** | High |
| **Phase** | 1 — Compliance & Correctness |
| **Labels** | documents, compliance, aca-compliance, patient-portal |
| **Depends on** | HC-001 (Deductible Accumulator), HC-002 (OOP Maximum) |

---

## Summary

Automatically generate an Explanation of Benefits (EOB) document when a claim is adjudicated (moved to APPROVED or REJECTED). The EOB must show the billed amount, allowed amount, insurance payment, and patient responsibility. This is legally required under ACA §2715.

## Background

An EOB is the primary artifact a patient receives after a claim is processed. It is not a bill — it is an explanation of how the insurer applied benefits. Currently the system produces no such document; patients can only see raw claim data. Regulators and patients both expect a formal EOB.

## Acceptance Criteria

- [ ] An EOB is generated automatically when a claim transitions to `APPROVED` or `REJECTED`
- [ ] EOB content includes:
  - Patient name, member ID, policy number
  - Claim number and date of service
  - Provider name (free text until HC-Phase2 provider entity)
  - Billed amount (`totalAmount`)
  - Allowed amount (post-deductible base)
  - Deductible applied (this claim)
  - Copay applied
  - Insurance paid (`reimbursable` or `adjustedAmount`)
  - Patient responsibility (billed − insurance paid)
  - Denial reason if status is REJECTED
- [ ] EOB is stored as a `Document` record linked to the claim with `type = 'EOB'`
- [ ] EOB is visible and downloadable on the patient's claim detail page
- [ ] EOB is read-only and cannot be deleted by any role
- [ ] Unit test covers EOB field calculations for approved and rejected cases

## Technical Notes

- Generate as PDF using a server-side library (e.g. `pdfkit`) or as a structured HTML template rendered to PDF
- Trigger generation inside the claim service at the point of status transition, not in the route handler
- `Document.uploadedBy` should reference the system/adjuster user who triggered the transition
- Store EOB in the same `uploads/` directory as other documents; flag `isSystemGenerated = true` to distinguish from user uploads (schema addition required)
