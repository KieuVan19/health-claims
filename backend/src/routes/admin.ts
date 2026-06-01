import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { validate } from '../middleware/validate';
import { createAuditLog, logRead } from '../utils/audit';
import { getPaginationParams, createPaginatedResponse } from '../utils/pagination';
import { passwordSchema, firstNameSchema, lastNameSchema } from '../schemas/common';
import { USER_ROLES, CLAIM_STATUSES, PAYER_ORDERS, PLAN_YEAR_TYPES } from '../constants/enums';

const router = Router();

// All admin routes require authentication + ADMIN role
router.use(authenticate, requireRole('ADMIN'));

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createUserSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  firstName: firstNameSchema,
  lastName: lastNameSchema,
  role: z.enum([USER_ROLES.PATIENT, USER_ROLES.ADJUSTER, USER_ROLES.FINANCE_OFFICER, USER_ROLES.ADMIN] as const),
});

const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  role: z.enum([USER_ROLES.PATIENT, USER_ROLES.ADJUSTER, USER_ROLES.FINANCE_OFFICER, USER_ROLES.ADMIN] as const).optional(),
  isActive: z.boolean().optional(),
  specialty: z.string().max(100).nullable().optional(),
});

// ─── User Management ─────────────────────────────────────────────────────────

/**
 * @openapi
 * /admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List all users with pagination
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
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Paginated list of users
 */
router.get(
  '/users',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        page = '1',
        limit = '20',
        search,
        role,
      } = req.query as Record<string, string>;

      const { pageNum, limitNum, skip } = getPaginationParams(page, limit);

      const where: Record<string, unknown> = {};
      if (role) where['role'] = role;
      if (search) {
        where['OR'] = [
          { email: { contains: search } },
          { firstName: { contains: search } },
          { lastName: { contains: search } },
        ];
      }

      const [total, users] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
            specialty: true,
            createdAt: true,
            updatedAt: true,
            _count: { select: { patientClaims: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limitNum,
        }),
      ]);

      res.json(createPaginatedResponse(users, total, pageNum, limitNum));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /admin/users/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Get a user profile by ID (non-patient access, HIPAA-logged)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User profile
 *       404:
 *         description: User not found
 */
router.get(
  '/users/:userId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params['userId'] },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          specialty: true,
          createdAt: true,
          updatedAt: true,
          userPolicies: { include: { policy: true } },
          _count: { select: { patientClaims: true } },
        },
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      logRead(req.user!.id, 'User', user.id, req, false);

      res.json(user);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /admin/users:
 *   post:
 *     tags: [Admin]
 *     summary: Create a user with any role
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: User created
 */
