import prisma from '../lib/prisma';
import { createAuditLog } from '../utils/audit';
import { OPEN_CLAIM_STATUSES, USER_ROLES, CLAIM_STATUSES } from '../constants/enums';

/**
 * Select the best adjuster for a claim using:
 *   1. Specialty match (provider.specialty === adjuster.specialty) preferred over workload alone.
 *   2. Among eligible candidates, pick the one with the fewest open claims (round-robin by count).
 *
 * Returns null when no active adjuster is available (all at capacity or no specialist exists);
 * callers must handle unassigned gracefully instead of blocking submission.
 */
export async function selectAdjuster(
  claimId: string,
  providerSpecialty: string | null | undefined,
): Promise<{ id: string; firstName: string; lastName: string } | null> {
  const adjusters = await prisma.user.findMany({
    where: { role: 'ADJUSTER', isActive: true },
    select: { id: true, firstName: true, lastName: true, specialty: true },
  });

  if (adjusters.length === 0) return null;

  const openCountByAdjuster = await Promise.all(
    adjusters.map(async (adj) => {
      const count = await prisma.claim.count({
        where: {
          assignedAdjusterId: adj.id,
          status: { in: OPEN_CLAIM_STATUSES as unknown as string[] },
          NOT: { id: claimId },
        },
      });
      return { ...adj, openClaims: count };
    }),
  );

  // Specialty candidates: adjuster.specialty matches provider.specialty (case-insensitive).
  // An adjuster with no specialty is "general" and eligible for any claim.
  const specialtyCandidates =
    providerSpecialty
      ? openCountByAdjuster.filter(
          (a) =>
            !a.specialty ||
            a.specialty.toLowerCase() === providerSpecialty.toLowerCase(),
        )
      : openCountByAdjuster;

  const pool = specialtyCandidates.length > 0 ? specialtyCandidates : openCountByAdjuster;

  // Pick the adjuster with the fewest open claims; ties broken by array order (stable).
  const best = pool.reduce((prev, curr) =>
    curr.openClaims < prev.openClaims ? curr : prev,
  );

  return { id: best.id, firstName: best.firstName, lastName: best.lastName };
}

/**
 * Auto-assign a newly submitted claim.
 * Sets assignedAdjusterId, creates a ASSIGNED ClaimEvent, and audit-logs.
 * If no adjuster is available, logs a warning and leaves the claim unassigned.
 */
export async function autoAssignClaim(
  claimId: string,
  claimNumber: string,
  systemUserId: string,
  providerSpecialty?: string | null,
): Promise<void> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: 'autoAssignEnabled' } });
  const enabled = setting ? setting.value === 'true' : true;
  if (!enabled) {
    console.info(`[Assignment] Auto-assign disabled — claim ${claimNumber} left unassigned`);
    return;
  }

  const adjuster = await selectAdjuster(claimId, providerSpecialty);

  if (!adjuster) {
    await createAuditLog({
      userId: null,
      action: 'AUTO_ASSIGN_NO_ADJUSTER',
      resource: 'Claim',
      resourceId: claimId,
      details: { claimNumber, reason: 'No active adjuster available for auto-assignment' },
    });
    console.warn(`[Assignment] No adjuster available for claim ${claimNumber} — left unassigned`);
    return;
  }

  await prisma.$transaction([
    prisma.claim.update({
      where: { id: claimId },
      data: { assignedAdjusterId: adjuster.id, status: CLAIM_STATUSES.UNDER_REVIEW },
    }),
    prisma.claimEvent.create({
      data: {
        claimId,
        userId: systemUserId,
        action: 'ASSIGNED',
        fromStatus: CLAIM_STATUSES.SUBMITTED,
        toStatus: CLAIM_STATUSES.UNDER_REVIEW,
        note: `Auto-assigned to ${adjuster.firstName} ${adjuster.lastName}`,
      },
    }),
  ]);

  await createAuditLog({
    userId: systemUserId,
    action: 'AUTO_ASSIGN_CLAIM',
    resource: 'Claim',
    resourceId: claimId,
    details: { claimNumber, assignedTo: adjuster.id, adjusterName: `${adjuster.firstName} ${adjuster.lastName}` },
  });
}
