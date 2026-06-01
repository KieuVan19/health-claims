import prisma from '../lib/prisma';
import { CLAIM_STATUSES } from '../constants/enums';

interface PolicyForCalc {
  coverageAmount: number;
  deductible: number;
  copayPercentage: number;
  oopMax?: number;
  oonDeductible?: number;
  oonCopayPercent?: number;
}

export interface EligibilityResult {
  eligibleAmount: number;
  deductible: number;
  reimbursable: number;
}

/**
 * Calculate eligible reimbursement for a claim.
 * Logic:
 *  1. The eligible amount = min(totalAmount, coverageAmount)
 *  2. Use the same deductible for both in-network and out-of-network
 *  3. Out-of-network has 2x the copay percentage of in-network
 *  4. Apply remaining deductible (deductible minus what's already been paid this plan year
 *     for the same network tier)
 *  5. If the patient has already reached the OOP maximum, skip deductible and copay entirely
 *  6. Otherwise apply copay: reimbursable = afterDeductible * (1 - copayPercentage / 100)
 *     If the copay would push the patient past the OOP max, cap it so total cost-sharing = oopMax
 */
export function calculateEligible(
  totalAmount: number,
  policy: PolicyForCalc,
  deductiblePaid: number = 0,
  oopPaid: number = 0,
  networkStatus: 'IN' | 'OUT' = 'IN',
  eligibleAmountOverride?: number,
): EligibilityResult {
  const scheduleDeductible = policy.deductible;
  const scheduleCopay = networkStatus === 'OUT'
    ? policy.oonCopayPercent ?? policy.copayPercentage
    : policy.copayPercentage;

  // Replace the local variable names so the rest of the function uses the schedule values
  const effectiveDeductible = scheduleDeductible;
  const effectiveCopay = scheduleCopay;
  const eligibleAmount = eligibleAmountOverride ?? Math.min(totalAmount, policy.coverageAmount);
  const oopMax = policy.oopMax ?? Infinity;

  const remainingOop = Math.max(0, oopMax - oopPaid);

  // If OOP maximum is already met, insurer covers 100%
  if (remainingOop === 0) {
    return {
      eligibleAmount: parseFloat(eligibleAmount.toFixed(2)),
      deductible: 0,
      reimbursable: parseFloat(eligibleAmount.toFixed(2)),
    };
  }

  const remainingDeductible = Math.max(0, effectiveDeductible - deductiblePaid);
  const deductibleApplied = Math.min(eligibleAmount, remainingDeductible);
  const afterDeductible = Math.max(0, eligibleAmount - deductibleApplied);
  const copayFraction = effectiveCopay / 100;
  const rawCopay = parseFloat((afterDeductible * copayFraction).toFixed(2));

  // Total cost-sharing this claim would be = deductibleApplied + copay
  const totalCostSharing = deductibleApplied + rawCopay;

  let actualDeductible: number;
  let actualCopay: number;

  if (totalCostSharing <= remainingOop) {
    // Normal path — patient pays full deductible + copay
    actualDeductible = deductibleApplied;
    actualCopay = rawCopay;
  } else {
    // This claim partially hits the OOP ceiling.
    // Patient only pays up to remainingOop total cost-sharing.
    // Deductible is applied first (in full if possible), then copay takes the rest.
    actualDeductible = Math.min(deductibleApplied, remainingOop);
    const remainingOopAfterDeductible = remainingOop - actualDeductible;
    actualCopay = Math.min(rawCopay, remainingOopAfterDeductible);
  }

  const reimbursable = parseFloat((eligibleAmount - actualDeductible - actualCopay).toFixed(2));

  return {
    eligibleAmount: parseFloat(eligibleAmount.toFixed(2)),
    deductible: parseFloat(actualDeductible.toFixed(2)),
    reimbursable,
  };
}

/**
 * Sum the deductible already applied to APPROVED/PAID claims for this patient, policy, and plan year.
 * Deductible is shared across in-network and out-of-network claims — once met, no additional deductible applies.
 * Optionally excludes a specific claim (used when recalculating an existing claim's own eligibility).
 */
export async function getDeductiblePaid(
  patientId: string,
  policyId: string,
  planYearStart: Date,
  excludeClaimId?: string,
  networkStatus?: 'IN' | 'OUT',
): Promise<number> {
  const result = await prisma.claim.aggregate({
    _sum: { deductible: true },
    where: {
      patientId,
      policyId,
      status: { in: [CLAIM_STATUSES.SUBMITTED, CLAIM_STATUSES.UNDER_REVIEW, CLAIM_STATUSES.INFO_REQUESTED, CLAIM_STATUSES.APPROVED, CLAIM_STATUSES.PARTIALLY_APPROVED, CLAIM_STATUSES.PAID] },
      planYearStart: { gte: planYearStart },
      ...(excludeClaimId ? { NOT: { id: excludeClaimId } } : {}),
    },
  });
  return result._sum.deductible ?? 0;
}