router.post(
  '/users',
  validate(createUserSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = req.body as z.infer<typeof createUserSchema>;

      const existing = await prisma.user.findUnique({ where: { email: data.email } });
      if (existing) {
        res.status(409).json({ error: 'Email address is already registered' });
        return;
      }

      const hashedPassword = await bcrypt.hash(data.password, 10);
      const user = await prisma.user.create({
        data: {
          email: data.email,
          password: hashedPassword,
          firstName: data.firstName,
          lastName: data.lastName,
          role: data.role,
        },
        select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, createdAt: true },
      });

      await createAuditLog({ userId: req.user!.id, action: 'ADMIN_CREATE_USER', resource: 'User', resourceId: user.id, details: { email: user.email, role: user.role }, ipAddress: req.ip });

      res.status(201).json(user);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /admin/users/{id}:
 *   put:
 *     tags: [Admin]
 *     summary: Update a user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User updated
 */
router.put(
  '/users/:userId',
  validate(updateUserSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = req.body as z.infer<typeof updateUserSchema>;

      const user = await prisma.user.update({
        where: { id: req.params['userId'] },
        data: {
          ...(data.firstName !== undefined && { firstName: data.firstName }),
          ...(data.lastName !== undefined && { lastName: data.lastName }),
          ...(data.role !== undefined && { role: data.role }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
          ...('specialty' in data && { specialty: data.specialty ?? null }),
        },
        select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, specialty: true, updatedAt: true },
      });

      await createAuditLog({ userId: req.user!.id, action: 'ADMIN_UPDATE_USER', resource: 'User', resourceId: user.id, details: data as Record<string, unknown>, ipAddress: req.ip });

      res.json(user);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /admin/users/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Deactivate a user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User deactivated
 */
router.delete(
  '/users/:userId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.params['userId'] === req.user!.id) {
        res.status(400).json({ error: 'You cannot deactivate your own account' });
        return;
      }

      const user = await prisma.user.update({
        where: { id: req.params['userId'] },
        data: { isActive: false },
        select: { id: true, email: true, isActive: true },
      });

      await createAuditLog({ userId: req.user!.id, action: 'ADMIN_DEACTIVATE_USER', resource: 'User', resourceId: user.id, ipAddress: req.ip });

      res.json({ message: 'User deactivated', user });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Audit Logs ───────────────────────────────────────────────────────────────

/**
 * @openapi
 * /admin/audit-logs:
 *   get:
 *     tags: [Admin]
 *     summary: Get paginated audit logs
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Paginated audit logs
 */
router.get(
  '/audit-logs',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        page = '1',
        limit = '20',
        userId,
        action,
        resource,
      } = req.query as Record<string, string>;

      const { pageNum, limitNum, skip } = getPaginationParams(page, limit);

      const where: Record<string, unknown> = {};
      if (userId) where['userId'] = userId;
      if (action) where['action'] = { contains: action };
      if (resource) where['resource'] = resource;

      const [total, logs] = await Promise.all([
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({
          where,
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limitNum,
        }),
      ]);

      res.json(createPaginatedResponse(logs, total, pageNum, limitNum));
    } catch (err) {
      next(err);
    }
  }
);

// ─── Analytics ────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /admin/analytics:
 *   get:
 *     tags: [Admin]
 *     summary: Claims analytics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Analytics data
 */
