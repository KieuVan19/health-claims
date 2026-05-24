[← Phase 3 Summary](Phase-3-summary.md)

# HC-016 — Pre-Authorization Workflow

| Field | Value |
|---|---|
| **Type** | Story |
| **Priority** | Medium |
| **Phase** | 3 — Advanced / Enterprise |
| **Labels** | workflow, schema, rbac |
| **Depends on** | HC-015 (CPT Codes + Line-Item Claims) |

---

## Summary

Implement a pre-authorization (prior auth) workflow for procedures that require insurer approval before the service is rendered. A `PreAuth` entity with its own lifecycle tracks the request, adjudicator decision, and outcome — separate from claims.

## Background

Insurers require pre-authorization for high-cost or discretionary procedures: elective surgery, MRI/CT scans, specialty referrals. The patient or provider submits a pre-auth request before the procedure; if denied, the claim will be denied automatically. Currently there is no concept of pre-authorization — a patient could submit a claim for an MRI with no prior approval and the adjudicator has no automated way to flag it.

Pre-auth is not the same as a claim: it precedes service delivery, has no `totalAmount`, and is decided faster (typically 72 hours). Approved pre-auths generate an authorization number that must be referenced on the resulting claim line.

## Acceptance Criteria

- [ ] New `PreAuth` entity: `id`, `patientId`, `policyId`, `providerId` (nullable), `cptCode` (references CPT from HC-015), `diagnosisCodes` (array), `requestedDate`, `serviceDate` (proposed), `status` (`PENDING | APPROVED | DENIED | EXPIRED`), `authorizationNumber` (nullable, generated on approval), `expiresAt` (nullable), `adjudicatorId` (nullable), `adjudicatorNote` (nullable), `createdAt`, `updatedAt`
- [ ] Patient role can submit a pre-auth request; adjuster role can approve or deny it
- [ ] On approval, system generates a unique `authorizationNumber` (format: `AUTH-YYYYMMDD-XXXXX`) and sets `expiresAt` to 90 days from approval
- [ ] `ClaimLine` gains an optional `preAuthId` foreign key; adjudicator view warns if a CPT code requiring pre-auth has no linked `preAuthId`
- [ ] Pre-auth list page for adjusters, filterable by status and patient
- [ ] Patient pre-auth history page showing status and auth number for approved requests
- [ ] `ClaimEvent`-equivalent audit trail via a `PreAuthEvent` table (status transitions)
- [ ] `tsc --noEmit` passes on both packages

## Technical Notes

- Authorization number generation lives in `backend/src/utils/authNumber.ts` (new file, mirrors `claimNumber.ts` pattern)
- The list of CPT codes that require pre-auth is configuration, not hardcoded — store as a JSON config file or admin-managed table; Phase 3 can ship with a hardcoded list
- `EXPIRED` status is set by a scheduled job or lazily on read if `expiresAt < now()` and status is still `APPROVED`; lazy is fine for Phase 3
- RBAC: pre-auth submission is `PATIENT` or `ADMIN`; adjudication is `ADJUSTER` or `ADMIN`