/**
 * Sum total cost-sharing (deductible applied + copay applied) across APPROVED/PAID claims
 * for this patient, policy, and plan year. This is the OOP accumulator.
 * OOP maximum is shared across in-network and out-of-network claims — once met, full coverage applies.
 * Copay paid = eligibleAmount - deductible - reimbursable (all stored on the claim).
 * Optionally excludes a specific claim (for recalculation scenarios).
 */
export async function getOopPaid(
  patientId: string,
  policyId: string,
  planYearStart: Date,
  excludeClaimId?: string,
  networkStatus?: 'IN' | 'OUT',
): Promise<number> {
  const claims = await prisma.claim.findMany({
    where: {
      patientId,
      policyId,
      status: { in: [CLAIM_STATUSES.SUBMITTED, CLAIM_STATUSES.UNDER_REVIEW, CLAIM_STATUSES.INFO_REQUESTED, CLAIM_STATUSES.APPROVED, CLAIM_STATUSES.PARTIALLY_APPROVED, CLAIM_STATUSES.PAID] },
      planYearStart: { gte: planYearStart },
      deletedAt: null,
      ...(excludeClaimId ? { NOT: { id: excludeClaimId } } : {}),
    },
    select: { eligibleAmount: true, deductible: true, reimbursable: true },
  });

  return claims.reduce((sum, c) => {
    const eligible = c.eligibleAmount ?? 0;
    const ded = c.deductible ?? 0;
    const reimb = c.reimbursable ?? 0;
    // cost-sharing = deductible + copay; copay = eligible - deductible - reimbursable
    const costSharing = eligible - reimb;
    return sum + costSharing;
  }, 0);
}

export interface FilingDeadlineResult {
  /** true = claim may proceed; false = deadline exceeded */
  withinDeadline: boolean;
  /** true = within 30 days of the deadline (show warning, but still allowed) */
  nearDeadline: boolean;
  deadlineDays: number;
  daysSinceIncident: number;
  deadlineDate: Date;
}

/**
 * Validate that the incident date falls within the policy's filing window.
 * The window is measured from the submission date (i.e. now).
 */
export function checkFilingDeadline(
  incidentDate: Date,
  submissionDate: Date,
  filingDeadlineDays: number,
): FilingDeadlineResult {
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysSinceIncident = Math.floor(
    (submissionDate.getTime() - incidentDate.getTime()) / msPerDay,
  );
  const withinDeadline = daysSinceIncident <= filingDeadlineDays;
  const nearDeadline = withinDeadline && (filingDeadlineDays - daysSinceIncident) <= 30;
  const deadlineDate = new Date(incidentDate.getTime() + filingDeadlineDays * msPerDay);

  return { withinDeadline, nearDeadline, deadlineDays: filingDeadlineDays, daysSinceIncident, deadlineDate };
}

export interface FraudResult {
  score: number;
  flags: string[];
}

/**
 * Rule-based fraud scoring.
 * Returns a score 0-100 and a list of flag strings.
 * Score >= 70 is considered high risk.
 */
export function scoreFraud(
  totalAmount: number,
  policyType: string,
  usedCoverage: number,
  coverageAmount: number,
  recentClaimsCount: number,
  sameTypeSameMonthCount: number,
): FraudResult {
  const flags: string[] = [];
  let score = 0;

  // Flag 1: Amount > 80% of coverage limit
  if (totalAmount > coverageAmount * 0.8) {
    flags.push('HIGH_AMOUNT_NEAR_COVERAGE_LIMIT');
    score += 30;
  }

  // Flag 2: More than 3 claims in last 30 days
  if (recentClaimsCount > 3) {
    flags.push('EXCESSIVE_RECENT_CLAIMS');
    score += 25;
  }

  // Flag 3: More than 1 claim of same type in same month
  if (sameTypeSameMonthCount > 1) {
    flags.push('DUPLICATE_TYPE_SAME_MONTH');
    score += 20;
  }

  // Flag 4: Used coverage is already > 90% and a new claim is submitted
  if (usedCoverage > coverageAmount * 0.9) {
    flags.push('COVERAGE_NEARLY_EXHAUSTED');
    score += 15;
  }

  // Flag 5: PHARMACY claim > $2000 (unusually high)
  if (policyType === 'PHARMACY' && totalAmount > 2000) {
    flags.push('HIGH_PHARMACY_AMOUNT');
    score += 10;
  }

  return { score: Math.min(100, score), flags };
}