router.get(
  '/analytics',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { startDate, endDate, groupBy = 'monthly' } = req.query as {
        startDate?: string;
        endDate?: string;
        groupBy?: 'daily' | 'weekly' | 'monthly' | 'yearly';
      };
      const hasFilter = !!(startDate || endDate);
      const dateRangeFilter = {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate ? { lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)) } : {}),
      };
      const dateFilter = hasFilter ? { createdAt: dateRangeFilter } : {};

      const [
        claimsByStatus,
        claimsByType,
        totalReimbursable,
        trendClaims,
        payoutSum,
        payoutCount,
      ] = await Promise.all([
        prisma.claim.groupBy({
          by: ['status'],
          _count: { id: true },
          ...(hasFilter ? { where: dateFilter } : {}),
        }) as unknown as Promise<Array<{ status: string; _count: { id: number } }>>,
        prisma.claim.groupBy({
          by: ['type'],
          _count: { id: true },
          _sum: { totalAmount: true },
          ...(hasFilter ? { where: dateFilter } : {}),
        }),
        prisma.claim.aggregate({
          where: { status: { in: [CLAIM_STATUSES.APPROVED, CLAIM_STATUSES.PAID] }, ...dateFilter },
          _sum: { reimbursable: true, totalAmount: true },
        }),
        prisma.claim.findMany({
          where: hasFilter ? { createdAt: dateRangeFilter } : {},
          select: { createdAt: true },
          orderBy: { createdAt: 'asc' },
        }),
        hasFilter
          ? prisma.payout.aggregate({ where: { paidAt: dateRangeFilter }, _sum: { amount: true } })
          : prisma.payout.aggregate({ _sum: { amount: true } }),
        hasFilter
          ? prisma.payout.count({ where: { paidAt: dateRangeFilter } })
          : prisma.payout.count(),
      ]);

      let trendData: Array<{ month: string; count: number; amount: number }>;

      if (groupBy === 'daily') {
        if (hasFilter) {
          const rangeStart = startDate ? new Date(startDate) : new Date(trendClaims[0]?.createdAt ?? new Date());
          const rangeEnd = endDate ? new Date(new Date(endDate).setHours(23, 59, 59, 999)) : new Date();
          const daily: Record<string, number> = {};
          const cur = new Date(rangeStart);
          cur.setHours(0, 0, 0, 0);
          const stop = new Date(rangeEnd);
          stop.setHours(0, 0, 0, 0);
          while (cur <= stop) {
            daily[cur.toISOString().split('T')[0]!] = 0;
            cur.setDate(cur.getDate() + 1);
          }
          for (const c of trendClaims) {
            const day = c.createdAt.toISOString().split('T')[0]!;
            if (day in daily) daily[day]!++;
          }
          trendData = Object.entries(daily).map(([date, count]) => ({
            month: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            count,
            amount: 0,
          }));
        } else {
          const daily: Record<string, number> = {};
          for (const c of trendClaims) {
            const key = c.createdAt.toISOString().split('T')[0]!;
            daily[key] = (daily[key] ?? 0) + 1;
          }
          trendData = Object.entries(daily)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, count]) => ({
              month: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              count,
              amount: 0,
            }));
        }
      } else if (groupBy === 'weekly') {
        const weekly: Record<string, number> = {};
        for (const c of trendClaims) {
          const d = new Date(c.createdAt);
          const day = d.getDay();
          d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); // shift to Monday
          d.setHours(0, 0, 0, 0);
          const key = d.toISOString().split('T')[0]!;
          weekly[key] = (weekly[key] ?? 0) + 1;
        }
        trendData = Object.entries(weekly)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, count]) => ({
            month: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            count,
            amount: 0,
          }));
      } else if (groupBy === 'yearly') {
        const yearly: Record<string, number> = {};
        for (const c of trendClaims) {
          const key = c.createdAt.getFullYear().toString();
          yearly[key] = (yearly[key] ?? 0) + 1;
        }
        trendData = Object.entries(yearly)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([year, count]) => ({ month: year, count, amount: 0 }));
      } else {
        // monthly (default)
        const monthly: Record<string, number> = {};
        for (const c of trendClaims) {
          const key = c.createdAt.toISOString().slice(0, 7);
          monthly[key] = (monthly[key] ?? 0) + 1;
        }
        trendData = Object.entries(monthly)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([ym, count]) => ({
            month: new Date(`${ym}-01`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
            count,
            amount: 0,
          }));
      }

      res.json({
        byStatus: Object.fromEntries(claimsByStatus.map((s) => [s.status, s._count.id])),
        byType: Object.fromEntries(claimsByType.map((t) => [t.type, t._count.id])),
        monthlyTrend: trendData,
        totalClaims: claimsByStatus.reduce((sum, s) => sum + s._count.id, 0),
        paidAmount: payoutSum._sum?.amount ?? 0,
        totalReimbursable: totalReimbursable._sum.reimbursable ?? 0,
        totalClaimAmount: totalReimbursable._sum.totalAmount ?? 0,
        totalPaid: payoutSum._sum?.amount ?? 0,
        totalPayouts: payoutCount,
        hasFilter,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /admin/dashboard-stats:
 *   get:
 *     tags: [Admin]
 *     summary: Dashboard summary counts
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics
 */
router.get(
  '/dashboard-stats',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
      const dateFilter = startDate || endDate
        ? {
            createdAt: {
              ...(startDate ? { gte: new Date(startDate) } : {}),
              ...(endDate ? { lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)) } : {}),
            },
          }
        : {};

      const [
        totalUsers,
        activeClaims,
        pendingPayouts,
        totalReimbursedResult,
        totalPolicies,
        totalPatients,
        totalAdjusters,
        recentActivity,
      ] = await Promise.all([
        prisma.user.count({ where: { isActive: true } }),
        prisma.claim.count({ where: { status: { in: [CLAIM_STATUSES.SUBMITTED, CLAIM_STATUSES.UNDER_REVIEW, CLAIM_STATUSES.INFO_REQUESTED] }, ...dateFilter } }),
        prisma.claim.count({ where: { status: CLAIM_STATUSES.APPROVED, ...dateFilter } }),
        prisma.claim.aggregate({ where: { status: CLAIM_STATUSES.PAID, ...dateFilter }, _sum: { reimbursable: true } }),
        prisma.policy.count({ where: { isActive: true } }),
        prisma.user.count({ where: { role: USER_ROLES.PATIENT, isActive: true } }),
        prisma.user.count({ where: { role: USER_ROLES.ADJUSTER, isActive: true } }),
        prisma.auditLog.findMany({
          take: 8,
          orderBy: { createdAt: 'desc' },
          ...(Object.keys(dateFilter).length ? { where: dateFilter } : {}),
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
          },
        }),
      ]);

      res.json({
        totalUsers,
        activeClaims,
        pendingPayouts,
        totalReimbursed: totalReimbursedResult._sum.reimbursable ?? 0,
        totalPolicies,
        totalPatients,
        totalAdjusters,
        recentActivity,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Adjuster Workload ────────────────────────────────────────────────────────

/**
 * @openapi
 * /admin/adjuster-workload:
 *   get:
 *     tags: [Admin]
 *     summary: Get workload stats for all active adjusters
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of adjuster workload objects with open claims, approval rate, and avg processing hours
 */
router.get(
  '/adjuster-workload',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adjusters = await prisma.user.findMany({
        where: { role: USER_ROLES.ADJUSTER, isActive: true },
        select: { id: true, firstName: true, lastName: true, email: true },
      });

      const workloads = await Promise.all(
        adjusters.map(async (adj) => {
          const [openClaims, closedLast30, approvedCount, rejectedCount, avgDaysData] = await Promise.all([
            prisma.claim.count({
              where: {
                OR: [{ assignedAdjusterId: adj.id }, { adjusterId: adj.id }],
                status: { in: [CLAIM_STATUSES.SUBMITTED, CLAIM_STATUSES.UNDER_REVIEW, CLAIM_STATUSES.INFO_REQUESTED, CLAIM_STATUSES.INFO_RESPONDED, CLAIM_STATUSES.APPEAL_PENDING] },
              },
            }),
            prisma.claim.count({
              where: {
                adjusterId: adj.id,
                status: { in: [CLAIM_STATUSES.APPROVED, CLAIM_STATUSES.REJECTED, CLAIM_STATUSES.PAID] },
                updatedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
              },
            }),
            prisma.claim.count({ where: { adjusterId: adj.id, status: { in: [CLAIM_STATUSES.APPROVED, CLAIM_STATUSES.PAID] } } }),
            prisma.claim.count({ where: { adjusterId: adj.id, status: CLAIM_STATUSES.REJECTED } }),
            prisma.claim.findMany({
              where: { adjusterId: adj.id, status: { in: ['APPROVED', 'PAID'] } },
              select: { id: true },
              take: 50,
              orderBy: { updatedAt: 'desc' },
            }),
          ]);

          const approvedClaimIds = avgDaysData.map((c) => c.id);
          const reviewToApproveHours = approvedClaimIds.length === 0 ? null : await (async () => {
            const events = await prisma.claimEvent.findMany({
              where: {
                claimId: { in: approvedClaimIds },
                toStatus: { in: [CLAIM_STATUSES.UNDER_REVIEW, CLAIM_STATUSES.APPROVED] },
              },
              select: { claimId: true, toStatus: true, createdAt: true },
              orderBy: { createdAt: 'asc' },
            });

            let totalHours = 0;
            let count = 0;
            const byClaimId: Record<string, { underReview?: Date; approved?: Date }> = {};
            for (const e of events) {
              if (!byClaimId[e.claimId]) byClaimId[e.claimId] = {};
              if (e.toStatus === CLAIM_STATUSES.UNDER_REVIEW) byClaimId[e.claimId].underReview = e.createdAt;
              if (e.toStatus === CLAIM_STATUSES.APPROVED) byClaimId[e.claimId].approved = e.createdAt;
            }
            for (const entry of Object.values(byClaimId)) {
              if (entry.underReview && entry.approved) {
                totalHours += (entry.approved.getTime() - entry.underReview.getTime()) / (1000 * 60 * 60);
                count++;
              }
            }
            return count === 0 ? null : Math.round(totalHours / count);
          })();

          return {
            adjuster: adj,
            openClaims,
            closedLast30Days: closedLast30,
            approvalRate: (approvedCount + rejectedCount) === 0 ? 0 : Math.round((approvedCount / (approvedCount + rejectedCount)) * 100),
            avgProcessingHours: reviewToApproveHours,
          };
        })
      );

      res.json(workloads);
    } catch (err) {
      next(err);
    }
  }
);

