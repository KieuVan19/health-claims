import { describe, it, expect } from 'vitest'
import { calculateEligible, scoreFraud } from './claims'

describe('calculateEligible', () => {
  const basicPolicy = { coverageAmount: 10000, deductible: 500, copayPercentage: 30 }
  const standardPolicy = { coverageAmount: 50000, deductible: 250, copayPercentage: 20 }
  const premiumPolicy = { coverageAmount: 100000, deductible: 100, copayPercentage: 10 }

  it('applies deductible and copay for BASIC policy', () => {
    const result = calculateEligible(2000, basicPolicy)
    // eligible = min(2000, 10000) = 2000
    // afterDeductible = 2000 - 500 = 1500
    // reimbursable = 1500 * 0.70 = 1050
    expect(result.eligibleAmount).toBe(2000)
    expect(result.deductible).toBe(500)
    expect(result.reimbursable).toBe(1050)
  })

  it('caps eligible amount at coverage limit', () => {
    const result = calculateEligible(15000, basicPolicy)
    // eligible = min(15000, 10000) = 10000
    // afterDeductible = 10000 - 500 = 9500
    // reimbursable = 9500 * 0.70 = 6650
    expect(result.eligibleAmount).toBe(10000)
    expect(result.deductible).toBe(500)
    expect(result.reimbursable).toBe(6650)
  })

  it('returns zero reimbursable when claim is below deductible', () => {
    const result = calculateEligible(300, basicPolicy)
    // eligible = 300, deductible applied = 300 (capped), afterDeductible = 0
    expect(result.reimbursable).toBe(0)
    expect(result.deductible).toBe(300)
  })

  it('applies STANDARD policy tiers correctly', () => {
    const result = calculateEligible(1000, standardPolicy)
    // eligible = 1000, afterDeductible = 750, reimbursable = 750 * 0.80 = 600
    expect(result.reimbursable).toBe(600)
  })

  it('applies PREMIUM policy tiers correctly', () => {
    const result = calculateEligible(1000, premiumPolicy)
    // eligible = 1000, afterDeductible = 900, reimbursable = 900 * 0.90 = 810
    expect(result.reimbursable).toBe(810)
  })

  it('handles zero amount', () => {
    const result = calculateEligible(0, basicPolicy)
    expect(result.eligibleAmount).toBe(0)
    expect(result.deductible).toBe(0)
    expect(result.reimbursable).toBe(0)
  })
})

describe('calculateEligible — OOP maximum', () => {
  const standard = { coverageAmount: 100_000, deductible: 250, copayPercentage: 20, oopMax: 6_000 }

  it('normal path: patient has not hit OOP max', () => {
    // deductible already fully paid, $500 OOP paid so far
    const result = calculateEligible(1_000, standard, 250, 500)
    // remainingOop = 5500; totalCostSharing = 0 + 200 = 200 → no cap
    expect(result.eligibleAmount).toBe(1_000)
    expect(result.deductible).toBe(0)
    expect(result.reimbursable).toBe(800)
  })

  it('partial hit: copay would exceed remaining OOP headroom', () => {
    // $5,900 OOP paid; $100 remaining. Deductible fully paid.
    // rawCopay = $200; capped to $100
    const result = calculateEligible(1_000, standard, 250, 5_900)
    expect(result.eligibleAmount).toBe(1_000)
    expect(result.deductible).toBe(0)
    expect(result.reimbursable).toBe(900)
  })

  it('partial hit: deductible itself fills remaining OOP headroom', () => {
    // $5,950 OOP paid; $50 remaining. Deductible not yet paid.
    // deductibleApplied = 250 but capped to 50; no copay headroom left
    const result = calculateEligible(1_000, standard, 0, 5_950)
    expect(result.eligibleAmount).toBe(1_000)
    expect(result.deductible).toBe(50)
    expect(result.reimbursable).toBe(950)
  })

  it('OOP max already met: insurer covers 100%', () => {
    const result = calculateEligible(2_000, standard, 250, 6_000)
    expect(result.eligibleAmount).toBe(2_000)
    expect(result.deductible).toBe(0)
    expect(result.reimbursable).toBe(2_000)
  })
})

describe('scoreFraud', () => {
  it('returns zero score and empty flags for a normal claim', () => {
    const result = scoreFraud(500, 'HOSPITALIZATION', 1000, 50000, 1, 1)
    expect(result.score).toBe(0)
    expect(result.flags).toHaveLength(0)
  })

  it('flags HIGH_AMOUNT_NEAR_COVERAGE_LIMIT when amount > 80% of coverage', () => {
    // 9000 > 10000 * 0.8 = 8000
    const result = scoreFraud(9000, 'HOSPITALIZATION', 0, 10000, 1, 1)
    expect(result.flags).toContain('HIGH_AMOUNT_NEAR_COVERAGE_LIMIT')
    expect(result.score).toBeGreaterThanOrEqual(30)
  })

  it('flags EXCESSIVE_RECENT_CLAIMS when more than 3 claims in 30 days', () => {
    const result = scoreFraud(100, 'OUTPATIENT', 0, 50000, 4, 1)
    expect(result.flags).toContain('EXCESSIVE_RECENT_CLAIMS')
    expect(result.score).toBeGreaterThanOrEqual(25)
  })

  it('flags DUPLICATE_TYPE_SAME_MONTH when same type submitted more than once this month', () => {
    const result = scoreFraud(100, 'DENTAL', 0, 50000, 1, 2)
    expect(result.flags).toContain('DUPLICATE_TYPE_SAME_MONTH')
    expect(result.score).toBeGreaterThanOrEqual(20)
  })

  it('flags COVERAGE_NEARLY_EXHAUSTED when used > 90% of coverage', () => {
    // used 9500, coverage 10000 → 95%
    const result = scoreFraud(100, 'VISION', 9500, 10000, 1, 1)
    expect(result.flags).toContain('COVERAGE_NEARLY_EXHAUSTED')
    expect(result.score).toBeGreaterThanOrEqual(15)
  })

  it('flags HIGH_PHARMACY_AMOUNT when PHARMACY claim exceeds $2000', () => {
    const result = scoreFraud(2500, 'PHARMACY', 0, 50000, 1, 1)
    expect(result.flags).toContain('HIGH_PHARMACY_AMOUNT')
    expect(result.score).toBeGreaterThanOrEqual(10)
  })

  it('accumulates multiple flags and caps score at 100', () => {
    // totalAmount=9000 > 10000*0.8=8000 → HIGH_AMOUNT(+30)
    // recentClaimsCount=5 > 3 → EXCESSIVE_RECENT(+25)
    // sameTypeSameMonthCount=3 > 1 → DUPLICATE(+20)
    // usedCoverage=9500 > 10000*0.9=9000 → EXHAUSTED(+15)
    // PHARMACY and 9000 > 2000 → HIGH_PHARMACY(+10)   total=100
    const result = scoreFraud(9000, 'PHARMACY', 9500, 10000, 5, 3)
    expect(result.score).toBe(100)
    expect(result.flags).toHaveLength(5)
  })

  it('does not flag HIGH_PHARMACY_AMOUNT for non-pharmacy types', () => {
    const result = scoreFraud(3000, 'HOSPITALIZATION', 0, 50000, 1, 1)
    expect(result.flags).not.toContain('HIGH_PHARMACY_AMOUNT')
  })
})
