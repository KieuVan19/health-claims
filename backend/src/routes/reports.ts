import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { config } from '../config';
import { getPaginationParams, createPaginatedResponse } from '../utils/pagination';
import { CLAIM_STATUSES } from '../constants/enums';

const router = Router();

router.use(authenticate, requireRole('ADMIN', 'FINANCE_OFFICER'));

// ─── Helpers ──────────────────────────────────────────────────────────────────

type SlaStatus = 'ON_TRACK' | 'AT_RISK' | 'BREACHED';

function computeSlaStatus(ageDays: number): SlaStatus {
  const { adjudicationDays, warningWindowDays } = config.sla;
  if (ageDays > adjudicationDays) return 'BREACHED';
  if (ageDays >= adjudicationDays - warningWindowDays) return 'AT_RISK';
  return 'ON_TRACK';
}

/**
 * @openapi
 * /admin/reports/tat:
 *   get:
 *     tags: [Admin]
 *     summary: TAT Compliance Report — claim age and SLA status for open claims
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: adjusterId
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: slaStatus
 *         schema:
 *           type: string
 *           enum: [ON_TRACK, AT_RISK, BREACHED]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: TAT compliance report data
 */
router.get(
  '/tat',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        adjusterId,
        startDate,
        endDate,
        slaStatus,
        page = '1',
        limit = '20',
      } = req.query as Record<string, string>;

      const { pageNum, limitNum } = getPaginationParams(page, limit);

      // Only claims that are still open (in-flight)
      const where: Record<string, unknown> = {
        status: { in: [CLAIM_STATUSES.SUBMITTED, CLAIM_STATUSES.UNDER_REVIEW, CLAIM_STATUSES.INFO_REQUESTED, CLAIM_STATUSES.INFO_RESPONDED] },
        deletedAt: null,
      };

      if (adjusterId) where['adjusterId'] = adjusterId;
      if (startDate) {
        where['createdAt'] = {
          ...(typeof where['createdAt'] === 'object' && where['createdAt'] !== null ? where['createdAt'] as object : {}),
          gte: new Date(startDate),
        };
      }
      if (endDate) {
        where['createdAt'] = {
          ...(typeof where['createdAt'] === 'object' && where['createdAt'] !== null ? where['createdAt'] as object : {}),
          lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
        };
      }

      const claims = await prisma.claim.findMany({
        where,
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, email: true } },
          adjuster: { select: { id: true, firstName: true, lastName: true, email: true } },
          events: {
            where: { toStatus: CLAIM_STATUSES.SUBMITTED },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      const now = Date.now();
      const { adjudicationDays } = config.sla;

      const rows = claims.map((claim) => {
        // Use the timestamp of the SUBMITTED event as the SLA start; fall back to createdAt
        const submittedEvent = claim.events[0];
        const submittedAt: Date = submittedEvent?.createdAt ?? claim.createdAt;
        const ageDays = Math.floor((now - submittedAt.getTime()) / (1000 * 60 * 60 * 24));
        const status = computeSlaStatus(ageDays);
        const daysUntilBreach = Math.max(0, adjudicationDays - ageDays);

        return {
          claimId: claim.id,
          claimNumber: claim.claimNumber,
          submittedAt: submittedAt.toISOString(),
          ageDays,
          slaStatus: status,
          daysUntilBreach,
          currentStatus: claim.status,
          patient: claim.patient,
          adjuster: claim.adjuster,
        };
      });

      // Filter by slaStatus after computing (cannot do in DB)
      const filtered = slaStatus ? rows.filter((r) => r.slaStatus === slaStatus) : rows;

      // Paginate
      const total = filtered.length;
      const paginated = filtered.slice((pageNum - 1) * limitNum, pageNum * limitNum);

      // Summary counts
      const summary = {
        onTrack: rows.filter((r) => r.slaStatus === 'ON_TRACK').length,
        atRisk: rows.filter((r) => r.slaStatus === 'AT_RISK').length,
        breached: rows.filter((r) => r.slaStatus === 'BREACHED').length,
        total: rows.length,
      };

      const paginated_response = createPaginatedResponse(paginated, total, pageNum, limitNum);
      res.json({
        ...paginated_response,
        summary,
        thresholds: {
          adjudicationDays: config.sla.adjudicationDays,
          ackDays: config.sla.ackDays,
          warningWindowDays: config.sla.warningWindowDays,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