// ─── Policy Bulk Assignment ───────────────────────────────────────────────────

const bulkAssignSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1),
  planYearType: z.enum([PLAN_YEAR_TYPES.CALENDAR, 'ANNIVERSARY'] as const).default(PLAN_YEAR_TYPES.CALENDAR),
});

/**
 * @openapi
 * /admin/policies/{policyId}/bulk-assign:
 *   post:
 *     tags: [Admin]
 *     summary: Bulk-assign a policy to multiple patients
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: policyId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userIds]
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Bulk assignment results
 */
router.post(
  '/policies/:policyId/bulk-assign',
  validate(bulkAssignSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { policyId } = req.params;
      const { userIds, planYearType } = req.body as z.infer<typeof bulkAssignSchema>;

      const policy = await prisma.policy.findUnique({ where: { id: policyId } });
      if (!policy) { res.status(404).json({ error: 'Policy not found' }); return; }

      const results: { userId: string; status: 'assigned' | 'already_assigned' | 'not_patient' }[] = [];

      for (const userId of userIds) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || user.role !== USER_ROLES.PATIENT) {
          results.push({ userId, status: 'not_patient' });
          continue;
        }

        const existing = await prisma.userPolicy.findUnique({ where: { userId_policyId: { userId, policyId } } });
        if (existing) {
          results.push({ userId, status: 'already_assigned' });
          continue;
        }

        await prisma.userPolicy.create({ data: { userId, policyId, startDate: new Date(), planYearType } });
        results.push({ userId, status: 'assigned' });
      }

      const assigned = results.filter((r) => r.status === 'assigned').length;
      await createAuditLog({ userId: req.user!.id, action: 'BULK_ASSIGN_POLICY', resource: 'Policy', resourceId: policyId, details: { assigned, total: userIds.length }, ipAddress: req.ip });

      res.json({ results, assigned, total: userIds.length });
    } catch (err) {
      next(err);
    }
  }
);

