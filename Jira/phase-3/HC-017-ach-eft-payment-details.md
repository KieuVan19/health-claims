[← Phase 3 Summary](Phase-3-summary.md)

# HC-017 — ACH / EFT Payment Details

| Field | Value |
|---|---|
| **Type** | Story |
| **Priority** | Medium |
| **Phase** | 3 — Advanced / Enterprise |
| **Labels** | finance, schema, security |
| **Depends on** | — |

---

## Summary

Add bank account details to patient profiles and implement an EFT batch export so the finance team can trigger ACH transfers rather than recording manual payment references. Outputs a NACHA-compatible flat file for upload to a bank or payment processor.

## Background

The current `Payout` model stores a `paymentReference` string entered manually by a finance officer. Real health plan finance operations process hundreds of payments per run — they export a NACHA (ACH) file and upload it to their bank, which handles the actual transfers. The system needs: (1) a place to store bank account details on the patient profile, and (2) a finance endpoint that generates the NACHA batch file for a set of approved payouts.

NACHA files have a strict fixed-width format. The system does not need to submit directly to a bank in Phase 3 — generating the file for manual upload is the deliverable.

## Acceptance Criteria

- [ ] New `BankAccount` entity linked to `User`: `id`, `userId`, `accountHolderName`, `routingNumber` (9-digit, ABA-validated), `accountNumber` (encrypted at rest), `accountType` (`CHECKING | SAVINGS`), `isVerified` (default false), `isPrimary` (one per user), `createdAt`
- [ ] Patient profile page has a bank account section: add/remove accounts, mark primary
- [ ] `accountNumber` is stored encrypted (AES-256 via a `BANK_ENCRYPTION_KEY` env var); only last 4 digits are returned in API responses
- [ ] ABA routing number validation on input (checksum algorithm, not just format)
- [ ] Finance officer can select a set of `APPROVED` payouts and trigger "Export EFT Batch"
- [ ] Export generates a NACHA PPD file: file header, batch header, one detail record per payout, batch control, file control
- [ ] Batch export creates a `PayoutBatch` record linking the included `Payout` IDs and storing `batchStatus` (`EXPORTED | SUBMITTED | SETTLED`)
- [ ] Payouts included in a batch are moved to status `PROCESSING`; settled on manual `PayoutBatch` status update
- [ ] `tsc --noEmit` passes on both packages

## Technical Notes

- Use Node's built-in `crypto` module for AES-256-CBC encryption; key is 32 bytes from `BANK_ENCRYPTION_KEY` env var — fail hard at startup if missing
- ABA checksum: `3*(d1+d4+d7) + 7*(d2+d5+d8) + (d3+d6+d9)` must be divisible by 10
- NACHA detail record (entry detail) is a fixed 94-character line; use a builder utility at `backend/src/utils/nacha.ts`
- HC-019 (EDI 835) will reuse `PayoutBatch` to represent remittance advice — design the schema with that in mind
- Never log or return full account numbers; enforce this in the Prisma select projections
