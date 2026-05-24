import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// Mirrors the approveClaimSchema in claims.ts
const approveClaimSchema = z.object({
  notes: z.string().optional(),
  adjustedAmount: z.number().positive('Adjusted amount must be positive').optional(),
})

// Mirrors the business-rule guard in the approve route
function validateAdjustedAmount(adjustedAmount: number | undefined, reimbursable: number | null): string | null {
  if (adjustedAmount === undefined) return null
  if (reimbursable !== null && adjustedAmount > reimbursable) {
    return 'Adjusted amount cannot exceed the calculated reimbursable amount'
  }
  return null
}

describe('approveClaimSchema', () => {
  it('accepts a valid positive adjustedAmount', () => {
    const result = approveClaimSchema.safeParse({ adjustedAmount: 100 })
    expect(result.success).toBe(true)
  })

  it('accepts when adjustedAmount is omitted', () => {
    const result = approveClaimSchema.safeParse({ notes: 'ok' })
    expect(result.success).toBe(true)
  })

  it('rejects a zero adjustedAmount', () => {
    const result = approveClaimSchema.safeParse({ adjustedAmount: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects a negative adjustedAmount', () => {
    const result = approveClaimSchema.safeParse({ adjustedAmount: -50 })
    expect(result.success).toBe(false)
  })
})

describe('validateAdjustedAmount', () => {
  it('returns null when adjustedAmount is undefined (no override)', () => {
    expect(validateAdjustedAmount(undefined, 500)).toBeNull()
  })

  it('returns null when adjustedAmount equals reimbursable', () => {
    expect(validateAdjustedAmount(500, 500)).toBeNull()
  })

  it('returns null when adjustedAmount is less than reimbursable', () => {
    expect(validateAdjustedAmount(300, 500)).toBeNull()
  })

  it('returns error when adjustedAmount exceeds reimbursable', () => {
    const error = validateAdjustedAmount(600, 500)
    expect(error).not.toBeNull()
    expect(error).toContain('cannot exceed')
  })

  it('returns null when reimbursable is null (no cap applies)', () => {
    expect(validateAdjustedAmount(999, null)).toBeNull()
  })
})
