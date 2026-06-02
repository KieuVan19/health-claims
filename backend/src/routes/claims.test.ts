import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// Mirrors the approveClaimSchema in claims.ts
const approveClaimSchema = z.object({
  notes: z.string().optional(),
  adjustedAmount: z.number().positive('Adjusted amount must be positive').optional(),
})

// ─── Mirrors for consolidation schemas ───────────────────────────────────────

const withdrawSchema = z.object({ reason: z.string().optional() })
const assignSchema = z.object({ adjusterId: z.string().min(1) })
const rejectClaimSchema = z.object({ notes: z.string().min(1) })
const requestInfoSchema = z.object({ message: z.string().min(1) })
const respondInfoSchema = z.object({ response: z.string().optional(), infoRequestId: z.string().min(1) })
const overrideFilingDeadlineSchema = z.object({ reason: z.string().min(1) })
const initiateAppealSchema = z.object({ reason: z.string().min(1) })
const resolveAppealSchema = z.object({ resolution: z.enum(['APPEAL_APPROVED', 'APPEAL_DENIED']), notes: z.string().optional() })
const externalPrimarySchema = z.object({ primaryInsurerName: z.string().min(1), primaryPaidAmount: z.number().nonnegative(), primaryEOBDate: z.string().transform((v) => new Date(v)) })
const initiateSecondarySchema = z.object({ secondaryPolicyId: z.string().min(1), notes: z.string().optional() })
const reassignSchema = z.object({ adjusterId: z.string().min(1) })
const adjudicateLineSchema = z.object({ adjudicationStatus: z.enum(['APPROVED', 'DENIED', 'REDUCED', 'PENDING']), allowedAmount: z.number().positive().optional(), denialReason: z.string().optional(), adjudicatorNote: z.string().optional() })

const claimActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('SUBMIT'), payload: z.object({}).strict() }),
  z.object({ action: z.literal('WITHDRAW'), payload: withdrawSchema }),
  z.object({ action: z.literal('ASSIGN'), payload: assignSchema }),
  z.object({ action: z.literal('APPROVE'), payload: approveClaimSchema }),
  z.object({ action: z.literal('REJECT'), payload: rejectClaimSchema }),
  z.object({ action: z.literal('REQUEST_INFO'), payload: requestInfoSchema }),
  z.object({ action: z.literal('RESPOND_INFO'), payload: respondInfoSchema }),
  z.object({ action: z.literal('RESUBMIT'), payload: z.object({}).strict() }),
  z.object({ action: z.literal('OVERRIDE_FILING_DEADLINE'), payload: overrideFilingDeadlineSchema }),
  z.object({ action: z.literal('APPEAL'), payload: initiateAppealSchema }),
  z.object({ action: z.literal('ASSIGN_APPEAL'), payload: assignSchema }),
  z.object({ action: z.literal('RESOLVE_APPEAL'), payload: resolveAppealSchema }),
  z.object({ action: z.literal('EXTERNAL_PRIMARY'), payload: externalPrimarySchema }),
  z.object({ action: z.literal('INITIATE_SECONDARY'), payload: initiateSecondarySchema }),
  z.object({ action: z.literal('REASSIGN'), payload: reassignSchema }),
  z.object({ action: z.literal('ADJUDICATE_LINE'), payload: adjudicateLineSchema.extend({ lineId: z.string().min(1) }) }),
])

function deriveClaimStatusFromLines(lines: { adjudicationStatus: string }[]): string {
  if (lines.length === 0) return 'UNDER_REVIEW'
  const statuses = lines.map((l) => l.adjudicationStatus)
  if (statuses.some((s) => s === 'PENDING')) return 'UNDER_REVIEW'
  if (statuses.every((s) => s === 'APPROVED')) return 'APPROVED'
  if (statuses.every((s) => s === 'DENIED')) return 'REJECTED'
  return 'PARTIALLY_APPROVED'
}

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

