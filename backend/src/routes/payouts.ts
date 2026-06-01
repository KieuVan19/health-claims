import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { stringify } from 'csv-stringify/sync';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { validate } from '../middleware/validate';
import { createAuditLog } from '../utils/audit';
import { createNotification } from '../utils/notification';
import { sendClaimPaid } from '../services/email';
import { applyRecoupment, markOffsets } from '../services/overpayments';
import { getPaginationParams, createPaginatedResponse } from '../utils/pagination';
import { CLAIM_STATUSES } from '../constants/enums';

const router = Router();

// All payout routes require authentication + FINANCE_OFFICER or ADMIN role
router.use(authenticate, requireRole('FINANCE_OFFICER', 'ADMIN'));

// ─── Schemas ─────────────────────────────────────────────────────────────────

const payClaimSchema = z.object({
  paymentRef: z.string().min(1, 'Payment reference is required'),
  notes: z.string().optional(),
});

const batchPaySchema = z.object({
  claimIds: z.array(z.string()).min(1, 'At least one claim ID is required'),
  paymentRef: z.string().min(1, 'Payment reference is required'),
  notes: z.string().optional(),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /payouts:
 *   get:
 *     tags: [Payouts]
 *     summary: List APPROVED claims ready for payout
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [APPROVED, PAID]
 *     responses:
 *       200:
 *         description: Paginated list of claims for payout
 */
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        page = '1',
        limit = '20',
        status = 'APPROVED',
        from,
        to,
        search,
      } = req.query as Record<string, string>;

      const { pageNum, limitNum, skip } = getPaginationParams(page, limit);

      const allowedStatuses = [CLAIM_STATUSES.APPROVED, CLAIM_STATUSES.PARTIALLY_APPROVED, CLAIM_STATUSES.PAID] as const;
      const queryStatus = allowedStatuses.includes(status as unknown as typeof allowedStatuses[number]) ? status : CLAIM_STATUSES.APPROVED;

      const where: Record<string, unknown> = { status: queryStatus, deletedAt: null };

      if (search) {
        where['OR'] = [
          { claimNumber: { contains: search } },
          { type: { contains: search } },
          { patient: { firstName: { contains: search } } },
          { patient: { lastName: { contains: search } } },
          { payout: { paymentRef: { contains: search } } },
        ];
      }

      if (from || to) {
        const dateFilter: Record<string, Date> = {};
        if (from) dateFilter['gte'] = new Date(from);
        if (to) {
          const toDate = new Date(to);
          toDate.setHours(23, 59, 59, 999);
          dateFilter['lte'] = toDate;
        }
        if (queryStatus === CLAIM_STATUSES.PAID) {
          where['payout'] = { paidAt: dateFilter };
        } else {
          where['updatedAt'] = dateFilter;
        }
      }

      const [total, claims] = await Promise.all([
        prisma.claim.count({ where }),
        prisma.claim.findMany({
          where,
          include: {
            patient: { select: { id: true, email: true, firstName: true, lastName: true } },
            adjuster: { select: { id: true, firstName: true, lastName: true } },
            policy: { select: { id: true, name: true, type: true } },
            payout: {
              include: {
                processor: { select: { id: true, firstName: true, lastName: true, email: true } },
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
          skip,
          take: limitNum,
        }),
      ]);

      res.json(createPaginatedResponse(claims, total, pageNum, limitNum));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /payouts/{claimId}/pay:
 *   post:
 *     tags: [Payouts]
 *     summary: Process payment for an approved claim
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: claimId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [paymentRef]
 *             properties:
 *               paymentRef:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment processed
 */
router.post(
  '/:claimId/pay',
  validate(payClaimSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { claimId } = req.params;
      const { paymentRef, notes } = req.body as z.infer<typeof payClaimSchema>;

      const claim = await prisma.claim.findUnique({
        where: { id: claimId },
        include: { patient: true },
      });

      if (!claim) {
        res.status(404).json({ error: 'Claim not found' });
        return;
      }

      if (claim.status !== CLAIM_STATUSES.APPROVED) {
        res.status(400).json({ error: 'Only APPROVED claims can be paid' });
        return;
      }

      // Check if payout already exists
      const existingPayout = await prisma.payout.findUnique({ where: { claimId } });
      if (existingPayout) {
        res.status(409).json({ error: 'Payment already processed for this claim' });
        return;
      }

      const grossAmount = claim.reimbursable ?? 0;

      const { netAmount, offsetIds, totalOffset } = await applyRecoupment(
        claim.patientId,
        grossAmount,
      );

      const [updatedClaim, payout] = await prisma.$transaction([
        prisma.claim.update({
          where: { id: claimId },
          data: { status: CLAIM_STATUSES.PAID },
          include: {
            patient: { select: { id: true, email: true, firstName: true, lastName: true } },
            policy: true,
            payout: true,
          },
        }),
        prisma.payout.create({
          data: {
            claimId,
            processedBy: req.user!.id,
            amount: netAmount,
            paymentRef,
            notes,
          },
        }),
        prisma.claimEvent.create({
          data: {
            claimId,
            userId: req.user!.id,
            action: 'PAID',
            fromStatus: CLAIM_STATUSES.APPROVED,
            toStatus: CLAIM_STATUSES.PAID,
            note: `Payment reference: ${paymentRef}`,
          },
        }),
      ]);

      await markOffsets(offsetIds);

      const notificationMessage =
        totalOffset > 0
          ? `Payment of $${netAmount.toFixed(2)} for claim ${claim.claimNumber} has been processed (reduced by $${totalOffset.toFixed(2)} overpayment recoupment). Reference: ${paymentRef}`
          : `Payment of $${netAmount.toFixed(2)} for claim ${claim.claimNumber} has been processed. Reference: ${paymentRef}`;

      await createNotification({
        userId: claim.patientId,
        title: 'Payment Processed',
        message: notificationMessage,
        type: 'success',
        link: `/claims/${claimId}`,
        prefKey: 'claimPaid',
      });

      await sendClaimPaid(claim.patient.email, claim.claimNumber, netAmount, paymentRef);

      await createAuditLog({
        userId: req.user!.id,
        action: 'PROCESS_PAYMENT',
        resource: 'Payout',
        resourceId: payout.id,
        details: { claimId, paymentRef, amount: netAmount, grossAmount, recoupedAmount: totalOffset },
        ipAddress: req.ip,
      });

      res.json({ claim: updatedClaim, payout });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /payouts/batch:
 *   post:
 *     tags: [Payouts]
 *     summary: Process batch payment for multiple approved claims
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [claimIds, paymentRef]
 *             properties:
 *               claimIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               paymentRef:
 *                 type: string
 *     responses:
 *       200:
 *         description: Batch payment processed
 */
router.post(
  '/batch',
  validate(batchPaySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { claimIds, paymentRef, notes } = req.body as z.infer<typeof batchPaySchema>;

      const claims = await prisma.claim.findMany({
        where: {
          id: { in: claimIds },
          status: CLAIM_STATUSES.APPROVED,
          deletedAt: null,
        },
        include: { patient: true },
      });

      if (claims.length === 0) {
        res.status(400).json({ error: 'No APPROVED claims found for the provided IDs' });
        return;
      }

      const results: { claimId: string; claimNumber: string; amount: number; status: string }[] = [];
      const errors: { claimId: string; error: string }[] = [];

      // For a true batch (>1 claim): paymentRef is the shared batch ref; each claim gets
      // its own individualRef = batchRef-claimNumber.
      // For a single claim: paymentRef is used directly; no batchRef is set.
      const isBatch = claimIds.length > 1;
      const batchRef = isBatch ? paymentRef : null;

      for (const claim of claims) {
        try {
          const existing = await prisma.payout.findUnique({ where: { claimId: claim.id } });
          if (existing) {
            errors.push({ claimId: claim.id, error: 'Payment already processed' });
            continue;
          }

          const grossAmount = claim.reimbursable ?? 0;
          const individualRef = isBatch ? `${paymentRef}-${claim.claimNumber}` : paymentRef;

          const { netAmount, offsetIds, totalOffset } = await applyRecoupment(
            claim.patientId,
            grossAmount,
          );

          await prisma.$transaction([
            prisma.claim.update({
              where: { id: claim.id },
              data: { status: CLAIM_STATUSES.PAID },
            }),
            prisma.payout.create({
              data: {
                claimId: claim.id,
                processedBy: req.user!.id,
                amount: netAmount,
                paymentRef: individualRef,
                batchRef,
                notes,
              },
            }),
            prisma.claimEvent.create({
              data: {
                claimId: claim.id,
                userId: req.user!.id,
                action: 'PAID',
                fromStatus: CLAIM_STATUSES.APPROVED,
                toStatus: CLAIM_STATUSES.PAID,
                note: isBatch ? `Batch payment: ${paymentRef}` : `Payment reference: ${paymentRef}`,
              },
            }),
          ]);

          await markOffsets(offsetIds);

          const batchNotificationMessage =
            totalOffset > 0
              ? `Payment of $${netAmount.toFixed(2)} for claim ${claim.claimNumber} has been processed (reduced by $${totalOffset.toFixed(2)} overpayment recoupment). Reference: ${individualRef}`
              : `Payment of $${netAmount.toFixed(2)} for claim ${claim.claimNumber} has been processed. Reference: ${individualRef}`;

          await createNotification({
            userId: claim.patientId,
            title: 'Payment Processed',
            message: batchNotificationMessage,
            type: 'success',
            link: `/claims/${claim.id}`,
            prefKey: 'claimPaid',
          });

          await sendClaimPaid(claim.patient.email, claim.claimNumber, netAmount, individualRef);

          results.push({ claimId: claim.id, claimNumber: claim.claimNumber, amount: netAmount, status: 'PAID' });
        } catch (e) {
          errors.push({ claimId: claim.id, error: e instanceof Error ? e.message : 'Unknown error' });
        }
      }

      await createAuditLog({
        userId: req.user!.id,
        action: 'BATCH_PAYMENT',
        resource: 'Payout',
        details: { batchRef, count: results.length, claimIds },
        ipAddress: req.ip,
      });

      res.json({ processed: results, errors, batchRef: batchRef ?? undefined });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /payouts/export:
 *   get:
 *     tags: [Payouts]
 *     summary: Export paid claims as CSV within a date range
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: CSV file
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 */
router.get(
  '/export',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { from, to } = req.query as Record<string, string>;

      const where: Record<string, unknown> = { status: CLAIM_STATUSES.PAID, deletedAt: null };
      if (from || to) {
        const dateFilter: Record<string, Date> = {};
        if (from) dateFilter['gte'] = new Date(from);
        if (to) {
          const toDate = new Date(to);
          toDate.setHours(23, 59, 59, 999);
          dateFilter['lte'] = toDate;
        }
        where['payout'] = { paidAt: dateFilter };
      }

      const claims = await prisma.claim.findMany({
        where,
        include: {
          patient: { select: { email: true, firstName: true, lastName: true } },
          policy: { select: { name: true, type: true } },
          adjuster: { select: { firstName: true, lastName: true } },
          payout: true,
        },
        orderBy: { updatedAt: 'desc' },
      });

      const rows = claims.map((claim) => [
        claim.claimNumber,
        `${claim.patient.firstName} ${claim.patient.lastName}`,
        claim.patient.email,
        claim.policy.name,
        claim.policy.type,
        claim.type,
        claim.incidentDate.toISOString().split('T')[0],
        claim.totalAmount.toFixed(2),
        (claim.reimbursable ?? 0).toFixed(2),
        claim.payout?.paymentRef ?? '',
        claim.payout?.paidAt?.toISOString().split('T')[0] ?? '',
        claim.adjuster ? `${claim.adjuster.firstName} ${claim.adjuster.lastName}` : '',
      ]);

      const headers = [
        'Claim Number',
        'Patient Name',
        'Patient Email',
        'Policy Name',
        'Policy Type',
        'Claim Type',
        'Incident Date',
        'Total Amount',
        'Reimbursable Amount',
        'Payment Reference',
        'Paid Date',
        'Adjuster',
      ];

      const csv = stringify([headers, ...rows]);

      const filename = `payouts-export-${new Date().toISOString().split('T')[0]}.csv`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /payouts/reports:
 *   get:
 *     tags: [Payouts]
 *     summary: Monthly finance summary report
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: months
 *         schema:
 *           type: integer
 *           default: 6
 *         description: Number of months to include (max 24)
 *     responses:
 *       200:
 *         description: Monthly breakdown and summary totals
 */
/**
 * GET /payouts/reports — monthly finance summary
 */
router.get(
  '/reports',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { months = '6', from, to } = req.query as Record<string, string>;

      let rangeStart: Date;
      let rangeEnd: Date;

      if (from || to) {
        rangeStart = from ? new Date(from) : new Date('2000-01-01');
        rangeEnd = to ? new Date(to) : new Date();
        rangeStart = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
        rangeEnd = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth() + 1, 0, 23, 59, 59);
      } else {
        const monthCount = Math.min(24, Math.max(1, parseInt(months, 10)));
        const now = new Date();
        rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        const start = new Date(now.getFullYear(), now.getMonth() - (monthCount - 1), 1);
        rangeStart = start;
      }

      const monthlyData: {
        month: string;
        claimsCount: number;
        totalPaid: number;
        avgAmount: number;
        byType: Record<string, number>;
      }[] = [];

      const cursor = new Date(rangeStart);
      let bucketCount = 0;

      while (cursor <= rangeEnd && bucketCount < 60) {
        const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59);

        const [paidClaims, byType] = await Promise.all([
          prisma.payout.findMany({
            where: { paidAt: { gte: monthStart, lte: monthEnd } },
            include: { claim: { select: { type: true, reimbursable: true } } },
          }),
          prisma.claim.groupBy({
            by: ['type'],
            where: { status: CLAIM_STATUSES.PAID, payout: { paidAt: { gte: monthStart, lte: monthEnd } }, deletedAt: null },
            _sum: { reimbursable: true },
          }),
        ]);

        const totalPaid = paidClaims.reduce((sum, p) => sum + p.amount, 0);
        const byTypeMap: Record<string, number> = {};
        for (const t of byType) {
          byTypeMap[t.type] = t._sum.reimbursable ?? 0;
        }

        monthlyData.push({
          month: monthStart.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
          claimsCount: paidClaims.length,
          totalPaid,
          avgAmount: paidClaims.length > 0 ? totalPaid / paidClaims.length : 0,
          byType: byTypeMap,
        });

        cursor.setMonth(cursor.getMonth() + 1);
        bucketCount++;
      }

      // Summary stats
      const [totalPendingCount, totalPendingAmount, allTimePaid] = await Promise.all([
        prisma.claim.count({ where: { status: CLAIM_STATUSES.APPROVED, deletedAt: null } }),
        prisma.claim.aggregate({ where: { status: CLAIM_STATUSES.APPROVED, deletedAt: null }, _sum: { reimbursable: true } }),
        prisma.payout.aggregate({ _sum: { amount: true }, _count: { id: true } }),
      ]);

      res.json({
        monthly: monthlyData,
        summary: {
          pendingPayoutsCount: totalPendingCount,
          pendingPayoutsAmount: totalPendingAmount._sum.reimbursable ?? 0,
          allTimePaidAmount: allTimePaid._sum.amount ?? 0,
          allTimePaidCount: allTimePaid._count.id,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /payouts/{claimId}:
 *   get:
 *     tags: [Payouts]
 *     summary: Get full detail of a single APPROVED or PAID claim
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: claimId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Claim with payout and processor details
 *       404:
 *         description: Claim not found
 */
router.get(
  '/:claimId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { claimId } = req.params;

      const claim = await prisma.claim.findUnique({
        where: { id: claimId },
        include: {
          patient: { select: { id: true, email: true, firstName: true, lastName: true } },
          adjuster: { select: { id: true, email: true, firstName: true, lastName: true } },
          policy: true,
          payout: {
            include: {
              processor: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
          },
          events: {
            where: { action: 'PAID' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!claim) {
        res.status(404).json({ error: 'Claim not found' });
        return;
      }

      const validPayoutStatuses = [CLAIM_STATUSES.APPROVED, CLAIM_STATUSES.PARTIALLY_APPROVED, CLAIM_STATUSES.PAID] as const;
      if (!validPayoutStatuses.includes(claim.status as unknown as typeof validPayoutStatuses[number])) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      res.json(claim);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
