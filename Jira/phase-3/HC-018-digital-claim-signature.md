[← Phase 3 Summary](Phase-3-summary.md)

# HC-018 — Digital Claim Signature

| Field | Value |
|---|---|
| **Type** | Story |
| **Priority** | Low |
| **Phase** | 3 — Advanced / Enterprise |
| **Labels** | compliance, audit, frontend |
| **Depends on** | — |

---

## Summary

Require patients to provide an explicit digital attestation when submitting a claim, and store a tamper-evident record of that consent. Currently there is no signature capture and no audit of whether the patient agreed to the accuracy statement.

## Background

CMS-1500 and most state regulations require the patient (or authorized representative) to sign a statement that the claim information is accurate and that they authorize release of medical information to the payer. Without this, the insurer has weaker grounds for recoupment if fraud is later discovered, and the submission technically does not meet form requirements. The signature does not need to be a drawn signature — a timestamped checkbox attestation with the patient's IP and user-agent, hashed and stored, is legally sufficient for a web submission.

## Acceptance Criteria

- [ ] Claim submission flow adds a final "Review & Sign" step before the submit button is enabled
- [ ] Step displays a non-editable attestation statement: *"I certify that the information provided in this claim is accurate and complete to the best of my knowledge. I authorize the release of any medical information necessary to process this claim."*
- [ ] Patient must check a checkbox labelled "I agree to the above statement" — submit button is disabled until checked
- [ ] On submission, backend records a `ClaimSignature`: `claimId`, `userId`, `signedAt` (server timestamp), `ipAddress`, `userAgent`, `statementHash` (SHA-256 of the attestation text)
- [ ] `statementHash` allows future audit to confirm the patient agreed to exactly this wording, not a modified version
- [ ] `ClaimSignature` is readable by Admin and Adjuster roles; not editable by anyone after creation
- [ ] Claim detail view (adjudicator + admin) shows "Signed by [name] on [date] from [IP]"
- [ ] Attempting to submit a claim via the API without signature data returns 400 with `"Claim attestation required"`
- [ ] `tsc --noEmit` passes on both packages

## Technical Notes

- `ClaimSignature` is a separate table, not a field on `Claim` — immutability is easier to enforce on a dedicated entity
- `statementHash` is computed server-side from the canonical attestation string stored in a constant (`ATTESTATION_TEXT` in `config.ts`) — do not trust a hash sent from the client
- IP is taken from `req.ip` (trust proxy must be set correctly in Express if behind a load balancer)
- This is not a drawn/biometric signature — no canvas or external e-signature service required for Phase 3