describe('claimActionSchema — discriminated union', () => {
  it('accepts SUBMIT with empty payload', () => {
    expect(claimActionSchema.safeParse({ action: 'SUBMIT', payload: {} }).success).toBe(true)
  })

  it('rejects SUBMIT with unknown payload keys', () => {
    expect(claimActionSchema.safeParse({ action: 'SUBMIT', payload: { extra: 1 } }).success).toBe(false)
  })

  it('accepts WITHDRAW with optional reason', () => {
    expect(claimActionSchema.safeParse({ action: 'WITHDRAW', payload: {} }).success).toBe(true)
    expect(claimActionSchema.safeParse({ action: 'WITHDRAW', payload: { reason: 'no longer needed' } }).success).toBe(true)
  })

  it('accepts APPROVE with optional notes and eligibleAmount', () => {
    expect(claimActionSchema.safeParse({ action: 'APPROVE', payload: {} }).success).toBe(true)
    expect(claimActionSchema.safeParse({ action: 'APPROVE', payload: { notes: 'ok', eligibleAmount: 500 } }).success).toBe(true)
  })

  it('rejects REJECT without notes', () => {
    expect(claimActionSchema.safeParse({ action: 'REJECT', payload: {} }).success).toBe(false)
  })

  it('accepts REJECT with required notes', () => {
    expect(claimActionSchema.safeParse({ action: 'REJECT', payload: { notes: 'fraud' } }).success).toBe(true)
  })

  it('accepts ASSIGN with adjusterId', () => {
    expect(claimActionSchema.safeParse({ action: 'ASSIGN', payload: { adjusterId: 'adj-123' } }).success).toBe(true)
  })

  it('rejects ASSIGN without adjusterId', () => {
    expect(claimActionSchema.safeParse({ action: 'ASSIGN', payload: {} }).success).toBe(false)
  })

  it('accepts RESOLVE_APPEAL with valid resolution', () => {
    expect(claimActionSchema.safeParse({ action: 'RESOLVE_APPEAL', payload: { resolution: 'APPEAL_APPROVED' } }).success).toBe(true)
    expect(claimActionSchema.safeParse({ action: 'RESOLVE_APPEAL', payload: { resolution: 'APPEAL_DENIED' } }).success).toBe(true)
  })

  it('rejects RESOLVE_APPEAL with invalid resolution', () => {
    expect(claimActionSchema.safeParse({ action: 'RESOLVE_APPEAL', payload: { resolution: 'APPROVED' } }).success).toBe(false)
  })

  it('accepts ADJUDICATE_LINE with required lineId', () => {
    expect(claimActionSchema.safeParse({ action: 'ADJUDICATE_LINE', payload: { lineId: 'line-1', adjudicationStatus: 'APPROVED' } }).success).toBe(true)
  })

  it('rejects ADJUDICATE_LINE without lineId', () => {
    expect(claimActionSchema.safeParse({ action: 'ADJUDICATE_LINE', payload: { adjudicationStatus: 'APPROVED' } }).success).toBe(false)
  })

  it('rejects unknown action type', () => {
    expect(claimActionSchema.safeParse({ action: 'UNKNOWN_ACTION', payload: {} }).success).toBe(false)
  })
})

describe('deriveClaimStatusFromLines', () => {
  it('returns UNDER_REVIEW for empty lines', () => {
    expect(deriveClaimStatusFromLines([])).toBe('UNDER_REVIEW')
  })

  it('returns UNDER_REVIEW when any line is PENDING', () => {
    expect(deriveClaimStatusFromLines([{ adjudicationStatus: 'APPROVED' }, { adjudicationStatus: 'PENDING' }])).toBe('UNDER_REVIEW')
  })

  it('returns APPROVED when all lines are APPROVED', () => {
    expect(deriveClaimStatusFromLines([{ adjudicationStatus: 'APPROVED' }, { adjudicationStatus: 'APPROVED' }])).toBe('APPROVED')
  })

  it('returns REJECTED when all lines are DENIED', () => {
    expect(deriveClaimStatusFromLines([{ adjudicationStatus: 'DENIED' }, { adjudicationStatus: 'DENIED' }])).toBe('REJECTED')
  })

  it('returns PARTIALLY_APPROVED for mixed APPROVED/DENIED', () => {
    expect(deriveClaimStatusFromLines([{ adjudicationStatus: 'APPROVED' }, { adjudicationStatus: 'DENIED' }])).toBe('PARTIALLY_APPROVED')
  })
})
