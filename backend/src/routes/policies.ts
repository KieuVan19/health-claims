import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { validate } from '../middleware/validate';
import { createAuditLog } from '../utils/audit';

const router = Router();

// SQLite stores benefits as a JSON string; parse it back to an object before sending
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parseBenefits = (policy: any) => ({
  ...policy,
  benefits: (() => {
    const b = policy.benefits
    if (typeof b === 'string') {
      try { return JSON.parse(b) } catch { return {} }
    }
    return b ?? {}
  })(),
})

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createPolicySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['BASIC', 'STANDARD', 'PREMIUM']),
  description: z.string().optional(),
  coverageAmount: z.number().positive('Coverage amount must be positive'),
  deductible: z.number().min(0, 'Deductible cannot be negative'),
  copayPercentage: z.number().min(0).max(100).default(20),
  oopMax: z.number().min(0, 'OOP max cannot be negative').default(8000),
  oonDeductible: z.number().min(0, 'OON deductible cannot be negative').default(0),
  oonCopayPercent: z.number().min(0).max(100).default(0),
  filingDeadlineDays: z.number().int().min(1, 'Filing deadline must be at least 1 day').default(365),
  effectiveDate: z.string().transform((v) => new Date(v)),
  expiryDate: z.string().transform((v) => new Date(v)),
  benefits: z.record(z.unknown()).optional().default({}),
});

const updatePolicySchema = createPolicySchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /policies:
 *   get:
 *     tags: [Policies]
 *     summary: List policies (patients see own; admin sees all)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of policies
 */
router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { role, id: userId } = req.user!;

      if (role === 'PATIENT') {
        const userPolicies = await prisma.userPolicy.findMany({
          where: { userId },
          include: { policy: true },
        });
        res.json(userPolicies.map((up) => parseBenefits(up.policy)));
        return;
      }

      // ADMIN, ADJUSTER, FINANCE_OFFICER see all policies
      const policies = await prisma.policy.findMany({
        orderBy: { createdAt: 'desc' },
      });
      res.json(policies.map(parseBenefits));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /policies/{id}:
 *   get:
 *     tags: [Policies]
 *     summary: Get a single policy with coverage details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Policy details
 *       404:
 *         description: Policy not found
 */