// ─── User Policy Listing ──────────────────────────────────────────────────────

/**
 * @openapi
 * /admin/user-policies:
 *   get:
 *     tags: [Admin]
 *     summary: List all user-policy assignments
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user-policy assignments
 */
router.get(
  '/user-policies',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userPolicies = await prisma.userPolicy.findMany({
        where: { deletedAt: null },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true, isActive: true },
          },
          policy: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      const parsed = userPolicies.map((up) => ({
        ...up,
        policy: {
          ...up.policy,
          benefits: (() => {
            const b = up.policy.benefits;
            if (typeof b === 'string') { try { return JSON.parse(b); } catch { return {}; } }
            return b ?? {};
          })(),
        },
      }));

      res.json(parsed);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /admin/user-policies/{userPolicyId}:
 *   delete:
 *     tags: [Admin]
 *     summary: Remove a user-policy assignment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userPolicyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Assignment removed
 *       404:
 *         description: Assignment not found
 */
const updateUserPolicySchema = z.object({
  payerOrder: z.enum([PAYER_ORDERS.PRIMARY, PAYER_ORDERS.SECONDARY] as const),
});

const bulkRemoveUserPolicySchema = z.object({
  userPolicyIds: z.array(z.string()).min(1, 'At least one assignment ID is required'),
});

/**
 * @openapi
 * /admin/user-policies/{userPolicyId}:
 *   patch:
 *     tags: [Admin]
 *     summary: Update payer order (PRIMARY/SECONDARY) on a user-policy assignment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userPolicyId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [payerOrder]
 *             properties:
 *               payerOrder:
 *                 type: string
 *                 enum: [PRIMARY, SECONDARY]
 *     responses:
 *       200:
 *         description: Payer order updated
 *       404:
 *         description: Assignment not found
 */
router.patch(
  '/user-policies/:userPolicyId',
  validate(updateUserPolicySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userPolicyId: id } = req.params;
      const { payerOrder } = req.body as z.infer<typeof updateUserPolicySchema>;

      const userPolicy = await prisma.userPolicy.findUnique({ where: { id } });
      if (!userPolicy) { res.status(404).json({ error: 'Assignment not found' }); return; }

      const updated = await prisma.userPolicy.update({
        where: { id },
        data: { payerOrder },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } },
          policy: true,
        },
      });

      await createAuditLog({
        userId: req.user!.id,
        action: 'UPDATE_USER_POLICY_PAYER_ORDER',
        resource: 'UserPolicy',
        resourceId: id,
        details: { userId: userPolicy.userId, policyId: userPolicy.policyId, payerOrder },
        ipAddress: req.ip,
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /admin/user-policies/bulk:
 *   delete:
 *     tags: [Admin]
 *     summary: Bulk remove user-policy assignments
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userPolicyIds]
 *             properties:
 *               userPolicyIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Bulk remove processed
 */
router.delete(
  '/user-policies/bulk',
  validate(bulkRemoveUserPolicySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userPolicyIds } = req.body as z.infer<typeof bulkRemoveUserPolicySchema>;

      const userPolicies = await prisma.userPolicy.findMany({
        where: {
          id: { in: userPolicyIds },
          deletedAt: null,
        },
        select: { id: true, userId: true, policyId: true },
      });

      if (userPolicies.length === 0) {
        res.status(400).json({ error: 'No active assignments found for the provided IDs' });
        return;
      }

      const processed: { userPolicyId: string; userId: string; policyId: string }[] = [];
      const errors: { userPolicyId: string; error: string }[] = [];

      for (const up of userPolicies) {
        try {
          await prisma.userPolicy.update({
            where: { id: up.id },
            data: { deletedAt: new Date() },
          });

          processed.push({
            userPolicyId: up.id,
            userId: up.userId,
            policyId: up.policyId,
          });
        } catch (err) {
          errors.push({
            userPolicyId: up.id,
            error: err instanceof Error ? err.message : 'Failed to remove assignment',
          });
        }
      }

      await createAuditLog({
        userId: req.user!.id,
        action: 'BULK_REMOVE_USER_POLICY',
        resource: 'UserPolicy',
        details: { count: processed.length, userPolicyIds },
        ipAddress: req.ip,
      });

      res.json({ processed, errors });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/user-policies/:userPolicyId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userPolicyId: id } = req.params;
      const userPolicy = await prisma.userPolicy.findUnique({ where: { id } });
      if (!userPolicy) { res.status(404).json({ error: 'Assignment not found' }); return; }

      await prisma.userPolicy.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await createAuditLog({
        userId: req.user!.id,
        action: 'REMOVE_USER_POLICY',
        resource: 'UserPolicy',
        resourceId: id,
        details: { userId: userPolicy.userId, policyId: userPolicy.policyId },
        ipAddress: req.ip,
      });

      res.json({ message: 'Policy assignment removed' });
    } catch (err) {
      next(err);
    }
  }
);

