# Phase 3 — Advanced / Enterprise

## Goal

Build the interfaces and data structures required to operate within the **real healthcare billing ecosystem** — clearinghouses, standardized code sets, pre-authorization, and electronic payments. Phase 3 work is not strictly required for a standalone demo but is required for any real-world payer or provider integration.

Phase 3 should not begin until all Critical and High tickets in Phase 1 and Phase 2 are closed.

---

## Tickets

| Order | Ticket | Summary | Priority | Depends on |
|---|---|---|---|---|
| 1 | ✅ [HC-014](HC-014-icd10-diagnosis-codes.md) | ICD-10 Diagnosis Codes | High | — |
| 2 | ✅ [HC-015](HC-015-cpt-codes-line-item-claims.md) | CPT Procedure Codes + Line-Item Claims | High | HC-014 |
| 3a | [HC-016](HC-016-pre-authorization-workflow.md) | Pre-Authorization Workflow | Medium | HC-015 |
| 3b | [HC-017](HC-017-ach-eft-payment-details.md) | ACH / EFT Payment Details | Medium | — |
| 4 | [HC-018](HC-018-digital-claim-signature.md) | Digital Claim Signature | Low | — |
| 5 | [HC-019](HC-019-clearinghouse-edi-837-835.md) | Clearinghouse Integration (X12 EDI 837/835) | Low | HC-014, HC-015, HC-017 |

---

## Dependency Order

```
HC-014  ──►  HC-015  ──►  HC-016
                    ──►  HC-019 ◄── HC-017

HC-017  (standalone, feeds HC-019)
HC-018  (standalone)
```

Suggested delivery order:

1. **HC-014** — ICD-10 codes on `Claim` (unblocks everything structural)
2. **HC-015** — CPT + line items (biggest schema change; do this early)
3. **HC-017 + HC-018** — can be done in parallel; both standalone
4. **HC-016** — pre-auth (needs CPT codes from HC-015)
5. **HC-019** — EDI integration (last; depends on ICD-10, CPT lines, and EFT details)

---

## Definition of Done (Phase 3)

- [ ] All 6 tickets closed
- [ ] Claims can be submitted with ICD-10 codes and CPT line items; adjudicator approves/denies at line level
- [ ] A valid 837P file can be exported for a batch of approved claims and passes X12 5010 structural validation
- [ ] An 835 remittance file can be imported and auto-posts payment results to matched claims
- [ ] Pre-auth requests can be submitted and approved; approved auth numbers are referenceable on claim lines
- [ ] Bank account details are stored encrypted; finance can export a NACHA EFT batch file
- [ ] Digital attestation is captured and stored on every submitted claim
- [ ] `tsc --noEmit` passes on both `backend/` and `frontend/`
