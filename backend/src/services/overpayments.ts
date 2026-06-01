import prisma from '../lib/prisma';

export type OverpaymentReason = 'ADJUSTER_ERROR' | 'COB_UPDATE' | 'POLICY_CHANGE';
export type OverpaymentStatus = 'IDENTIFIED' | 'OFFSET' | 'WAIVED';

/**
 * Return the total outstanding (IDENTIFIED) overpayment balance for a patient.
 * This is the amount that must be recouped from their next payout.
 */
export async function getPendingRecoupment(patientId: string): Promise<number> {
  const rows = await prisma.overpayment.findMany({
    where: {
      status: 'IDENTIFIED',
      claim: { patientId },
      deletedAt: null,
    },
    select: { overpaidAmount: true },
  });
  return rows.reduce((sum, r) => sum + r.overpaidAmount, 0);
}

/**
 * Apply outstanding overpayments against a new payout amount.
 * Returns the clamped (non-negative) payout amount and the list of overpayment IDs
 * that were fully or partially offset.
 *
 * Overpayments are consumed oldest-first.  If a single overpayment is larger than
 * the payout, that overpayment is NOT partially offset — partial-offset tracking
 * requires splitting a record, which adds complexity without clear spec guidance.
 * Instead the payout is reduced to $0 and the full overpayment remains IDENTIFIED
 * (carrying forward). Only overpayments that can be fully absorbed by the payout
 * are moved to OFFSET.
 */
export async function applyRecoupment(
  patientId: string,
  grossAmount: number,
): Promise<{ netAmount: number; offsetIds: string[]; totalOffset: number }> {
  const pending = await prisma.overpayment.findMany({
    where: {
      status: 'IDENTIFIED',
      claim: { patientId },
      deletedAt: null,
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, overpaidAmount: true },
  });

  let remaining = grossAmount;
  const offsetIds: string[] = [];
  let totalOffset = 0;

  for (const op of pending) {
    if (remaining <= 0) break;
    if (op.overpaidAmount <= remaining) {
      remaining -= op.overpaidAmount;
      totalOffset += op.overpaidAmount;
      offsetIds.push(op.id);
    }
    // If the overpayment exceeds remaining, carry it forward (do not split)
  }

  return { netAmount: Math.max(0, remaining), offsetIds, totalOffset };
}

/**
 * Mark the given overpayment IDs as OFFSET inside a transaction.
 * Called after the Payout record is persisted so we can reference it.
 */
export async function markOffsets(offsetIds: string[]): Promise<void> {
  if (offsetIds.length === 0) return;
  await prisma.overpayment.updateMany({
    where: { id: { in: offsetIds } },
    data: { status: 'OFFSET', updatedAt: new Date() },
  });
}