// ─── System Settings ─────────────────────────────────────────────────────────

const ALLOWED_SETTINGS = ['autoAssignEnabled', 'diagnosisCodesEnabled', 'cptCodesEnabled', 'outOfNetworkEnabled'] as const;
type SettingKey = (typeof ALLOWED_SETTINGS)[number];

const settingValueSchema = z.object({ value: z.string() });

router.get(
  '/settings',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rows = await prisma.systemSetting.findMany({
        where: { key: { in: [...ALLOWED_SETTINGS] } },
      });

      // Return defaults for any setting not yet stored
      const defaults: Record<SettingKey, string> = {
        autoAssignEnabled: 'false',
        diagnosisCodesEnabled: 'false',
        cptCodesEnabled: 'false',
        outOfNetworkEnabled: 'false',
      };
      const result: Record<string, string> = { ...defaults };
      for (const row of rows) result[row.key] = row.value;

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/settings/:key',
  validate(settingValueSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { key } = req.params;
      if (!(ALLOWED_SETTINGS as readonly string[]).includes(key)) {
        res.status(400).json({ error: 'Unknown setting key' });
        return;
      }
      const { value } = req.body as { value: string };
      const setting = await prisma.systemSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });

      await createAuditLog({
        userId: req.user!.id,
        action: 'UPDATE_SYSTEM_SETTING',
        resource: 'SystemSetting',
        resourceId: key,
        details: { key, value },
        ipAddress: req.ip,
      });

      res.json(setting);
    } catch (err) {
      next(err);
    }
  },
);

export default router;



