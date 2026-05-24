← [Phase 2 Summary](Phase-2-summary.md)

# HC-008 — SLA / TAT Tracking

| Field | Value |
|---|---|
| **Type** | Story |
| **Priority** | High |
| **Phase** | 2 — Operational Realism |
| **Labels** | compliance, adjudication, reporting, operations |
| **Depends on** | — |

---

## Summary

Track time-in-queue for each claim against state-mandated turnaround time (TAT) thresholds. Surface aging indicators in the adjuster queue and produce a compliance report so operations can identify claims approaching or breaching SLA deadlines.

## Background

Most US states require:
- Acknowledgement of receipt within **10 days** of submission
- Adjudication decision within **30–45 days** (varies by state)

The current adjuster queue shows no age, no urgency indicator, and no compliance report. Adjusters have no visibility into which claims are at risk of breaching deadlines, and management has no way to audit compliance.

## Acceptance Criteria

- [ ] Each claim in `SUBMITTED` or `UNDER_REVIEW` status displays an age counter ("Day 28") in the adjuster queue, calculated from `submittedAt`
- [ ] Claims within 3 days of the 30-day threshold are marked **"At Risk"** (amber)
- [ ] Claims past the 30-day threshold are marked **"Breached"** (red)
- [ ] Acknowledgement SLA (10 days from submission to first `UNDER_REVIEW` event) is tracked separately and shown in the claim detail
- [ ] Admin/Finance role can access a **TAT Compliance Report** listing: claim number, submitted date, current age, SLA status (On Track / At Risk / Breached)
- [ ] Report is filterable by adjuster, date range, and SLA status
- [ ] Unit tests cover: on-track calculation, at-risk boundary (day 27 vs day 28), breached state

## Technical Notes

- Age is a derived value — compute from `createdAt`/`submittedAt` at query time; do not store it as a DB field (it would go stale)
- SLA thresholds (10 days, 30 days, 3-day warning window) should live in `backend/src/config.ts` as configurable constants, not hardcoded in service logic
- The compliance report endpoint should be under `/api/admin/reports/tat` and guarded by `ADMIN` or `FINANCE_OFFICER` role
- Consider a lightweight scheduled job (or on-demand calculation) to pre-flag breached claims rather than computing on every queue load