router.get(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const policy = await prisma.policy.findUnique({
        where: { id: req.params['id'] },
        include: {
          userPolicies: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, email: true },
              },
            },
          },
        },
      });

      if (!policy) {
        res.status(404).json({ error: 'Policy not found' });
        return;
      }

      // Patients may only view their own policies
      if (req.user!.role === 'PATIENT') {
        const owned = policy.userPolicies.some((up) => up.userId === req.user!.id);
        if (!owned) {
          res.status(403).json({ error: 'Access denied' });
          return;
        }
      }

      res.json(parseBenefits(policy));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /policies:
 *   post:
 *     tags: [Policies]
 *     summary: Create a new policy (Admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Policy created
 */
router.post(
  '/',
  authenticate,
  requireRole('ADMIN'),
  validate(createPolicySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = req.body as z.infer<typeof createPolicySchema>;

      const duplicate = await prisma.policy.findFirst({
        where: {
          name: data.name,
          type: data.type,
          coverageAmount: data.coverageAmount,
          deductible: data.deductible,
          copayPercentage: data.copayPercentage,
          oopMax: data.oopMax,
          effectiveDate: data.effectiveDate,
          expiryDate: data.expiryDate,
        },
      });
      if (duplicate) {
        res.status(409).json({ message: 'An identical policy already exists. Change at least one parameter to create a new one.' });
        return;
      }

      const policy = await prisma.policy.create({
        data: {
          name: data.name,
          type: data.type,
          description: data.description,
          coverageAmount: data.coverageAmount,
          deductible: data.deductible,
          copayPercentage: data.copayPercentage,
          oopMax: data.oopMax,
          oonDeductible: data.oonDeductible,
          oonCopayPercent: data.oonCopayPercent,
          filingDeadlineDays: data.filingDeadlineDays,
          effectiveDate: data.effectiveDate,
          expiryDate: data.expiryDate,
          benefits: JSON.stringify(data.benefits ?? {}),
        },
      });

      await createAuditLog({ userId: req.user!.id, action: 'CREATE', resource: 'Policy', resourceId: policy.id, details: { name: policy.name }, ipAddress: req.ip });

      res.status(201).json(parseBenefits(policy));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /policies/{id}:
 *   put:
 *     tags: [Policies]
 *     summary: Update a policy (Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Policy updated
 */
router.put(
  '/:id',
  authenticate,
  requireRole('ADMIN'),
  validate(updatePolicySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = req.body as z.infer<typeof updatePolicySchema>;

      const policy = await prisma.policy.update({
        where: { id: req.params['id'] },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.type !== undefined && { type: data.type }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.coverageAmount !== undefined && { coverageAmount: data.coverageAmount }),
          ...(data.deductible !== undefined && { deductible: data.deductible }),
          ...(data.copayPercentage !== undefined && { copayPercentage: data.copayPercentage }),
          ...(data.oopMax !== undefined && { oopMax: data.oopMax }),
          ...(data.oonDeductible !== undefined && { oonDeductible: data.oonDeductible }),
          ...(data.oonCopayPercent !== undefined && { oonCopayPercent: data.oonCopayPercent }),
          ...(data.filingDeadlineDays !== undefined && { filingDeadlineDays: data.filingDeadlineDays }),
          ...(data.effectiveDate !== undefined && { effectiveDate: data.effectiveDate }),
          ...(data.expiryDate !== undefined && { expiryDate: data.expiryDate }),
          ...(data.benefits !== undefined && { benefits: JSON.stringify(data.benefits) }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
        },
      });

      await createAuditLog({ userId: req.user!.id, action: 'UPDATE', resource: 'Policy', resourceId: policy.id, ipAddress: req.ip });

      res.json(parseBenefits(policy));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /policies/{id}:
 *   delete:
 *     tags: [Policies]
 *     summary: Deactivate a policy (Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Policy deactivated
 */
router.delete(
  '/:id',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const policyId = req.params['id']!;

      const [claimCount, userPolicyCount] = await Promise.all([
        prisma.claim.count({ where: { policyId } }),
        prisma.userPolicy.count({ where: { policyId } }),
      ]);

      if (claimCount > 0) {
        res.status(409).json({ error: `Cannot delete: ${claimCount} claim(s) reference this policy.` });
        return;
      }
      if (userPolicyCount > 0) {
        res.status(409).json({ error: `Cannot delete: ${userPolicyCount} user assignment(s) exist. Remove assignments first.` });
        return;
      }

      await prisma.policy.delete({ where: { id: policyId } });
      await createAuditLog({ userId: req.user!.id, action: 'DELETE', resource: 'Policy', resourceId: policyId, ipAddress: req.ip });

      res.json({ message: 'Policy deleted' });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /policies/{id}/assign/{userId}:
 *   post:
 *     tags: [Policies]
 *     summary: Assign a policy to a user (Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Policy assigned
 */
const assignPolicyBodySchema = z.object({
  planYearType: z.enum(['CALENDAR', 'ANNIVERSARY']).default('CALENDAR'),
}).partial();

router.post(
  '/:id/assign/:userId',
  authenticate,
  requireRole('ADMIN'),
  validate(assignPolicyBodySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const policyId = req.params['id']!;
      const targetUserId = req.params['userId']!;
      const { planYearType = 'CALENDAR' } = req.body as z.infer<typeof assignPolicyBodySchema>;

      const [policy, user] = await Promise.all([
        prisma.policy.findUnique({ where: { id: policyId } }),
        prisma.user.findUnique({ where: { id: targetUserId } }),
      ]);

      if (!policy) {
        res.status(404).json({ error: 'Policy not found' });
        return;
      }
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const userPolicy = await prisma.userPolicy.create({
        data: { userId: targetUserId, policyId, startDate: new Date(), planYearType: planYearType ?? 'CALENDAR' },
        include: { policy: true, user: { select: { id: true, email: true, firstName: true, lastName: true } } },
      });

      await createAuditLog({ userId: req.user!.id, action: 'ASSIGN_POLICY', resource: 'UserPolicy', resourceId: userPolicy.id, details: { policyId, targetUserId }, ipAddress: req.ip });

      res.status(201).json(userPolicy);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
