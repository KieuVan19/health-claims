import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { validate } from '../middleware/validate';
import { getDeductiblePaid, getOopPaid } from '../services/claims';
import { passwordSchema, firstNameSchema, lastNameSchema } from '../schemas/common';
import { USER_ROLES, CLAIM_STATUSES, PLAN_YEAR_TYPES } from '../constants/enums';

const router = Router();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const updateProfileSchema = z.object({
  firstName: firstNameSchema,
  lastName: lastNameSchema,
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /users/profile:
 *   get:
 *     tags: [Users]
 *     summary: Get current user profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile data
 */
router.get(
  '/profile',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          userPolicies: {
            include: { policy: true },
          },
        },
      });
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.json(user);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /users/profile:
 *   put:
 *     tags: [Users]
 *     summary: Update current user profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName]
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *     responses:
 *       200:
 *         description: Profile updated
 */
router.put(
  '/profile',
  authenticate,
  validate(updateProfileSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { firstName, lastName } = req.body as z.infer<typeof updateProfileSchema>;

      const user = await prisma.user.update({
        where: { id: req.user!.id },
        data: { firstName, lastName },
        select: { id: true, email: true, firstName: true, lastName: true, role: true, updatedAt: true },
      });

      res.json(user);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /users/password:
 *   put:
 *     tags: [Users]
 *     summary: Change current user password
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Current password is incorrect
 */
router.put(
  '/password',
  authenticate,
  validate(changePasswordSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;

      const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) {
        res.status(400).json({ error: 'Current password is incorrect' });
        return;
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      });

      res.json({ message: 'Password changed successfully' });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Notification Preferences ─────────────────────────────────────────────────

const notificationPrefsSchema = z.object({
  claimSubmitted: z.boolean().optional(),
  claimApproved: z.boolean().optional(),
  claimRejected: z.boolean().optional(),
  claimPaid: z.boolean().optional(),
  infoRequested: z.boolean().optional(),
  claimUnderReview: z.boolean().optional(),
  appealPending: z.boolean().optional(),
}).passthrough();

/**
 * @openapi
 * /users/notification-preferences:
 *   get:
 *     tags: [Users]
 *     summary: Get notification preferences for current user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notification preference flags
 */
router.get(
  '/notification-preferences',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { notificationPrefs: true },
      });

      const defaults = {
        claimSubmitted: true,
        claimApproved: true,
        claimRejected: true,
        claimPaid: true,
        infoRequested: true,
        claimUnderReview: true,
        appealPending: true,
      };

      let prefs = defaults;
      try {
        prefs = { ...defaults, ...JSON.parse(user?.notificationPrefs ?? '{}') };
      } catch {
        prefs = defaults;
      }

      res.json(prefs);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /users/notification-preferences:
 *   put:
 *     tags: [Users]
 *     summary: Update notification preferences
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               claimSubmitted: { type: boolean }
 *               claimApproved: { type: boolean }
 *               claimRejected: { type: boolean }
 *               claimPaid: { type: boolean }
 *               infoRequested: { type: boolean }
 *               claimUnderReview: { type: boolean }
 *     responses:
 *       200:
 *         description: Updated preferences
 */
router.put(
  '/notification-preferences',
  authenticate,
  validate(notificationPrefsSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { notificationPrefs: true } });
      let existing: Record<string, unknown> = {};
      try { existing = JSON.parse(user?.notificationPrefs ?? '{}'); } catch { existing = {}; }

      const updated = { ...existing, ...req.body };
      await prisma.user.update({ where: { id: req.user!.id }, data: { notificationPrefs: JSON.stringify(updated) } });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// ─── Data Export (GDPR) ────────────────────────────────────────────────────────

/**
 * @openapi
 * /users/export-data:
 *   get:
 *     tags: [Users]
 *     summary: Export all personal data as JSON (GDPR)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: JSON file with profile, claims, dependents, pre-auths, and notifications
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.get(
  '/export-data',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;

      const [user, claims, notifications] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true, userPolicies: { where: { deletedAt: null }, include: { policy: true } } },
        }),
        prisma.claim.findMany({
          where: { patientId: userId, deletedAt: null },
          include: { policy: true, events: true, documents: { select: { originalName: true, mimeType: true, size: true, createdAt: true } }, payout: true },
        }),
        prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      ]);

      const exportData = {
        exportedAt: new Date().toISOString(),
        profile: user,
        claims: claims.map((c) => ({
          claimNumber: c.claimNumber,
          type: c.type,
          status: c.status,
          description: c.description,
          incidentDate: c.incidentDate,
          totalAmount: c.totalAmount,
          reimbursable: c.reimbursable,
          policy: c.policy?.name,
          events: c.events.map((e) => ({ action: e.action, note: e.note, createdAt: e.createdAt })),
          documents: c.documents,
          payout: c.payout ? { amount: c.payout.amount, paidAt: c.payout.paidAt, paymentRef: c.payout.paymentRef } : null,
        })),
        recentNotifications: notifications,
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="my-data-${new Date().toISOString().split('T')[0]}.json"`);
      res.json(exportData);
    } catch (err) {
      next(err);
    }
  }
);

// ─── Coverage Summary ─────────────────────────────────────────────────────────

/**
 * @openapi
 * /users/coverage-summary:
 *   get:
 *     tags: [Users]
 *     summary: Get coverage usage summary for all policies of the current user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of coverage summaries per policy (used, reimbursed, remaining)
 */
router.get(
  '/coverage-summary',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const requestedYear = req.query.year ? parseInt(req.query.year as string, 10) : new Date().getFullYear();
      const yearStart = new Date(requestedYear, 0, 1);
      const yearEnd = new Date(requestedYear + 1, 0, 1);

      const userPolicies = await prisma.userPolicy.findMany({
        where: { userId, deletedAt: null },
        include: {
          policy: true,
        },
      });

      const summaries = await Promise.all(
        userPolicies.map(async (up) => {
          const planYearStart = up.planYearType === PLAN_YEAR_TYPES.CALENDAR
            ? new Date(up.startDate)
            : yearStart;

          const [usedAgg, deductiblePaidIn, oopPaidIn, deductiblePaidOut, oopPaidOut] = await Promise.all([
            prisma.claim.aggregate({
              where: { patientId: userId, policyId: up.policyId, status: { in: [CLAIM_STATUSES.APPROVED, CLAIM_STATUSES.PAID] }, createdAt: { gte: yearStart, lt: yearEnd } },
              _sum: { totalAmount: true, reimbursable: true },
            }),
            getDeductiblePaid(userId, up.policyId, planYearStart, undefined, 'IN'),
            getOopPaid(userId, up.policyId, planYearStart, undefined, 'IN'),
            getDeductiblePaid(userId, up.policyId, planYearStart, undefined, 'OUT'),
            getOopPaid(userId, up.policyId, planYearStart, undefined, 'OUT'),
          ]);

          return {
            policy: up.policy,
            usedAmount: usedAgg._sum.totalAmount ?? 0,
            reimbursedAmount: usedAgg._sum.reimbursable ?? 0,
            remainingCoverage: Math.max(0, up.policy.coverageAmount - (usedAgg._sum.totalAmount ?? 0)),
            deductiblePaid: deductiblePaidIn,
            oopPaid: oopPaidIn,
            inNetworkDeductiblePaid: deductiblePaidIn,
            inNetworkOopPaid: oopPaidIn,
            outOfNetworkDeductiblePaid: deductiblePaidOut,
            outOfNetworkOopPaid: oopPaidOut,
            isExpired: new Date(up.policy.expiryDate) < new Date(),
            expiresInDays: Math.ceil((new Date(up.policy.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
          };
        })
      );

      res.json(summaries);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /users/{patientId}/user-policies:
 *   get:
 *     tags: [Users]
 *     summary: Get all user-policy assignments for a patient (Finance/Admin use for COB)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of user-policy assignments including payerOrder
 *       404:
 *         description: Patient not found
 */
router.get(
  '/:patientId/user-policies',
  authenticate,
  requireRole('FINANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { patientId } = req.params;

      const user = await prisma.user.findUnique({ where: { id: patientId }, select: { id: true, role: true } });
      if (!user || user.role !== USER_ROLES.PATIENT) {
        res.status(404).json({ error: 'Patient not found' });
        return;
      }

      const userPolicies = await prisma.userPolicy.findMany({
        where: { userId: patientId, deletedAt: null },
        include: { policy: true },
      });

      res.json(userPolicies);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
