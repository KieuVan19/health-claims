# Manual Test Cases — Health Claims Portal

---

## TC-001: Full Claim Lifecycle — Draft to Paid (Patient 2, Standard Plan, Amount Over Deductible)

### Summary
Verify that a new outpatient claim for Emma Wilson (Standard Health Plan) flows correctly
through every status stage — DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → PAID —
and that the reimbursable amount is calculated correctly after applying deductible and copay.

---

### Preconditions

| Item | Value |
|------|-------|
| App running | `pnpm dev` from repo root; backend :3001, frontend :5173 |
| Database state | Fresh seed: run `pnpm db:migrate reset && pnpm db:push && pnpm db:seed` from `backend/` |
| Patient 2 accumulator | Deductible paid: $0 · OOP paid: $0 (no prior approved/paid claims this plan year) |
| Policy | Standard Health Plan — deductible $250, copay 20%, OOP max $6,000 |

> **Note:** This test must run on a clean seed before any other test case that submits
> claims for patient 2, otherwise the deductible accumulator will differ from the expected values below.

---

### Test Data

| Field | Value |
|-------|-------|
| Claim type | OUTPATIENT |
| Description | Cardiology follow-up and ECG — referred by GP |
| Incident date | 2026-05-23 |
| Total amount | $800.00 |

**Expected eligibility calculation:**

| Step | Calculation | Result |
|------|-------------|--------|
| Eligible amount | min($800, $100,000 coverage) | $800.00 |
| Deductible applied | min($800, $250 remaining) | $250.00 |
| After deductible | $800 − $250 | $550.00 |
| Copay (20%) | $550 × 0.20 | $110.00 |
| **Reimbursable** | $550 − $110 | **$440.00** |
| Patient cost-sharing | $250 + $110 | $360.00 |

---

### Roles & Credentials

| Role | Email | Password |
|------|-------|----------|
| Patient | patient2@healthclaims.com | Patient123! |
| Adjuster | adjuster1@healthclaims.com | Adjuster123! |
| Finance | finance@healthclaims.com | Finance123! |

---

### Test Steps

#### Phase 1 — Patient Creates a Draft Claim

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Log in as **patient2@healthclaims.com** | Lands on patient dashboard; no claim in progress |
| 2 | Click **New Claim** (or equivalent CTA) | Claim creation form opens |
| 3 | Select claim type: **Outpatient** | Form updates to show outpatient-relevant fields |
| 4 | Enter description: `Cardiology follow-up and ECG — referred by GP` | Text accepted |
| 5 | Set incident date to **2026-05-23** | Date field populated |
| 6 | Enter total amount: **800** | Amount field shows $800.00 |
| 7 | Click **Save as Draft** (do not submit yet) | Claim is created with status **DRAFT**; claim number assigned (e.g. `CLM-2026-XXXXXX`); patient is redirected to claim detail page |
| 8 | Verify the claim detail page shows status badge **DRAFT** | Status badge reads "Draft" |
| 9 | Verify the timeline shows one event: *"Created"* | Timeline entry exists with today's date |

---

#### Phase 2 — Patient Submits the Claim

| # | Step | Expected Result |
|---|------|-----------------|
| 10 | On the claim detail page, click **Submit Claim** | Confirmation prompt appears |
| 11 | Confirm submission | Status changes to **SUBMITTED**; page refreshes or badge updates |
| 12 | Verify the timeline now shows two events: *Created* → *Submitted* | Second timeline entry shows "Submitted" |
| 13 | Verify a success notification / toast is shown | Notification confirms submission |
| 14 | Log out as patient | Redirected to login page |

---

#### Phase 3 — Adjuster Assigns and Reviews

| # | Step | Expected Result |
|---|------|-----------------|
| 15 | Log in as **adjuster1@healthclaims.com** | Lands on adjuster dashboard; submitted claims queue visible |
| 16 | Locate the new claim (CLM-2026-XXXXXX, $800, OUTPATIENT, Emma Wilson) in the queue | Claim appears with status **SUBMITTED** |
| 17 | Open the claim and click **Assign to Me** (or equivalent) | Status changes to **UNDER_REVIEW**; adjuster is recorded as assigned |
| 18 | Verify the claim header shows status **UNDER_REVIEW** | Status badge reads "Under Review" |
| 19 | Verify the timeline shows: *Created → Submitted → Assigned* | Three events in timeline |
| 20 | Review the eligibility breakdown displayed on the page | Eligible: $800.00 · Deductible: $250.00 · Reimbursable: $440.00 |

---

#### Phase 4 — Adjuster Approves the Claim

| # | Step | Expected Result |
|---|------|-----------------|
| 21 | On the claim detail page, click **Approve** | Approval dialog / notes field appears |
| 22 | Enter adjuster notes: `Outpatient cardiology visit confirmed. Deductible and copay applied.` | Notes saved |
| 23 | Confirm approval | Status changes to **APPROVED** |
| 24 | Verify the status badge reads **Approved** | Badge updated |
| 25 | Verify the timeline shows: *Created → Submitted → Assigned → Approved* | Four events in timeline |
| 26 | Verify a notification is sent to the patient | Notification bell (or patient inbox) shows "Claim Approved" for this claim number |
| 27 | Log out as adjuster | Redirected to login page |

---

#### Phase 5 — Finance Officer Processes Payout

| # | Step | Expected Result |
|---|------|-----------------|
| 28 | Log in as **finance@healthclaims.com** | Lands on finance dashboard; approved claims queue visible |
| 29 | Locate the claim (CLM-2026-XXXXXX, $800, APPROVED, Emma Wilson) in the payout queue | Claim appears; reimbursable amount shown as **$440.00** |
| 30 | Open the claim and click **Process Payment** (or equivalent) | Payment confirmation dialog opens; pre-filled amount shows $440.00 |
| 31 | Enter payment reference: `PAY-TEST-001` | Reference field populated |
| 32 | Confirm payment | Status changes to **PAID**; payout record created |
| 33 | Verify the status badge reads **Paid** | Badge updated |
| 34 | Verify the payout amount recorded is **$440.00** | Payout row shows correct amount and reference |
| 35 | Verify the timeline shows: *Created → Submitted → Assigned → Approved → Paid* | Five events in timeline, final entry "Paid" |
| 36 | Log out as finance officer | Redirected to login page |

---

#### Phase 6 — Patient Verifies Final State

| # | Step | Expected Result |
|---|------|-----------------|
| 37 | Log in as **patient2@healthclaims.com** | Patient dashboard loads |
| 38 | Navigate to the claim (CLM-2026-XXXXXX) | Claim detail page opens |
| 39 | Verify status badge reads **Paid** | Badge updated |
| 40 | Verify reimbursable amount shown is **$440.00** | Correct amount displayed |
| 41 | Verify the full timeline is visible: 5 events from Created to Paid | All lifecycle events present and in correct order |
| 42 | Verify a "Claim Paid" notification exists in the notification bell | Notification present with link back to claim |

---

### Pass Criteria

- [ ] Claim progresses through all 5 statuses without error
- [ ] Reimbursable amount is exactly **$440.00** (deductible $250 + copay $110 applied to $800 claim)
- [ ] Every status transition creates an immutable timeline event
- [ ] Payout record stores payment reference `PAY-TEST-001` and amount `$440.00`
- [ ] Patient receives notifications at Approved and Paid stages
- [ ] No 4xx/5xx errors in browser console throughout the flow
