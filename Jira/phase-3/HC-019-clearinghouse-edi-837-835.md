[← Phase 3 Summary](Phase-3-summary.md)

# HC-019 — Clearinghouse Integration (X12 EDI 837/835)

| Field | Value |
|---|---|
| **Type** | Story |
| **Priority** | Low |
| **Phase** | 3 — Advanced / Enterprise |
| **Labels** | integration, billing, finance, compliance |
| **Depends on** | HC-014 (ICD-10), HC-015 (CPT + Line Items), HC-017 (ACH/EFT) |

---

## Summary

Implement export of claims as X12 EDI 837P (professional claims) files for submission to a clearinghouse, and import of X12 EDI 835 (Electronic Remittance Advice) files to auto-post payment results. This is the industry-standard protocol for communicating with payers and providers at scale.

## Background

X12 EDI is the mandatory format for HIPAA-covered electronic claim transactions (45 CFR §162). An 837P file contains one or more claims with diagnosis codes (from HC-014), procedure line items (from HC-015), provider NPI, patient demographics, and policy information. The clearinghouse validates the file and forwards it to the payer. The payer responds with an 835 remittance advice listing the allowed amounts and payment details. Without EDI, the system cannot exchange claims with real insurers or providers — all transactions must be entered manually.

Phase 3 scope: generate valid 837P output and parse incoming 835 files. Actual clearinghouse connectivity (SFTP/AS2 transport) is out of scope and would be a Phase 4 infrastructure item.

## Acceptance Criteria

**837P Export**
- [ ] Finance/Admin can select a batch of `APPROVED` claims and trigger "Export 837P"
- [ ] System generates a valid X12 5010 837P file: ISA/GS envelope, ST/SE transaction sets, one `CLM` segment per claim, `DX` (diagnosis), `SV1` (service line) segments per `ClaimLine`
- [ ] Each 837P file is stored as a `Document` (type `EDI_837`) linked to the exported claims
- [ ] Claims included in an 837P export gain an `ediStatus` field: `NOT_SUBMITTED | SUBMITTED | ACCEPTED | REJECTED_BY_PAYER`
- [ ] Exported file passes X12 5010 structural validation (loop structure, required segments, element lengths)

**835 Import**
- [ ] Admin can upload an 835 remittance file via a new endpoint
- [ ] System parses `CLP` (claim payment) and `SVC` (service adjustment) segments to extract: claim identifier, paid amount, adjustment reason codes (CARC), remark codes (RARC)
- [ ] Parsed results are matched to existing `Claim` records by claim number; matched claims are auto-posted with `allowedAmount` and payment details
- [ ] Unmatched 835 records are flagged in an "835 Exceptions" admin view for manual resolution
- [ ] Adjustment reason codes are stored on `ClaimLine.denialReason` for denied/adjusted lines

**General**
- [ ] `tsc --noEmit` passes on both packages
- [ ] 837P generation and 835 parsing are unit-tested with fixture files (no clearinghouse connection needed)

## Technical Notes

- Use `node-x12` or a hand-rolled segment builder — the X12 format is simple enough to generate without a heavy library; importing `node-x12` is acceptable
- ISA segment requires sender/receiver IDs — add `EDI_SENDER_ID`, `EDI_RECEIVER_ID` to `config.ts` / `.env.example`
- 837P `CLM01` (claim submitter's identifier) must match the `Claim.claimNumber` so 835 responses can be correlated
- Segment terminator `~`, element separator `*`, component separator `:` are X12 5010 defaults — make them configurable for edge cases
- Store generated 837P files as base64 in the `Document` table (same pattern as uploaded documents); do not write to filesystem
- 835 parsing is the harder problem — budget more time; the adjustment reason code (CARC) list has ~250 codes, store as lookup table or enum
