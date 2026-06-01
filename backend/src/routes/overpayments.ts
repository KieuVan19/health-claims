import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { validate } from '../middleware/validate';
import { createAuditLog } from '../utils/audit';
import { createNotification } from '../utils/notification';
import { getPaginationParams, createPaginatedResponse } from '../utils/pagination';
import { OVERPAYMENT_REASONS, OVERPAYMENT_STATUSES, CLAIM_STATUSES } from '../constants/enums';

const router = Router();

router.use(authenticate, requireRole('FINANCE_OFFICER', 'ADMIN'));

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createOverpaymentSchema = z.object({
  overpaidAmount: z.number().positive('Overpaid amount must be positive'),
  reason: z.enum([OVERPAYMENT_REASONS.ADJUSTER_ERROR, OVERPAYMENT_REASONS.COB_UPDATE, OVERPAYMENT_REASONS.POLICY_CHANGE] as const),
});

const waiveOverpaymentSchema = z.object({
  waiverReason: z.string().min(1, 'Waiver reason is required'),
});

const bulkWaiveSchema = z.object({
  overpaymentIds: z.array(z.string()).min(1, 'At least one overpayment ID is required'),
  waiverReason: z.string().min(1, 'Waiver reason is required'),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /overpayments:
 *   get:
 *     tags: [Overpayments]
 *     summary: List overpayments (optionally filtered by status)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [IDENTIFIED, OFFSET, WAIVED]
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
 *         description: Paginated list of overpayments
 */
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status, page = '1', limit = '20' } = req.query as Record<string, string>;

      const { pageNum, limitNum, skip } = getPaginationParams(page, limit);

      const validStatuses = [OVERPAYMENT_STATUSES.IDENTIFIED, OVERPAYMENT_STATUSES.OFFSET, OVERPAYMENT_STATUSES.WAIVED] as const;
      const where = status && validStatuses.includes(status as unknown as typeof validStatuses[number]) ? { status, deletedAt: null } : { deletedAt: null };

      const [total, overpayments] = await Promise.all([
        prisma.overpayment.count({ where }),
        prisma.overpayment.findMany({
          where,
          include: {
            claim: {
              select: {
                id: true,
                claimNumber: true,
                patientId: true,
                patient: { select: { id: true, firstName: true, lastName: true, email: true } },
              },
            },
            originalPayout: {
              select: { id: true, paymentRef: true, amount: true, paidAt: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limitNum,
        }),
      ]);

      res.json(createPaginatedResponse(overpayments, total, pageNum, limitNum));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /overpayments/claim/{claimId}:
 *   post:
 *     tags: [Overpayments]
 *     summary: Flag a PAID claim as overpaid
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
 *             required: [overpaidAmount, reason]
 *             properties:
 *               overpaidAmount:
 *                 type: number
 *               reason:
 *                 type: string
 *                 enum: [ADJUSTER_ERROR, COB_UPDATE, POLICY_CHANGE]
 *     responses:
 *       201:
 *         description: Overpayment record created
 */
router.post(
  '/claim/:claimId',
  validate(createOverpaymentSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { claimId } = req.params;
      const { overpaidAmount, reason } = req.body as z.infer<typeof createOverpaymentSchema>;

      const claim = await prisma.claim.findUnique({
        where: { id: claimId },
        include: { payout: true, patient: true },
      });

      if (!claim) {
        res.status(404).json({ error: 'Claim not found' });
        return;
      }

      if (claim.status !== CLAIM_STATUSES.PAID) {
        res.status(400).json({ error: 'Only PAID claims can be flagged as overpaid' });
        return;
      }

      if (!claim.payout) {
        res.status(400).json({ error: 'Claim has no associated payout record' });
        return;
      }

      const paidAmount = claim.payout.amount;
      if (overpaidAmount > paidAmount) {
        res.status(400).json({
          error: `Overpaid amount ($${overpaidAmount}) cannot exceed the original payout ($${paidAmount})`,
        });
        return;
      }

      const overpayment = await prisma.overpayment.create({
        data: {
          claimId,
          originalPayoutId: claim.payout.id,
          overpaidAmount,
          reason,
          status: OVERPAYMENT_STATUSES.IDENTIFIED,
        },
        include: {
          claim: {
            select: {
              claimNumber: true,
              patient: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
          },
          originalPayout: { select: { paymentRef: true, amount: true, paidAt: true } },
        },
      });

      await createAuditLog({
        userId: req.user!.id,
        action: 'FLAG_OVERPAYMENT',
        resource: 'Overpayment',
        resourceId: overpayment.id,
        details: { claimId, overpaidAmount, reason },
        ipAddress: req.ip,
      });

      res.status(201).json(overpayment);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /overpayments/{overpaymentId}/waive:
 *   post:
 *     tags: [Overpayments]
 *     summary: Waive an identified overpayment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: overpaymentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [waiverReason]
 *             properties:
 *               waiverReason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Overpayment waived
 */
/**
 * @openapi
 * /overpayments/bulk-waive:
 *   post:
 *     tags: [Overpayments]
 *     summary: Bulk waive multiple identified overpayments
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [overpaymentIds, waiverReason]
 *             properties:
 *               overpaymentIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               waiverReason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Bulk waive processed
 */
router.post(
  '/bulk-waive',
  validate(bulkWaiveSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { overpaymentIds, waiverReason } = req.body as z.infer<typeof bulkWaiveSchema>;

      const overpayments = await prisma.overpayment.findMany({
        where: {
          id: { in: overpaymentIds },
          status: OVERPAYMENT_STATUSES.IDENTIFIED,
          deletedAt: null,
        },
        include: {
          claim: { select: { patientId: true, claimNumber: true } },
        },
      });

      if (overpayments.length === 0) {
        res.status(400).json({ error: 'No IDENTIFIED overpayments found for the provided IDs' });
        return;
      }

      const processed: { overpaymentId: string; claimNumber: string; overpaidAmount: number }[] = [];
      const errors: { overpaymentId: string; error: string }[] = [];

      for (const overpayment of overpayments) {
        try {
          const updated = await prisma.overpayment.update({
            where: { id: overpayment.id },
            data: { status: OVERPAYMENT_STATUSES.WAIVED, waiverReason },
          });

          await createNotification({
            userId: overpayment.claim.patientId,
            title: 'Overpayment Waived',
            message: `The overpayment of $${overpayment.overpaidAmount.toFixed(2)} on claim ${overpayment.claim.claimNumber} has been waived.`,
            type: 'info',
            link: `/claims/${overpayment.claimId}`,
          });

          processed.push({
            overpaymentId: updated.id,
            claimNumber: overpayment.claim.claimNumber,
            overpaidAmount: overpayment.overpaidAmount,
          });
        } catch (err) {
          errors.push({
            overpaymentId: overpayment.id,
            error: err instanceof Error ? err.message : 'Failed to waive overpayment',
          });
        }
      }

      await createAuditLog({
        userId: req.user!.id,
        action: 'BULK_WAIVE_OVERPAYMENT',
        resource: 'Overpayment',
        details: { count: processed.length, overpaymentIds },
        ipAddress: req.ip,
      });

      res.json({ processed, errors });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:overpaymentId/waive',
  validate(waiveOverpaymentSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { overpaymentId: id } = req.params;
      const { waiverReason } = req.body as z.infer<typeof waiveOverpaymentSchema>;

      const overpayment = await prisma.overpayment.findUnique({
        where: { id },
        include: {
          claim: {
            select: {
              patientId: true,
              claimNumber: true,
            },
          },
        },
      });

      if (!overpayment) {
        res.status(404).json({ error: 'Overpayment not found' });
        return;
      }

      // Immutability guard: cannot waive once already offset or waived
      if (overpayment.status !== OVERPAYMENT_STATUSES.IDENTIFIED) {
        res.status(400).json({ error: `Cannot waive an overpayment in status ${overpayment.status}` });
        return;
      }

      const updated = await prisma.overpayment.update({
        where: { id },
        data: { status: OVERPAYMENT_STATUSES.WAIVED, waiverReason },
      });

      await createAuditLog({
        userId: req.user!.id,
        action: 'WAIVE_OVERPAYMENT',
        resource: 'Overpayment',
        resourceId: id,
        details: { claimId: overpayment.claimId, waiverReason },
        ipAddress: req.ip,
      });

      await createNotification({
        userId: overpayment.claim.patientId,
        title: 'Overpayment Waived',
        message: `The overpayment of $${overpayment.overpaidAmount.toFixed(2)} on claim ${overpayment.claim.claimNumber} has been waived.`,
        type: 'info',
        link: `/claims/${overpayment.claimId}`,
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /overpayments/{overpaymentId}:
 *   get:
 *     tags: [Overpayments]
 *     summary: Get a single overpayment record
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: overpaymentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Overpayment detail
 */
router.get(
  '/:overpaymentId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { overpaymentId: id } = req.params;

      const overpayment = await prisma.overpayment.findUnique({
        where: { id },
        include: {
          claim: {
            select: {
              id: true,
              claimNumber: true,
              patientId: true,
              patient: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
          },
          originalPayout: {
            select: { id: true, paymentRef: true, amount: true, paidAt: true },
          },
        },
      });

      if (!overpayment) {
        res.status(404).json({ error: 'Overpayment not found' });
        return;
      }

      res.json(overpayment);
    } catch (err) {
      next(err);
    }
  },
);

export default router;

