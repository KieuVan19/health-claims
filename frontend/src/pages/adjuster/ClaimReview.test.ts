import { describe, it, expect } from 'vitest'

// Mirrors the guard used in ClaimReview.tsx to decide whether to show
// "Calculated Reimbursable (strikethrough) + Approved Amount (Adjusted)".
// Before the fix, `!== undefined` passed for null, showing $0.00 on unadjusted claims.
const shouldShowAdjusted = (adjustedAmount: number | null | undefined): boolean =>
  adjustedAmount != null

describe('adjustedAmount display guard', () => {
  it('returns false when adjustedAmount is null', () => {
    expect(shouldShowAdjusted(null)).toBe(false)
  })

  it('returns false when adjustedAmount is undefined', () => {
    expect(shouldShowAdjusted(undefined)).toBe(false)
  })

  it('returns true when adjustedAmount is a positive number', () => {
    expect(shouldShowAdjusted(750)).toBe(true)
  })

  it('returns true when adjustedAmount is zero (explicit adjuster override)', () => {
    expect(shouldShowAdjusted(0)).toBe(true)
  })
})
