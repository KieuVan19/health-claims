# Bug Report: CLM-2026-000003 Not Visible in My Queue Dashboard

## 1. Bug Description
Claim CLM-2026-000003 did not appear in the adjuster's My Queue dashboard when the claim was in `INFO_RESPONDED` status. The adjuster could not see or act on the claim from the queue view.

## 2. Impact Area
- **Frontend**: `frontend/src/pages/adjuster/ClaimQueue.tsx` — status filter options
- **Backend**: `backend/src/routes/claims.ts` (GET `/api/claims`) — adjuster status filter logic (lines 163–177)
- **Affected role**: ADJUSTER only
- **Affected status**: `INFO_RESPONDED`

## 3. Dataset Used for the Bug
| Field | Value |
|---|---|
| Claim number | CLM-2026-000003 |
| Patient | David Brown (patient1@healthclaims.com) |
| Adjuster | Alice Johnson (adjuster1@healthclaims.com) |
| Status at time of bug | INFO_RESPONDED |
| Claim type | OUTPATIENT |
| Total amount | $188.00 |
| Policy tier | STANDARD |

Claim lifecycle at time of report:
`DRAFT → SUBMITTED → UNDER_REVIEW → INFO_REQUESTED → INFO_RESPONDED` ← bug occurred here

## 4. Root Cause
The `INFO_RESPONDED` status was not included in the adjuster queue's visible status set. The backend filter for ADJUSTER requests used a denylist (`notIn: ['DRAFT', 'PAID']`) which should have included `INFO_RESPONDED`, but the frontend `statusOptions` array in `ClaimQueue.tsx` was missing the `INFO_RESPONDED` entry. This meant adjusters had no way to filter for or see claims in that state, and the default view did not surface them correctly.

## 5. Solution
Added `INFO_RESPONDED` to the `statusOptions` array in `frontend/src/pages/adjuster/ClaimQueue.tsx`:

```typescript
{ value: 'INFO_RESPONDED', label: 'Info Added' },
```

This made claims in `INFO_RESPONDED` status visible in the queue under both the "All Statuses" default view and as an explicit filter option.

## 6. Steps to Reproduce
1. Seed the database: `pnpm db:seed` from `backend/`
2. Log in as adjuster: `adjuster1@healthclaims.com` / `Adjuster123!`
3. Navigate to **My Queue** (`/adjuster/claims`)
4. As a patient (`patient1@healthclaims.com`), submit a new claim
5. As adjuster, assign the claim and move it to `UNDER_REVIEW`
6. Request additional info — status transitions to `INFO_REQUESTED`
7. As patient, respond to the info request — status transitions to `INFO_RESPONDED`
8. Return to **My Queue** as adjuster and observe that the claim is missing from the list

## 7. Expected Result
The claim should remain visible in the adjuster's My Queue at every active status, including `INFO_RESPONDED`, so the adjuster can continue reviewing and take the next action (approve, reject, or request further info).
