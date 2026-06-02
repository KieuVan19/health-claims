import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { requireOwnership } from '../middleware/ownership';
import { validate } from '../middleware/validate';
import { createAuditLog, logRead } from '../utils/audit';
import { createNotification } from '../utils/notification';
import { paginatedResponse } from '../utils/response';
import { generateClaimNumber } from '../utils/claimNumber';
import { parseDateRange, buildSearchWhere } from '../utils/filters';
import { calculateEligible, getDeductiblePaid, getOopPaid, scoreFraud, checkFilingDeadline } from '../services/claims';
import { autoAssignClaim } from '../services/assignment';
import { config } from '../config';
import { generateAndStoreEob } from '../services/eob';
import { getPlanYearStart } from '../utils/planYear';
import {
  sendClaimSubmitted,
  sendClaimApproved,
  sendClaimRejected,
  sendInfoRequested,
  sendAppealDenied,
} from '../services/email';
import {
  CLAIM_STATUSES,
  CLAIM_TYPES,
  CLAIM_TYPES_ARRAY,
  CLAIM_TERMINAL_STATUSES,
  NETWORK_STATUSES,
  CLAIM_LINE_ADJUDICATION_STATUSES,
} from '../constants/enums';

const router = Router();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const ICD10_REGEX = /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/;
const CPT_REGEX = /^\d{5}$/;
const MODIFIER_REGEX = /^[A-Z0-9]{2}$/;

const icd10CodeSchema = z
  .string()
  .regex(ICD10_REGEX, 'Invalid ICD-10 format (e.g. A01, B02.1)');

const claimLineInputSchema = z.object({
  cptCode: z.string().regex(CPT_REGEX, 'CPT code must be exactly 5 digits'),
  modifier: z
    .string()
    .regex(MODIFIER_REGEX, 'Modifier must be 2 uppercase alphanumeric characters')
    .optional(),
  diagnosisPointers: z
    .array(z.number().int().min(0))
    .default([]),
  units: z.number().int().positive('Units must be a positive integer'),
  billedAmount: z.number().positive('Billed amount must be positive'),
});

const createClaimSchema = z.object({
  policyId: z.string().min(1, 'Policy is required'),
  type: z.enum(CLAIM_TYPES_ARRAY),
  description: z.string().min(1, 'Description is required'),
  incidentDate: z.string()
    .transform((v) => new Date(v))
    .refine((d) => d <= new Date(), 'Incident date must be today or in the past'),
  totalAmount: z.number().positive('Amount must be positive'),
  providerId: z.string().optional(),
  diagnosisCodes: z
    .array(icd10CodeSchema)
    .min(0)
    .max(12, 'Maximum 12 diagnosis codes allowed (837 limit)')
    .optional()
    .default([]),
  lines: z
    .array(claimLineInputSchema)
    .min(1, 'At least one line item is required')
    .optional(),
});

const updateClaimSchema = createClaimSchema.partial().extend({
  providerId: z.string().nullable().optional(),
});

const adjudicateLineSchema = z.object({
  adjudicationStatus: z.enum(CLAIM_LINE_ADJUDICATION_STATUSES as unknown as readonly [string, ...string[]]),
  allowedAmount: z.number().positive('Allowed amount must be positive').optional(),
  denialReason: z.string().optional(),
  adjudicatorNote: z.string().optional(),
});

const approveClaimSchema = z.object({
  notes: z.string().optional(),
  eligibleAmount: z.number().positive('Eligible amount must be positive').optional(),
});

const rejectClaimSchema = z.object({
  notes: z.string().min(1, 'Rejection reason is required'),
});

const requestInfoSchema = z.object({
  message: z.string().min(1, 'Message is required'),
});

const respondInfoSchema = z.object({
  response: z.string().optional(),
  infoRequestId: z.string().min(1, 'Info request ID is required'),
});

const assignSchema = z.object({
  adjusterId: z.string().min(1, 'Adjuster ID is required'),
});

const withdrawSchema = z.object({
  reason: z.string().optional(),
});


// ─── Helper ───────────────────────────────────────────────────────────────────

/** Parse the JSON-serialized diagnosisCodes string into a string[] for API responses. */
function parseDiagnosisCodes<T extends { diagnosisCodes: string }>(claim: T): Omit<T, 'diagnosisCodes'> & { diagnosisCodes: string[] } {
  let codes: string[] = [];
  try { codes = JSON.parse(claim.diagnosisCodes) as string[]; } catch { codes = []; }
  return { ...claim, diagnosisCodes: codes };
}

const claimInclude = {
  patient: { select: { id: true, email: true, firstName: true, lastName: true } },
  adjuster: { select: { id: true, email: true, firstName: true, lastName: true } },
  assignedAdjuster: { select: { id: true, email: true, firstName: true, lastName: true } },
  policy: true,
  provider: true,
  documents: true,
  lines: { orderBy: { lineNumber: 'asc' as const } },
  events: {
    include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  infoRequests: {
    include: { from: { select: { id: true, firstName: true, lastName: true, role: true } } },
    orderBy: { createdAt: 'desc' as const },
  },
  payout: true,
  cobDetail: true,
  secondaryClaim: {
    select: { id: true, claimNumber: true, status: true, reimbursable: true, payout: true },
  },
  primaryClaim: {
    select: { id: true, claimNumber: true, status: true, reimbursable: true, payout: true },
  },
};

type SlaStatus = 'ON_TRACK' | 'AT_RISK' | 'BREACHED';

/** Days a claim has been open (from creation, or since last status change for terminal states) */
function getDaysOpen(claim: { createdAt: Date; status: string; updatedAt: Date }): number {
  const reference = CLAIM_TERMINAL_STATUSES.includes(claim.status as any)
    ? claim.updatedAt
    : new Date();
  return Math.floor((reference.getTime() - claim.createdAt.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Compute SLA age and status from the time a claim entered SUBMITTED status.
 * For terminal claims (PAID, REJECTED, WITHDRAWN, APPEAL_DENIED) we return null — SLA no longer active.
 */
function computeSlaMeta(
  claim: { status: string },
  submittedAt: Date | null,
): { ageDays: number; slaStatus: SlaStatus } | null {
  if (CLAIM_TERMINAL_STATUSES.includes(claim.status as any) || !submittedAt) return null;
  const ageDays = Math.floor((Date.now() - submittedAt.getTime()) / (1000 * 60 * 60 * 24));
  const { adjudicationDays, warningWindowDays } = config.sla;
  let slaStatus: SlaStatus;
  if (ageDays > adjudicationDays) {
    slaStatus = 'BREACHED';
  } else if (ageDays >= adjudicationDays - warningWindowDays) {
    slaStatus = 'AT_RISK';
  } else {
    slaStatus = 'ON_TRACK';
  }
  return { ageDays, slaStatus };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /claims:
 *   get:
 *     tags: [Claims]
 *     summary: List claims (role-filtered — patients see own; adjusters see assigned)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, SUBMITTED, UNDER_REVIEW, INFO_REQUESTED, INFO_RESPONDED, APPROVED, REJECTED, PAID, WITHDRAWN]
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [HOSPITALIZATION, OUTPATIENT, DENTAL, VISION, PHARMACY]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: unassigned
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *     responses:
 *       200:
 *         description: Paginated list of claims
 */
/** GET /claims — list claims */
router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { role, id: userId } = req.user!;
      const {
        status,
        type,
        search,
        unassigned,
        myAppeals,
        history,
        dateFrom,
        dateTo,
        page = '1',
        limit = '10',
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = req.query as Record<string, string>;

      const pageNum = Math.max(1, parseInt(page, 10));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
      const skip = (pageNum - 1) * limitNum;

      const where: Record<string, unknown> = {};
      if (role === 'PATIENT') where['patientId'] = userId;
      if (role === 'ADJUSTER' && myAppeals === 'true') {
        // All appeals on claims this adjuster originally rejected — regardless of current status
        where['originalAdjudicatorId'] = userId;
      } else if (role === 'ADJUSTER' && history === 'true') {
        where['adjusterId'] = userId;
        where['status'] = { in: ['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID', 'WITHDRAWN', 'APPEAL_DENIED'] };
      } else if (role === 'ADJUSTER' && unassigned === 'true') {
        // Show claims with no auto-assignment and no active adjuster
        where['adjusterId'] = null;
        where['assignedAdjusterId'] = null;
        where['status'] = { in: ['SUBMITTED', 'APPEAL_PENDING'] };
        // Exclude appeal claims that this adjuster originally rejected — they cannot self-assign
        where['AND'] = [
          { OR: [{ originalAdjudicatorId: null }, { originalAdjudicatorId: { not: userId } }] },
        ];
      } else if (role === 'ADJUSTER') {
        // "Mine" tab: claims auto-assigned to this adjuster OR actively assigned for review
        where['OR'] = [{ assignedAdjusterId: userId }, { adjusterId: userId }];
        if (status) {
          where['status'] = status;
        } else {
          // Default: only claims actively being processed
          where['status'] = { in: ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED', 'INFO_RESPONDED', 'APPEAL_PENDING'] };
        }
      } else if (status) {
        where['status'] = status;
      } else if (role !== 'PATIENT') {
        where['status'] = { not: 'DRAFT' };
      }
      if (type) where['type'] = type;

      const dateFilter = parseDateRange(dateFrom, dateTo);
      if (dateFilter) where['incidentDate'] = dateFilter;

      const searchWhere = buildSearchWhere(search, ['claimNumber', 'description', 'patient.firstName', 'patient.lastName']);
      if (searchWhere) where['OR'] = searchWhere.OR;

      const validSortFields = ['createdAt', 'updatedAt', 'totalAmount', 'status', 'claimNumber', 'incidentDate'];
      const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
      const order = sortOrder === 'asc' ? 'asc' : 'desc';

      const [total, claims] = await Promise.all([
        prisma.claim.count({ where }),
        prisma.claim.findMany({
          where,
          include: {
            patient: { select: { id: true, email: true, firstName: true, lastName: true } },
            adjuster: { select: { id: true, email: true, firstName: true, lastName: true } },
            assignedAdjuster: { select: { id: true, email: true, firstName: true, lastName: true } },
            policy: { select: { id: true, name: true, type: true } },
            payout: { select: { id: true, amount: true, paymentRef: true, paidAt: true } },
            _count: { select: { documents: true } },
          },
          orderBy: { [sortField]: order },
          skip,
          take: limitNum,
        }),
      ]);

      // Batch-fetch the earliest SUBMITTED event per claim to derive submittedAt
      const claimIds = claims.map((c) => c.id);
      const submittedEvents = claimIds.length > 0
        ? await prisma.claimEvent.findMany({
            where: { claimId: { in: claimIds }, toStatus: 'SUBMITTED' },
            orderBy: { createdAt: 'asc' },
            select: { claimId: true, createdAt: true },
          })
        : [];
      const submittedAtByClaim = new Map<string, Date>();
      for (const ev of submittedEvents) {
        if (!submittedAtByClaim.has(ev.claimId)) {
          submittedAtByClaim.set(ev.claimId, ev.createdAt);
        }
      }

      const claimsWithSla = claims.map((c) => {
        const submittedAt = submittedAtByClaim.get(c.id) ?? null;
        const slaMeta = computeSlaMeta(c, submittedAt);
        return {
          ...c,
          daysOpen: getDaysOpen(c),
          submittedAt: submittedAt?.toISOString() ?? null,
          ageDays: slaMeta?.ageDays ?? null,
          slaStatus: slaMeta?.slaStatus ?? null,
        };
      });

      res.json(paginatedResponse(claimsWithSla, total, pageNum, limitNum));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /claims:
 *   post:
 *     tags: [Claims]
 *     summary: Create a draft claim (Patient only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [policyId, type, description, incidentDate, totalAmount]
 *             properties:
 *               policyId: { type: string }
 *               type:
 *                 type: string
 *                 enum: [HOSPITALIZATION, OUTPATIENT, DENTAL, VISION, PHARMACY]
 *               description: { type: string }
 *               incidentDate: { type: string, format: date }
 *               totalAmount: { type: number }
 *     responses:
 *       201:
 *         description: Draft claim created
 *       400:
 *         description: Validation error or coverage exceeded
 *       409:
 *         description: Duplicate claim detected
 */
/** POST /claims — create draft claim */
router.post(
  '/',
  authenticate,
  requireRole('PATIENT'),
  validate(createClaimSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = req.body as z.infer<typeof createClaimSchema>;

      const userPolicy = await prisma.userPolicy.findUnique({
        where: { userId_policyId: { userId: req.user!.id, policyId: data.policyId } },
        include: { policy: true },
      });

      if (!userPolicy) {
        res.status(400).json({ error: 'You do not have access to this policy' });
        return;
      }

      // 1.6 Policy expiry check
      if (new Date(userPolicy.policy.expiryDate) < new Date()) {
        res.status(400).json({ error: 'This policy has expired. You cannot submit claims against an expired policy.' });
        return;
      }

      // 1.5 Coverage limit check — sum approved + paid claims for this policy this year
      const yearStart = new Date(new Date().getFullYear(), 0, 1);
      const usedCoverageAgg = await prisma.claim.aggregate({
        where: {
          patientId: req.user!.id,
          policyId: data.policyId,
          status: { in: ['APPROVED', 'PARTIALLY_APPROVED', 'PAID'] },
          createdAt: { gte: yearStart },
        },
        _sum: { totalAmount: true },
      });
      const usedCoverage = usedCoverageAgg._sum.totalAmount ?? 0;

      if (usedCoverage + data.totalAmount > userPolicy.policy.coverageAmount) {
        const remaining = Math.max(0, userPolicy.policy.coverageAmount - usedCoverage);
        res.status(400).json({
          error: `This claim would exceed your annual coverage limit. Remaining coverage: $${remaining.toFixed(2)}`,
          remainingCoverage: remaining,
        });
        return;
      }

      // Per-type limit check
      const benefits = JSON.parse((userPolicy.policy.benefits as string) || '{}') as Record<string, { limit?: number }>;
      const typeKey = data.type.toLowerCase();
      const typeBenefit = benefits[typeKey];
      if (typeBenefit?.limit !== undefined) {
        const usedTypeAgg = await prisma.claim.aggregate({
          where: {
            patientId: req.user!.id,
            policyId: data.policyId,
            type: data.type,
            status: { in: ['APPROVED', 'PARTIALLY_APPROVED', 'PAID'] },
            createdAt: { gte: yearStart },
          },
          _sum: { totalAmount: true },
        });
        const usedTypeAmount = usedTypeAgg._sum.totalAmount ?? 0;
        if (usedTypeAmount + data.totalAmount > typeBenefit.limit) {
          const remaining = Math.max(0, typeBenefit.limit - usedTypeAmount);
          const typeLabel = data.type.charAt(0) + data.type.slice(1).toLowerCase();
          res.status(400).json({
            error: `This claim would exceed your annual ${typeLabel} coverage limit of $${typeBenefit.limit.toFixed(2)}. Remaining ${typeLabel} coverage: $${remaining.toFixed(2)}`,
            remainingTypeCoverage: remaining,
          });
          return;
        }
      }

      // 2.3 Duplicate detection — same type and incident date within 24h window
      const oneDayAgo = new Date(data.incidentDate.getTime() - 24 * 60 * 60 * 1000);
      const oneDayAfter = new Date(data.incidentDate.getTime() + 24 * 60 * 60 * 1000);
      const potentialDuplicate = await prisma.claim.findFirst({
        where: {
          patientId: req.user!.id,
          policyId: data.policyId,
          type: data.type,
          incidentDate: { gte: oneDayAgo, lte: oneDayAfter },
          totalAmount: data.totalAmount,
          status: { notIn: ['REJECTED', 'WITHDRAWN'] },
        },
        select: { claimNumber: true },
      });

      if (potentialDuplicate) {
        res.status(409).json({
          error: `A similar claim (${potentialDuplicate.claimNumber}) already exists for this incident date and type. Please check your existing claims.`,
          duplicate: true,
        });
        return;
      }

      const planYearStart = getPlanYearStart(
        { startDate: userPolicy.startDate, planYearType: userPolicy.planYearType },
        data.incidentDate,
      );

      // Derive network status from the provider record; default to IN-network when no provider
      let networkStatus: 'IN' | 'OUT' = 'IN';
      if (data.providerId) {
        const prov = await prisma.provider.findUnique({ where: { id: data.providerId }, select: { inNetwork: true } });
        if (prov && !prov.inNetwork) networkStatus = 'OUT';
      }

      const [deductiblePaid, oopPaid] = await Promise.all([
        getDeductiblePaid(req.user!.id, data.policyId, planYearStart, undefined, networkStatus),
        getOopPaid(req.user!.id, data.policyId, planYearStart, undefined, networkStatus),
      ]);
      const { eligibleAmount, deductible, reimbursable } = calculateEligible(data.totalAmount, userPolicy.policy, deductiblePaid, oopPaid, networkStatus);
      const claimNumber = await generateClaimNumber();

      // 4.5 Fraud scoring
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const monthStart = new Date(data.incidentDate.getFullYear(), data.incidentDate.getMonth(), 1);
      const monthEnd = new Date(data.incidentDate.getFullYear(), data.incidentDate.getMonth() + 1, 0);

      const [recentCount, sameTypeMonthCount] = await Promise.all([
        prisma.claim.count({
          where: { patientId: req.user!.id, createdAt: { gte: thirtyDaysAgo } },
        }),
        prisma.claim.count({
          where: {
            patientId: req.user!.id,
            type: data.type,
            incidentDate: { gte: monthStart, lte: monthEnd },
            status: { notIn: ['REJECTED', 'WITHDRAWN'] },
          },
        }),
      ]);

      const { score: fraudScore, flags: fraudFlagsList } = scoreFraud(
        data.totalAmount,
        data.type,
        usedCoverage,
        userPolicy.policy.coverageAmount,
        recentCount,
        sameTypeMonthCount,
      );

      // Validate providerId if supplied — must exist in DB
      if (data.providerId) {
        const providerExists = await prisma.provider.findUnique({ where: { id: data.providerId }, select: { id: true } });
        if (!providerExists) {
          res.status(400).json({ error: 'Provider not found' });
          return;
        }
      }

      // Validate diagnosisPointers reference valid indices into diagnosisCodes
      const diagCodes = data.diagnosisCodes ?? [];
      if (data.lines && data.lines.length > 0) {
        for (const [i, line] of data.lines.entries()) {
          for (const ptr of line.diagnosisPointers) {
            if (ptr >= diagCodes.length) {
              res.status(400).json({ error: `Line ${i + 1}: diagnosisPointer ${ptr} references a non-existent diagnosis code index` });
              return;
            }
          }
        }
      }

      const totalBilled = data.lines && data.lines.length > 0
        ? data.lines.reduce((sum, l) => sum + l.billedAmount, 0)
        : undefined;

      const claim = await prisma.claim.create({
        data: {
          claimNumber,
          patientId: req.user!.id,
          policyId: data.policyId,
          type: data.type,
          description: data.description,
          incidentDate: data.incidentDate,
          totalAmount: totalBilled ?? data.totalAmount,
          totalBilled: totalBilled ?? null,
          eligibleAmount,
          deductible,
          reimbursable,
          status: 'DRAFT',
          networkStatus,
          fraudScore,
          fraudFlags: JSON.stringify(fraudFlagsList),
          diagnosisCodes: JSON.stringify(diagCodes),
          planYearStart,
          ...(data.providerId ? { providerId: data.providerId } : {}),
        },
        include: claimInclude,
      });

      if (data.lines && data.lines.length > 0) {
        await prisma.claimLine.createMany({
          data: data.lines.map((line, idx) => ({
            claimId: claim.id,
            lineNumber: idx + 1,
            cptCode: line.cptCode,
            modifier: line.modifier ?? null,
            diagnosisPointers: JSON.stringify(line.diagnosisPointers),
            units: line.units,
            billedAmount: line.billedAmount,
            adjudicationStatus: 'PENDING',
          })),
        });
      }

      await prisma.claimEvent.create({
        data: {
          claimId: claim.id,
          userId: req.user!.id,
          action: 'CREATED',
          toStatus: 'DRAFT',
          note: 'Claim created as draft',
        },
      });

      await createAuditLog({ userId: req.user!.id, action: 'CREATE_CLAIM', resource: 'Claim', resourceId: claim.id, details: { claimNumber }, ipAddress: req.ip });

      // Reload to include newly created lines
      const claimWithLines = await prisma.claim.findUnique({ where: { id: claim.id }, include: claimInclude });
      res.status(201).json(parseDiagnosisCodes(claimWithLines!));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /claims/{id}:
 *   get:
 *     tags: [Claims]
 *     summary: Get claim detail
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
 *         description: Claim detail with events, documents, info requests
 *       404:
 *         description: Claim not found
 */
/** GET /claims/:id — get claim detail */
router.get(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const claim = await prisma.claim.findUnique({
        where: { id: req.params['id'] },
        include: claimInclude,
      });

      if (!claim) {
        res.status(404).json({ error: 'Claim not found' });
        return;
      }

      if (req.user!.role === 'PATIENT' && claim.patientId !== req.user!.id) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const isOwn = req.user!.role === 'PATIENT' && claim.patientId === req.user!.id;
      logRead(req.user!.id, 'Claim', claim.id, req, isOwn);

      // Derive submittedAt and ack SLA from events already included in the claim
      const submittedEvent = claim.events.find((e) => e.toStatus === 'SUBMITTED');
      const underReviewEvent = claim.events.find((e) => e.toStatus === 'UNDER_REVIEW');
      const submittedAt = submittedEvent?.createdAt ?? null;
      const ackDays = (submittedAt && underReviewEvent)
        ? Math.floor((underReviewEvent.createdAt.getTime() - submittedAt.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      const ackSlaBreached = ackDays !== null && ackDays > config.sla.ackDays;
      const slaMeta = computeSlaMeta(claim, submittedAt);

      res.json(parseDiagnosisCodes({
        ...claim,
        daysOpen: getDaysOpen(claim),
        submittedAt: submittedAt?.toISOString() ?? null,
        ageDays: slaMeta?.ageDays ?? null,
        slaStatus: slaMeta?.slaStatus ?? null,
        ackDays,
        ackSlaBreached,
      }));
    } catch (err) {
      next(err);
    }
  }
);

/** GET /claims/:id/type-summary — per-type usage for adjuster review */
router.get(
  '/:id/type-summary',
  authenticate,
  requireRole('ADJUSTER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const claim = await prisma.claim.findUnique({
        where: { id: req.params['id'] },
        include: { policy: true },
      });

      if (!claim) {
        res.status(404).json({ error: 'Claim not found' });
        return;
      }

      const claimTypes = ['HOSPITALIZATION', 'OUTPATIENT', 'DENTAL', 'VISION', 'PHARMACY'] as const;
      const benefits = JSON.parse((claim.policy.benefits as string) || '{}') as Record<string, { limit?: number }>;
      const yearStart = new Date(new Date().getFullYear(), 0, 1);

      const typeUsages = await Promise.all(
        claimTypes.map(async (type) => {
          const agg = await prisma.claim.aggregate({
            where: {
              patientId: claim.patientId,
              policyId: claim.policyId,
              type,
              status: { in: ['APPROVED', 'PARTIALLY_APPROVED', 'PAID'] },
              createdAt: { gte: yearStart },
              NOT: { id: claim.id },
            },
            _sum: { totalAmount: true },
          });
          const usedAmount = agg._sum.totalAmount ?? 0;
          const limit = benefits[type.toLowerCase()]?.limit ?? null;
          return {
            type,
            limit,
            usedAmount,
            remainingAmount: limit !== null ? Math.max(0, limit - usedAmount) : null,
            isCurrentType: type === claim.type,
          };
        })
      );

      res.json({
        claimType: claim.type,
        claimAmount: claim.totalAmount,
        typeUsages,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /claims/{id}/eob:
 *   get:
 *     tags: [Claims]
 *     summary: Download Explanation of Benefits PDF (PAID claims only)
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
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Claim is not PAID
 */
/** GET /claims/:id/eob — download Explanation of Benefits PDF */
router.get(
  '/:id/eob',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const claim = await prisma.claim.findUnique({
        where: { id: req.params['id'] },
        include: {
          patient: true,
          policy: true,
          payout: { include: { processor: { select: { firstName: true, lastName: true } } } },
          adjuster: { select: { firstName: true, lastName: true } },
        },
      });

      if (!claim) {
        res.status(404).json({ error: 'Claim not found' });
        return;
      }

      if (req.user!.role === 'PATIENT' && claim.patientId !== req.user!.id) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      if (!['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID'].includes(claim.status)) {
        res.status(400).json({ error: 'EOB is only available for APPROVED, PARTIALLY_APPROVED, REJECTED, or PAID claims' });
        return;
      }

      // Serve from the stored EOB document if available; otherwise generate on the fly
      const storedEob = await prisma.document.findFirst({
        where: { claimId: claim.id, type: 'EOB' },
        orderBy: { createdAt: 'desc' },
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="EOB-${claim.claimNumber}.pdf"`);

      if (storedEob && fs.existsSync(storedEob.path)) {
        res.sendFile(path.resolve(storedEob.path));
        return;
      }

      // Fallback: generate on the fly (handles legacy PAID claims without a stored EOB)
      const pdfDoc = new PDFDocument({ margin: 50 });
      pdfDoc.pipe(res);

      pdfDoc.fontSize(20).font('Helvetica-Bold').text('Explanation of Benefits', { align: 'center' });
      pdfDoc.moveDown(0.5);
      pdfDoc.fontSize(10).font('Helvetica').text('Health Claims Portal', { align: 'center' });
      pdfDoc.text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, { align: 'center' });
      pdfDoc.text(`Status: ${claim.status}`, { align: 'center' });

      pdfDoc.moveDown(1.5);
      pdfDoc.moveTo(50, pdfDoc.y).lineTo(550, pdfDoc.y).stroke();
      pdfDoc.moveDown(1);

      pdfDoc.fontSize(12).font('Helvetica-Bold').text('Member Information');
      pdfDoc.fontSize(10).font('Helvetica');
      pdfDoc.text(`Name: ${claim.patient.firstName} ${claim.patient.lastName}`);
      pdfDoc.text(`Member ID: ${claim.patient.id}`);
      pdfDoc.text(`Email: ${claim.patient.email}`);
      pdfDoc.text(`Policy: ${claim.policy.name} (${claim.policy.type})`);
      pdfDoc.text(`Policy Number: ${claim.policy.id}`);
      pdfDoc.moveDown(1);

      pdfDoc.fontSize(12).font('Helvetica-Bold').text('Claim Details');
      pdfDoc.fontSize(10).font('Helvetica');
      pdfDoc.text(`Claim Number: ${claim.claimNumber}`);
      pdfDoc.text(`Claim Type: ${claim.type}`);
      pdfDoc.text(`Date of Service: ${new Date(claim.incidentDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
      pdfDoc.text(`Provider: ${claim.description}`);
      const fallbackNetworkLabel = claim.networkStatus === 'OUT' ? 'Out-of-Network' : 'In-Network';
      const fallbackCopayRate = claim.networkStatus === 'OUT' ? (claim.policy.oonCopayPercent ?? claim.policy.copayPercentage) : claim.policy.copayPercentage;
      pdfDoc.text(`Network Tier: ${fallbackNetworkLabel}`);
      pdfDoc.text(`Applied Copay Rate: ${fallbackCopayRate}%`);
      if (claim.adjuster) {
        pdfDoc.text(`Reviewed By: ${claim.adjuster.firstName} ${claim.adjuster.lastName}`);
      }
      pdfDoc.moveDown(1);

      if (claim.status === 'REJECTED' && claim.adjusterNotes) {
        pdfDoc.fontSize(12).font('Helvetica-Bold').fillColor('#cc0000').text('Denial Information');
        pdfDoc.fontSize(10).font('Helvetica').fillColor('black');
        pdfDoc.text(`Denial Reason: ${claim.adjusterNotes}`);
        pdfDoc.moveDown(1);
      }

      pdfDoc.fontSize(12).font('Helvetica-Bold').fillColor('black').text('Financial Summary');
      pdfDoc.moveDown(0.5);

      const tableLeft = 50;
      const tableRight = 400;
      const rowHeight = 20;
      let y = pdfDoc.y;

      const drawRow = (label: string, value: string, bold = false) => {
        pdfDoc.fontSize(10).font(bold ? 'Helvetica-Bold' : 'Helvetica');
        pdfDoc.text(label, tableLeft, y);
        pdfDoc.text(value, tableRight, y, { align: 'right' });
        y += rowHeight;
      };

      const eligible = claim.eligibleAmount ?? 0;
      const ded = claim.deductible ?? 0;
      const reimb = claim.reimbursable ?? 0;
      const copayAmount = Math.max(0, eligible - ded - reimb);
      const insurancePaid = claim.status === 'REJECTED' ? 0 : (claim.adjustedAmount ?? reimb);
      const patientResponsibility = claim.status === 'REJECTED' ? claim.totalAmount : Math.max(0, claim.totalAmount - insurancePaid);

      const fallbackCopayLabel = claim.networkStatus === 'OUT' ? ` OON (${fallbackCopayRate}%)` : ` (${fallbackCopayRate}%)`;
      drawRow('Billed Amount:', `$${claim.totalAmount.toFixed(2)}`);
      drawRow('Allowed Amount (post-deductible base):', `$${eligible.toFixed(2)}`);
      drawRow('Deductible Applied:', `-$${ded.toFixed(2)}`);
      drawRow(`Co-pay${fallbackCopayLabel}:`, `-$${copayAmount.toFixed(2)}`);

      pdfDoc.moveTo(tableLeft, y).lineTo(550, y).stroke();
      y += 5;
      drawRow('Insurance Paid:', `$${insurancePaid.toFixed(2)}`, true);
      drawRow('Patient Responsibility:', `$${patientResponsibility.toFixed(2)}`, true);

      pdfDoc.y = y + 10;
      pdfDoc.moveDown(1);

      if (claim.payout) {
        pdfDoc.fontSize(12).font('Helvetica-Bold').text('Payment Information');
        pdfDoc.fontSize(10).font('Helvetica');
        pdfDoc.text(`Amount Paid: $${claim.payout.amount.toFixed(2)}`);
        pdfDoc.text(`Payment Reference: ${claim.payout.paymentRef}`);
        pdfDoc.text(`Payment Date: ${new Date(claim.payout.paidAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
        if (claim.payout.notes) pdfDoc.text(`Notes: ${claim.payout.notes}`);
        if (claim.payout.processor) {
          pdfDoc.text(`Processed By: ${claim.payout.processor.firstName} ${claim.payout.processor.lastName}`);
        }
      }

      pdfDoc.moveDown(2);
      pdfDoc.fontSize(8).font('Helvetica').fillColor('#888888');
      pdfDoc.text('This document is an official Explanation of Benefits under ACA §2715. Please retain for your records.', { align: 'center' });
      pdfDoc.text('For questions, contact your insurance administrator.', { align: 'center' });

      pdfDoc.end();
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /claims/{id}:
 *   put:
 *     tags: [Claims]
 *     summary: Update a DRAFT claim (Patient only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [HOSPITALIZATION, OUTPATIENT, DENTAL, VISION, PHARMACY]
 *               description: { type: string }
 *               incidentDate: { type: string, format: date }
 *               totalAmount: { type: number }
 *     responses:
 *       200:
 *         description: Claim updated
 *       400:
 *         description: Claim is not in DRAFT status
 */
/** PUT /claims/:id — update DRAFT claim */
router.put(
  '/:id',
  authenticate,
  requireRole('PATIENT'),
  requireOwnership('claim'),
  validate(updateClaimSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const claim = req.resource;

      if (claim.status !== 'DRAFT') { res.status(400).json({ error: 'Only DRAFT claims can be updated' }); return; }

      const data = req.body as z.infer<typeof updateClaimSchema>;

      // Determine effective networkStatus: new provider overrides stored value
      let networkStatus: 'IN' | 'OUT' = (claim.networkStatus as 'IN' | 'OUT') ?? 'IN';
      if ('providerId' in data) {
        if (!data.providerId) {
          networkStatus = 'IN';
        } else {
          const prov = await prisma.provider.findUnique({ where: { id: data.providerId }, select: { inNetwork: true } });
          networkStatus = prov && !prov.inNetwork ? 'OUT' : 'IN';
        }
      }

      let eligibleAmount = claim.eligibleAmount;
      let deductible = claim.deductible;
      let reimbursable = claim.reimbursable;

      if (data.totalAmount !== undefined) {
        const yearStart = claim.planYearStart ?? new Date(new Date().getFullYear(), 0, 1);
        const [deductiblePaid, oopPaid] = await Promise.all([
          getDeductiblePaid(claim.patientId, claim.policyId, yearStart, claim.id, networkStatus),
          getOopPaid(claim.patientId, claim.policyId, yearStart, claim.id, networkStatus),
        ]);
        const result = calculateEligible(data.totalAmount, claim.policy, deductiblePaid, oopPaid, networkStatus);
        eligibleAmount = result.eligibleAmount;
        deductible = result.deductible;
        reimbursable = result.reimbursable;
      }

      let planYearStart: Date | undefined;
      if (data.incidentDate !== undefined) {
        const userPolicy = await prisma.userPolicy.findUnique({
          where: { userId_policyId: { userId: req.user!.id, policyId: claim.policyId } },
        });
        if (userPolicy) {
          planYearStart = getPlanYearStart(
            { startDate: userPolicy.startDate, planYearType: userPolicy.planYearType },
            data.incidentDate,
          );
        }
      }

      const updated = await prisma.claim.update({
        where: { id: claim.id },
        data: {
          ...(data.type !== undefined && { type: data.type }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.incidentDate !== undefined && { incidentDate: data.incidentDate }),
          ...(data.totalAmount !== undefined && { totalAmount: data.totalAmount, eligibleAmount, deductible, reimbursable }),
          ...(planYearStart !== undefined && { planYearStart }),
          ...('providerId' in data && { providerId: data.providerId ?? null, networkStatus }),
          ...(data.diagnosisCodes !== undefined && { diagnosisCodes: JSON.stringify(data.diagnosisCodes) }),
        },
        include: claimInclude,
      });

      res.json(parseDiagnosisCodes(updated));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /claims/{id}:
 *   delete:
 *     tags: [Claims]
 *     summary: Delete a DRAFT claim (Patient only)
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
 *         description: Claim deleted
 *       400:
 *         description: Claim is not in DRAFT status
 */
/** DELETE /claims/:id — delete DRAFT claim */
router.delete(
  '/:id',
  authenticate,
  requireRole('PATIENT'),
  requireOwnership('claim'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const claim = req.resource;
      if (claim.status !== 'DRAFT') { res.status(400).json({ error: 'Only DRAFT claims can be deleted' }); return; }

      await prisma.claim.delete({ where: { id: claim.id } });
      await createAuditLog({ userId: req.user!.id, action: 'DELETE_CLAIM', resource: 'Claim', resourceId: claim.id, details: { claimNumber: claim.claimNumber }, ipAddress: req.ip });

      res.json({ message: 'Claim deleted successfully' });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /claims/{id}/submit:
 *   post:
 *     tags: [Claims]
 *     summary: Submit a DRAFT claim for review (Patient only)
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
 *         description: Claim submitted
 *       400:
 *         description: Claim is not in DRAFT status or policy expired
 */
/** POST /claims/:id/submit — submit DRAFT */
router.post(
  '/:id/submit',
  authenticate,
  requireRole('PATIENT'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const claim = await prisma.claim.findUnique({
        where: { id: req.params['id'] },
        include: { patient: true, policy: true, provider: { select: { specialty: true } } },
      });

      if (!claim) { res.status(404).json({ error: 'Claim not found' }); return; }
      if (claim.patientId !== req.user!.id) { res.status(403).json({ error: 'Access denied' }); return; }
      if (claim.status !== 'DRAFT') { res.status(400).json({ error: 'Only DRAFT claims can be submitted' }); return; }

      // 1.6 Re-check policy expiry on submit
      if (new Date(claim.policy.expiryDate) < new Date()) {
        res.status(400).json({ error: 'Policy has expired. Cannot submit this claim.' });
        return;
      }

      // HC-004: Filing deadline enforcement (skip if admin has already granted an override)
      if (!claim.filingDeadlineOverride) {
        const deadlineCheck = checkFilingDeadline(
          new Date(claim.incidentDate),
          new Date(),
          claim.policy.filingDeadlineDays,
        );
        if (!deadlineCheck.withinDeadline) {
          res.status(422).json({
            error: `Claim filing deadline exceeded. Claims for this policy must be filed within ${deadlineCheck.deadlineDays} days of the incident date.`,
            code: 'FILING_DEADLINE_EXCEEDED',
            deadlineDays: deadlineCheck.deadlineDays,
            daysSinceIncident: deadlineCheck.daysSinceIncident,
          });
          return;
        }
      }

      // HC-013: detect COB scenario — patient has both a PRIMARY and SECONDARY active policy
      const activeUserPolicies = await prisma.userPolicy.findMany({
        where: { userId: req.user!.id },
        include: { policy: true },
      });
      const hasPrimary = activeUserPolicies.some((up) => up.payerOrder === 'PRIMARY' && new Date(up.policy.expiryDate) >= new Date());
      const hasSecondary = activeUserPolicies.some((up) => up.payerOrder === 'SECONDARY' && new Date(up.policy.expiryDate) >= new Date());
      const cobFlag = hasPrimary && hasSecondary;

      const updated = await prisma.claim.update({
        where: { id: claim.id },
        data: { status: 'SUBMITTED', cobFlag },
        include: claimInclude,
      });

      await prisma.claimEvent.create({
        data: { claimId: claim.id, userId: req.user!.id, action: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' },
      });

      // HC-011: auto-assign to an adjuster on submission; fire-and-forget so submission is never blocked
      autoAssignClaim(claim.id, claim.claimNumber, req.user!.id, claim.provider?.specialty).catch((err: unknown) => {
        console.error('[Assignment] Auto-assign failed for claim', claim.claimNumber, err);
      });

      const adjusters = await prisma.user.findMany({ where: { role: 'ADJUSTER', isActive: true }, select: { id: true } });
      await Promise.all(
        adjusters.map((a) =>
          createNotification({ userId: a.id, title: 'New Claim Submitted', message: `Claim ${claim.claimNumber} has been submitted and awaits assignment.`, type: 'info', link: `/adjuster/claims/${claim.id}`, prefKey: 'claimSubmitted' })
        )
      );

      await createNotification({ userId: claim.patientId, title: 'Claim Submitted', message: `Your claim ${claim.claimNumber} has been submitted and is awaiting review.`, type: 'success', link: `/claims/${claim.id}`, prefKey: 'claimSubmitted' });
      await sendClaimSubmitted(claim.patient.email, claim.claimNumber);
      await createAuditLog({ userId: req.user!.id, action: 'SUBMIT_CLAIM', resource: 'Claim', resourceId: claim.id, ipAddress: req.ip });

      res.json(parseDiagnosisCodes(updated));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /claims/{id}/withdraw:
 *   post:
 *     tags: [Claims]
 *     summary: Withdraw a claim (Patient only; allowed in DRAFT or SUBMITTED)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: Claim withdrawn
 *       400:
 *         description: Claim cannot be withdrawn at this stage
 */
/** POST /claims/:id/withdraw — withdraw a SUBMITTED or UNDER_REVIEW claim */
router.post(
  '/:id/withdraw',
  authenticate,
  requireRole('PATIENT'),
  validate(withdrawSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { reason } = req.body as z.infer<typeof withdrawSchema>;
      const claim = await prisma.claim.findUnique({ where: { id: req.params['id'] } });

      if (!claim) { res.status(404).json({ error: 'Claim not found' }); return; }
      if (claim.patientId !== req.user!.id) { res.status(403).json({ error: 'Access denied' }); return; }
      if (!['DRAFT', 'SUBMITTED'].includes(claim.status)) {
        res.status(400).json({ error: 'Claims can only be withdrawn before they reach Under Review' });
        return;
      }

      const updated = await prisma.claim.update({
        where: { id: claim.id },
        data: { status: 'WITHDRAWN', adjusterNotes: reason ? `Withdrawn by patient: ${reason}` : 'Withdrawn by patient' },
        include: claimInclude,
      });

      await prisma.claimEvent.create({
        data: { claimId: claim.id, userId: req.user!.id, action: 'WITHDRAWN', fromStatus: claim.status, toStatus: 'WITHDRAWN', note: reason || 'Withdrawn by patient' },
      });

      if (claim.adjusterId) {
        await createNotification({ userId: claim.adjusterId, title: 'Claim Withdrawn', message: `Claim ${claim.claimNumber} has been withdrawn by the patient.`, type: 'warning', link: `/adjuster/claims/${claim.id}` });
      }

      await createAuditLog({ userId: req.user!.id, action: 'WITHDRAW_CLAIM', resource: 'Claim', resourceId: claim.id, details: { reason }, ipAddress: req.ip });

      res.json(parseDiagnosisCodes(updated));
    } catch (err) {
      next(err);
    }
  }
);


/**
 * @openapi
 * /claims/{id}/assign:
 *   post:
 *     tags: [Claims]
 *     summary: Assign an adjuster to a claim (Adjuster/Admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [adjusterId]
 *             properties:
 *               adjusterId: { type: string }
 *     responses:
 *       200:
 *         description: Adjuster assigned, claim moved to UNDER_REVIEW
 *       400:
 *         description: Invalid adjuster or claim status
 */
/** POST /claims/:id/assign — assign adjuster */
router.post(
  '/:id/assign',
  authenticate,
  requireRole('ADJUSTER', 'ADMIN'),
  validate(assignSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { adjusterId } = req.body as z.infer<typeof assignSchema>;
      const claim = await prisma.claim.findUnique({ where: { id: req.params['id'] } });
      if (!claim) { res.status(404).json({ error: 'Claim not found' }); return; }

      if (!['SUBMITTED', 'UNDER_REVIEW', 'INFO_RESPONDED'].includes(claim.status)) {
        res.status(400).json({ error: 'Claim must be SUBMITTED or UNDER_REVIEW to assign' });
        return;
      }

      const adjuster = await prisma.user.findUnique({ where: { id: adjusterId } });
      if (!adjuster || adjuster.role !== 'ADJUSTER') {
        res.status(400).json({ error: 'Invalid adjuster' });
        return;
      }

      const fromStatus = claim.status;
      const toStatus = 'UNDER_REVIEW';

      const updated = await prisma.claim.update({
        where: { id: claim.id },
        data: { adjusterId, status: toStatus },
        include: claimInclude,
      });

      await prisma.claimEvent.create({
        data: {
          claimId: claim.id,
          userId: req.user!.id,
          action: 'ASSIGNED',
          fromStatus,
          toStatus,
          note: `Assigned to ${adjuster.firstName} ${adjuster.lastName}`,
        },
      });

      await createNotification({ userId: claim.patientId, title: 'Claim Under Review', message: `Your claim ${claim.claimNumber} is now under review.`, type: 'info', link: `/claims/${claim.id}`, prefKey: 'claimUnderReview' });
      await createNotification({ userId: adjusterId, title: 'Claim Assigned to You', message: `Claim ${claim.claimNumber} has been assigned to you for review.`, type: 'info', link: `/adjuster/claims/${claim.id}`, prefKey: 'claimUnderReview' });

      res.json(parseDiagnosisCodes(updated));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /claims/{id}/approve:
 *   post:
 *     tags: [Claims]
 *     summary: Approve a claim (Adjuster/Admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes: { type: string }
 *     responses:
 *       200:
 *         description: Claim approved
 *       400:
 *         description: Claim is not in a reviewable status
 */
/** POST /claims/:id/approve — approve claim */
router.post(
  '/:id/approve',
  authenticate,
  requireRole('ADJUSTER', 'ADMIN'),
  validate(approveClaimSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { notes, eligibleAmount: eligibleAmountOverride } = req.body as z.infer<typeof approveClaimSchema>;
      const claim = await prisma.claim.findUnique({ where: { id: req.params['id'] }, include: { patient: true, policy: true } });

      if (!claim) { res.status(404).json({ error: 'Claim not found' }); return; }
      if (!['UNDER_REVIEW', 'INFO_REQUESTED', 'INFO_RESPONDED', 'APPEAL_PENDING'].includes(claim.status)) {
        res.status(400).json({ error: 'Claim must be UNDER_REVIEW or INFO_REQUESTED to approve' });
        return;
      }

      // Recompute eligibility at adjudication time using the current accumulator state,
      // excluding this claim itself so prior approvals in the same plan year are reflected accurately.
      const planYearStart = claim.planYearStart ?? new Date(new Date().getFullYear(), 0, 1);
      const claimNetworkStatus = (claim.networkStatus as 'IN' | 'OUT') ?? 'IN';
      const [deductiblePaid, oopPaid] = await Promise.all([
        getDeductiblePaid(claim.patientId, claim.policyId, planYearStart, claim.id, claimNetworkStatus),
        getOopPaid(claim.patientId, claim.policyId, planYearStart, claim.id, claimNetworkStatus),
      ]);
      const { eligibleAmount: calculatedEligible } = calculateEligible(claim.totalAmount, claim.policy, deductiblePaid, oopPaid, claimNetworkStatus);

      if (eligibleAmountOverride !== undefined && eligibleAmountOverride > calculatedEligible) {
        res.status(400).json({ error: 'Eligible amount cannot exceed the calculated eligible amount' });
        return;
      }

      const { eligibleAmount, deductible, reimbursable } = calculateEligible(
        claim.totalAmount, claim.policy, deductiblePaid, oopPaid, claimNetworkStatus,
        eligibleAmountOverride,
      );

      const eventNote = eligibleAmountOverride !== undefined
        ? `Eligible amount overridden to $${eligibleAmountOverride.toFixed(2)} (calculated: $${calculatedEligible.toFixed(2)}). ${notes ?? ''}`.trim()
        : notes;

      const finalStatus = reimbursable === 0 ? 'PAID' : 'APPROVED';

      const updated = await prisma.claim.update({
        where: { id: claim.id },
        data: {
          status: finalStatus,
          adjusterNotes: notes,
          eligibleAmount,
          deductible,
          reimbursable,
          adjustedAmount: null,
        },
        include: claimInclude,
      });

      await prisma.claimEvent.create({
        data: { claimId: claim.id, userId: req.user!.id, action: 'APPROVED', fromStatus: claim.status, toStatus: finalStatus, note: eventNote },
      });

      if (reimbursable === 0) {
        await prisma.payout.create({
          data: {
            claimId: claim.id,
            processedBy: req.user!.id,
            amount: 0,
            paymentRef: `ZERO-${claim.claimNumber}`,
            notes: 'Auto-closed: deductible and copay cover full eligible amount',
          },
        });
      }

      await createNotification({ userId: claim.patientId, title: 'Claim Approved', message: `Your claim ${claim.claimNumber} has been approved. Reimbursable: $${reimbursable.toFixed(2)}`, type: 'success', link: `/claims/${claim.id}`, prefKey: 'claimApproved' });

      if (reimbursable > 0) {
        const financeOfficers = await prisma.user.findMany({ where: { role: 'FINANCE_OFFICER', isActive: true }, select: { id: true } });
        await Promise.all(
          financeOfficers.map((f) =>
            createNotification({ userId: f.id, title: 'Claim Awaiting Payment', message: `Claim ${claim.claimNumber} has been approved and is awaiting payment. Amount: $${reimbursable.toFixed(2)}`, type: 'info', link: `/finance/payouts`, prefKey: 'claimApproved' })
          )
        );
      }

      await sendClaimApproved(claim.patient.email, claim.claimNumber, reimbursable);
      await createAuditLog({ userId: req.user!.id, action: 'APPROVE_CLAIM', resource: 'Claim', resourceId: claim.id, ipAddress: req.ip });

      const wasAppealed =
        claim.status === 'APPEAL_PENDING' ||
        !!(await prisma.claimEvent.findFirst({ where: { claimId: claim.id, action: 'APPEAL_RESOLVED' } }));
      generateAndStoreEob(claim.id, req.user!.id, wasAppealed).catch((err: unknown) => {
        console.error('[EOB] Failed to generate EOB for claim', claim.id, err);
      });

      res.json(parseDiagnosisCodes(updated));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /claims/{id}/reject:
 *   post:
 *     tags: [Claims]
 *     summary: Reject a claim (Adjuster/Admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [notes]
 *             properties:
 *               notes: { type: string }
 *     responses:
 *       200:
 *         description: Claim rejected
 *       400:
 *         description: Claim is not in a reviewable status
 */
/** POST /claims/:id/reject — reject claim */
router.post(
  '/:id/reject',
  authenticate,
  requireRole('ADJUSTER', 'ADMIN'),
  validate(rejectClaimSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { notes } = req.body as z.infer<typeof rejectClaimSchema>;
      const claim = await prisma.claim.findUnique({ where: { id: req.params['id'] }, include: { patient: true } });

      if (!claim) { res.status(404).json({ error: 'Claim not found' }); return; }
      if (!['UNDER_REVIEW', 'INFO_REQUESTED', 'INFO_RESPONDED', 'APPEAL_PENDING'].includes(claim.status)) {
        res.status(400).json({ error: 'Claim must be UNDER_REVIEW or INFO_REQUESTED to reject' });
        return;
      }

      const updated = await prisma.claim.update({
        where: { id: claim.id },
        data: { status: 'REJECTED', adjusterNotes: notes },
        include: claimInclude,
      });

      await prisma.claimEvent.create({
        data: { claimId: claim.id, userId: req.user!.id, action: 'REJECTED', fromStatus: claim.status, toStatus: 'REJECTED', note: notes },
      });

      await createNotification({ userId: claim.patientId, title: 'Claim Rejected', message: `Your claim ${claim.claimNumber} has been rejected. Reason: ${notes}`, type: 'error', link: `/claims/${claim.id}`, prefKey: 'claimRejected' });
      await sendClaimRejected(claim.patient.email, claim.claimNumber, notes);
      await createAuditLog({ userId: req.user!.id, action: 'REJECT_CLAIM', resource: 'Claim', resourceId: claim.id, ipAddress: req.ip });

      generateAndStoreEob(claim.id, req.user!.id).catch((err: unknown) => {
        console.error('[EOB] Failed to generate EOB for claim', claim.id, err);
      });

      res.json(parseDiagnosisCodes(updated));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /claims/{id}/request-info:
 *   post:
 *     tags: [Claims]
 *     summary: Request additional information from patient (Adjuster/Admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message: { type: string }
 *     responses:
 *       200:
 *         description: Info requested, claim moved to INFO_REQUESTED
 *       400:
 *         description: Claim not in a valid status for info request
 */
/** POST /claims/:id/request-info */
router.post(
  '/:id/request-info',
  authenticate,
  requireRole('ADJUSTER', 'ADMIN'),
  validate(requestInfoSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { message } = req.body as z.infer<typeof requestInfoSchema>;
      const claim = await prisma.claim.findUnique({ where: { id: req.params['id'] }, include: { patient: true } });

      if (!claim) { res.status(404).json({ error: 'Claim not found' }); return; }
      if (!['UNDER_REVIEW', 'INFO_RESPONDED', 'APPEAL_PENDING'].includes(claim.status)) {
        res.status(400).json({ error: 'Claim must be UNDER_REVIEW to request info' });
        return;
      }

      const [updated] = await Promise.all([
        prisma.claim.update({ where: { id: claim.id }, data: { status: 'INFO_REQUESTED' }, include: claimInclude }),
        prisma.infoRequest.create({ data: { claimId: claim.id, fromId: req.user!.id, message } }),
        prisma.claimEvent.create({ data: { claimId: claim.id, userId: req.user!.id, action: 'INFO_REQUESTED', fromStatus: claim.status, toStatus: 'INFO_REQUESTED', note: message } }),
      ]);

      await createNotification({ userId: claim.patientId, title: 'Information Requested', message: `Additional information is required for claim ${claim.claimNumber}.`, type: 'warning', link: `/claims/${claim.id}`, prefKey: 'infoRequested' });
      await sendInfoRequested(claim.patient.email, claim.claimNumber, message);

      res.json(parseDiagnosisCodes(updated));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /claims/{id}/respond-info:
 *   post:
 *     tags: [Claims]
 *     summary: Patient responds to an information request
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [infoRequestId]
 *             properties:
 *               infoRequestId: { type: string }
 *               response: { type: string }
 *     responses:
 *       200:
 *         description: Response submitted, claim moved to INFO_RESPONDED
 *       400:
 *         description: Claim is closed or info request already answered
 */
/** POST /claims/:id/respond-info */
router.post(
  '/:id/respond-info',
  authenticate,
  requireRole('PATIENT'),
  validate(respondInfoSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { response, infoRequestId } = req.body as z.infer<typeof respondInfoSchema>;
      const claim = await prisma.claim.findUnique({ where: { id: req.params['id'] } });

      if (!claim) { res.status(404).json({ error: 'Claim not found' }); return; }
      if (claim.patientId !== req.user!.id) { res.status(403).json({ error: 'Access denied' }); return; }
      if (['PAID', 'REJECTED', 'WITHDRAWN', 'APPROVED'].includes(claim.status)) {
        res.status(400).json({ error: 'Cannot respond to a closed claim' }); return;
      }

      const infoRequest = await prisma.infoRequest.findUnique({ where: { id: infoRequestId } });
      if (!infoRequest || infoRequest.claimId !== claim.id) {
        res.status(404).json({ error: 'Info request not found' });
        return;
      }
      if (infoRequest.respondedAt) {
        res.status(400).json({ error: 'This info request has already been responded to' }); return;
      }

      await prisma.infoRequest.update({ where: { id: infoRequestId }, data: { response: response ?? '', respondedAt: new Date() } });

      const updated = await prisma.claim.update({ where: { id: claim.id }, data: { status: 'INFO_RESPONDED' }, include: claimInclude });

      await prisma.claimEvent.create({
        data: { claimId: claim.id, userId: req.user!.id, action: 'INFO_RESPONDED', fromStatus: claim.status, toStatus: 'INFO_RESPONDED', note: response },
      });

      if (claim.adjusterId) {
        await createNotification({ userId: claim.adjusterId, title: 'Information Received', message: `Patient has responded to info request for claim ${claim.claimNumber}.`, type: 'info', link: `/adjuster/claims/${claim.id}`, prefKey: 'infoRequested' });
      }

      res.json(parseDiagnosisCodes(updated));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /claims/{id}/resubmit:
 *   post:
 *     tags: [Claims]
 *     summary: Resubmit a REJECTED claim (Patient only; legacy endpoint)
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
 *         description: Claim resubmitted
 *       400:
 *         description: Claim is not REJECTED
 */
/** POST /claims/:id/resubmit — legacy resubmit (kept for backward compat) */
router.post(
  '/:id/resubmit',
  authenticate,
  requireRole('PATIENT'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const claim = await prisma.claim.findUnique({ where: { id: req.params['id'] }, include: { patient: true } });

      if (!claim) { res.status(404).json({ error: 'Claim not found' }); return; }
      if (claim.patientId !== req.user!.id) { res.status(403).json({ error: 'Access denied' }); return; }
      if (claim.status !== 'REJECTED') { res.status(400).json({ error: 'Only REJECTED claims can be resubmitted' }); return; }

      const updated = await prisma.claim.update({
        where: { id: claim.id },
        data: { status: 'SUBMITTED', adjusterId: null, adjusterNotes: null },
        include: claimInclude,
      });

      await prisma.claimEvent.create({
        data: { claimId: claim.id, userId: req.user!.id, action: 'RESUBMITTED', fromStatus: 'REJECTED', toStatus: 'SUBMITTED' },
      });

      const adjusters = await prisma.user.findMany({ where: { role: 'ADJUSTER', isActive: true }, select: { id: true } });
      await Promise.all(adjusters.map((a) =>
        createNotification({ userId: a.id, title: 'Claim Resubmitted', message: `Claim ${claim.claimNumber} has been resubmitted.`, type: 'info', link: `/adjuster/claims/${claim.id}`, prefKey: 'claimSubmitted' })
      ));

      await createNotification({ userId: claim.patientId, title: 'Claim Resubmitted', message: `Your claim ${claim.claimNumber} has been resubmitted.`, type: 'success', link: `/claims/${claim.id}`, prefKey: 'claimSubmitted' });

      res.json(parseDiagnosisCodes(updated));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /claims/{id}/override-filing-deadline:
 *   post:
 *     tags: [Claims]
 *     summary: Admin override of filing deadline for a specific claim
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: Override applied
 *       400:
 *         description: Claim is not in DRAFT status
 */
const overrideFilingDeadlineSchema = z.object({
  reason: z.string().min(1, 'Reason is required for filing deadline override'),
});

const initiateAppealSchema = z.object({
  reason: z.string().min(1, 'Appeal reason is required'),
});

const resolveAppealSchema = z.object({
  resolution: z.enum(['APPEAL_APPROVED', 'APPEAL_DENIED']),
  notes: z.string().optional(),
});

router.post(
  '/:id/override-filing-deadline',
  authenticate,
  requireRole('ADMIN'),
  validate(overrideFilingDeadlineSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { reason } = req.body as z.infer<typeof overrideFilingDeadlineSchema>;
      const claim = await prisma.claim.findUnique({
        where: { id: req.params['id'] },
        include: { policy: true },
      });

      if (!claim) { res.status(404).json({ error: 'Claim not found' }); return; }
      if (claim.status !== 'DRAFT') {
        res.status(400).json({ error: 'Filing deadline override can only be applied to DRAFT claims' });
        return;
      }

      const deadlineCheck = checkFilingDeadline(
        new Date(claim.incidentDate),
        new Date(),
        claim.policy.filingDeadlineDays,
      );

      await prisma.claim.update({
        where: { id: claim.id },
        data: { filingDeadlineOverride: true },
      });

      await createAuditLog({
        userId: req.user!.id,
        action: 'OVERRIDE_FILING_DEADLINE',
        resource: 'Claim',
        resourceId: claim.id,
        details: {
          claimNumber: claim.claimNumber,
          reason,
          daysSinceIncident: deadlineCheck.daysSinceIncident,
          deadlineDays: deadlineCheck.deadlineDays,
        },
        ipAddress: req.ip,
      });

      res.json({
        message: 'Filing deadline override applied. The claim may now be submitted.',
        claimId: claim.id,
        claimNumber: claim.claimNumber,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /claims/{id}/appeal:
 *   post:
 *     tags: [Claims]
 *     summary: Initiate an appeal on a REJECTED claim (Patient only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: Appeal initiated, claim moved to APPEAL_PENDING
 *       400:
 *         description: Claim is not REJECTED
 */
/** POST /claims/:id/appeal — patient initiates appeal on a REJECTED claim */
router.post(
  '/:id/appeal',
  authenticate,
  requireRole('PATIENT'),
  validate(initiateAppealSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { reason } = req.body as z.infer<typeof initiateAppealSchema>;
      const claim = await prisma.claim.findUnique({ where: { id: req.params['id'] }, include: { patient: true } });

      if (!claim) { res.status(404).json({ error: 'Claim not found' }); return; }
      if (claim.patientId !== req.user!.id) { res.status(403).json({ error: 'Access denied' }); return; }
      if (claim.status !== 'REJECTED') {
        res.status(400).json({ error: 'Only REJECTED claims can be appealed' });
        return;
      }

      // Record the adjudicator who made the original rejection decision so we can enforce
      // the second-adjudicator constraint when the appeal is assigned.
      const rejectionEvent = await prisma.claimEvent.findFirst({
        where: { claimId: claim.id, action: 'REJECTED' },
        orderBy: { createdAt: 'desc' },
      });
      const originalAdjudicatorId = rejectionEvent?.userId ?? claim.adjusterId;

      const updated = await prisma.claim.update({
        where: { id: claim.id },
        data: {
          status: 'APPEAL_PENDING',
          appealReason: reason,
          originalAdjudicatorId: originalAdjudicatorId ?? undefined,
          // Clear the previous adjuster so the claim re-enters the unassigned pool
          adjusterId: null,
        },
        include: claimInclude,
      });

      await prisma.claimEvent.create({
        data: {
          claimId: claim.id,
          userId: req.user!.id,
          action: 'APPEAL_INITIATED',
          fromStatus: 'REJECTED',
          toStatus: 'APPEAL_PENDING',
          note: reason,
        },
      });

      // Notify the original adjudicator (informational only — they cannot process the appeal)
      if (originalAdjudicatorId) {
        await createNotification({
          userId: originalAdjudicatorId,
          title: 'Appeal Filed on Your Decision',
          message: `The patient has filed an internal appeal on claim ${claim.claimNumber}, which you previously rejected. A different adjudicator will review it.`,
          type: 'info',
          link: `/adjuster/claims/${claim.id}`,
          prefKey: 'appealPending',
        });
      }

      // Notify all other adjusters that an appeal is pending assignment
      const adjusters = await prisma.user.findMany({
        where: { role: 'ADJUSTER', isActive: true, id: { not: originalAdjudicatorId ?? undefined } },
        select: { id: true },
      });
      await Promise.all(
        adjusters.map((a) =>
          createNotification({
            userId: a.id,
            title: 'Appeal Pending Assignment',
            message: `Claim ${claim.claimNumber} has entered appeal and needs a second adjudicator.`,
            type: 'warning',
            link: `/adjuster/claims/${claim.id}`,
            prefKey: 'appealPending',
          })
        )
      );

      await createNotification({
        userId: claim.patientId,
        title: 'Appeal Initiated',
        message: `Your appeal for claim ${claim.claimNumber} has been submitted and is pending review.`,
        type: 'info',
        link: `/claims/${claim.id}`,
        prefKey: 'claimSubmitted',
      });

      await createAuditLog({ userId: req.user!.id, action: 'INITIATE_APPEAL', resource: 'Claim', resourceId: claim.id, details: { claimNumber: claim.claimNumber, reason }, ipAddress: req.ip });

      const result = await prisma.claim.findUnique({ where: { id: claim.id }, include: claimInclude });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /claims/{id}/assign-appeal:
 *   post:
 *     tags: [Claims]
 *     summary: Assign an adjudicator to an appeal claim (Adjuster/Admin; must be different from original)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [adjusterId]
 *             properties:
 *               adjusterId: { type: string }
 *     responses:
 *       200:
 *         description: Adjudicator assigned, claim remains APPEAL_PENDING
 *       400:
 *         description: Same adjudicator as original, or claim not in APPEAL_PENDING
 */
/** POST /claims/:id/assign-appeal — assign a second adjudicator to an appeal */
router.post(
  '/:id/assign-appeal',
  authenticate,
  requireRole('ADJUSTER', 'ADMIN'),
  validate(assignSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { adjusterId } = req.body as z.infer<typeof assignSchema>;
      const claim = await prisma.claim.findUnique({ where: { id: req.params['id'] } });
      if (!claim) { res.status(404).json({ error: 'Claim not found' }); return; }

      if (claim.status !== 'APPEAL_PENDING') {
        res.status(400).json({ error: 'Claim must be in APPEAL_PENDING status to assign an appeal adjudicator' });
        return;
      }

      const adjuster = await prisma.user.findUnique({ where: { id: adjusterId } });
      if (!adjuster || adjuster.role !== 'ADJUSTER') {
        res.status(400).json({ error: 'Invalid adjuster' });
        return;
      }

      // Enforce second-adjudicator constraint
      if (claim.originalAdjudicatorId && adjusterId === claim.originalAdjudicatorId) {
        res.status(400).json({ error: 'The appeal adjudicator must be different from the adjudicator who made the original rejection decision' });
        return;
      }

      const updated = await prisma.claim.update({
        where: { id: claim.id },
        data: { adjusterId },
        include: claimInclude,
      });

      await prisma.claimEvent.create({
        data: {
          claimId: claim.id,
          userId: req.user!.id,
          action: 'ASSIGNED',
          fromStatus: 'APPEAL_PENDING',
          toStatus: 'APPEAL_PENDING',
          note: `Appeal assigned to ${adjuster.firstName} ${adjuster.lastName}`,
        },
      });

      await createNotification({
        userId: adjusterId,
        title: 'Appeal Assigned to You',
        message: `Appeal for claim ${claim.claimNumber} has been assigned to you for review.`,
        type: 'warning',
        link: `/adjuster/claims/${claim.id}`,
        prefKey: 'claimUnderReview',
      });

      const result = await prisma.claim.findUnique({ where: { id: claim.id }, include: claimInclude });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /claims/{id}/resolve-appeal:
 *   post:
 *     tags: [Claims]
 *     summary: Resolve an appeal as APPEAL_APPROVED or APPEAL_DENIED (Adjuster only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resolution]
 *             properties:
 *               resolution:
 *                 type: string
 *                 enum: [APPEAL_APPROVED, APPEAL_DENIED]
 *               notes: { type: string }
 *     responses:
 *       200:
 *         description: Appeal resolved
 *       400:
 *         description: Claim is not in APPEAL_PENDING status, or adjuster is not assigned
 */
/** POST /claims/:id/resolve-appeal — adjudicator resolves the appeal */
router.post(
  '/:id/resolve-appeal',
  authenticate,
  requireRole('ADJUSTER'),
  validate(resolveAppealSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { resolution, notes } = req.body as z.infer<typeof resolveAppealSchema>;
      const claim = await prisma.claim.findUnique({ where: { id: req.params['id'] }, include: { patient: true } });

      if (!claim) { res.status(404).json({ error: 'Claim not found' }); return; }
      if (claim.status !== 'APPEAL_PENDING') {
        res.status(400).json({ error: 'Claim must be in APPEAL_PENDING status to resolve an appeal' });
        return;
      }

      // Only the assigned adjudicator may resolve
      if (claim.adjusterId !== req.user!.id) {
        res.status(403).json({ error: 'Only the assigned adjudicator may resolve this appeal' });
        return;
      }

      let toStatus: string;
      if (resolution === 'APPEAL_APPROVED') {
        // Re-enter normal adjudication so the second adjudicator sets the reimbursable amount
        toStatus = 'UNDER_REVIEW';
      } else {
        toStatus = 'APPEAL_DENIED';
      }

      const updated = await prisma.claim.update({
        where: { id: claim.id },
        data: {
          status: toStatus,
          adjusterNotes: notes ?? claim.adjusterNotes,
        },
        include: claimInclude,
      });

      await prisma.claimEvent.create({
        data: {
          claimId: claim.id,
          userId: req.user!.id,
          action: 'APPEAL_RESOLVED',
          fromStatus: 'APPEAL_PENDING',
          toStatus,
          note: notes,
        },
      });

      if (resolution === 'APPEAL_APPROVED') {
        await createNotification({
          userId: claim.patientId,
          title: 'Appeal Approved — Claim Under Review',
          message: `Your appeal for claim ${claim.claimNumber} was successful. The claim is now back under review.`,
          type: 'success',
          link: `/claims/${claim.id}`,
          prefKey: 'claimApproved',
        });
      } else {
        await createNotification({
          userId: claim.patientId,
          title: 'Appeal Denied',
          message: `Your internal appeal for claim ${claim.claimNumber} was denied. You have the right to request an independent external review.`,
          type: 'error',
          link: `/claims/${claim.id}`,
          prefKey: 'claimRejected',
        });
        await sendAppealDenied(claim.patient.email, claim.claimNumber, notes ?? '');
      }

      await createAuditLog({
        userId: req.user!.id,
        action: 'RESOLVE_APPEAL',
        resource: 'Claim',
        resourceId: claim.id,
        details: { claimNumber: claim.claimNumber, resolution, notes },
        ipAddress: req.ip,
      });

      const result = await prisma.claim.findUnique({ where: { id: claim.id }, include: claimInclude });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// ─── COB (Coordination of Benefits) ─────────────────────────────────────────

const externalPrimarySchema = z.object({
  primaryInsurerName: z.string().min(1, 'Primary insurer name is required'),
  primaryPaidAmount: z.number().nonnegative('Primary paid amount must be zero or positive'),
  primaryEOBDate: z.string().transform((v) => new Date(v)),
});

const initiateSecondarySchema = z.object({
  secondaryPolicyId: z.string().min(1, 'Secondary policy ID is required'),
  notes: z.string().optional(),
});

/**
 * @openapi
 * /claims/{id}/cob/external-primary:
 *   put:
 *     tags: [Claims]
 *     summary: Finance Officer enters external primary insurer EOB to enable secondary adjudication
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [primaryInsurerName, primaryPaidAmount, primaryEOBDate]
 *             properties:
 *               primaryInsurerName: { type: string }
 *               primaryPaidAmount: { type: number }
 *               primaryEOBDate: { type: string, format: date }
 *     responses:
 *       200:
 *         description: External primary EOB recorded
 *       404:
 *         description: Claim not found
 */
router.put(
  '/:id/cob/external-primary',
  authenticate,
  requireRole('FINANCE_OFFICER', 'ADMIN'),
  validate(externalPrimarySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = req.body as z.infer<typeof externalPrimarySchema>;
      const claim = await prisma.claim.findUnique({
        where: { id: req.params['id'] },
        include: { policy: true },
      });

      if (!claim) { res.status(404).json({ error: 'Claim not found' }); return; }
      if (!claim.cobFlag) {
        res.status(400).json({ error: 'This claim is not flagged as a COB scenario' });
        return;
      }

      const patientResponsibility = Math.max(0, claim.totalAmount - data.primaryPaidAmount);

      await prisma.cobDetail.upsert({
        where: { claimId: claim.id },
        create: {
          claimId: claim.id,
          primaryInsurerName: data.primaryInsurerName,
          primaryPaidAmount: data.primaryPaidAmount,
          primaryEOBDate: data.primaryEOBDate,
          patientResponsibility,
        },
        update: {
          primaryInsurerName: data.primaryInsurerName,
          primaryPaidAmount: data.primaryPaidAmount,
          primaryEOBDate: data.primaryEOBDate,
          patientResponsibility,
        },
      });

      await createAuditLog({
        userId: req.user!.id,
        action: 'COB_EXTERNAL_PRIMARY_ENTERED',
        resource: 'Claim',
        resourceId: claim.id,
        details: { claimNumber: claim.claimNumber, primaryInsurerName: data.primaryInsurerName, primaryPaidAmount: data.primaryPaidAmount },
        ipAddress: req.ip,
      });

      const updated = await prisma.claim.findUnique({ where: { id: claim.id }, include: { ...claimInclude, cobDetail: true } });
      res.json(updated ? parseDiagnosisCodes(updated) : null);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /claims/{id}/cob/initiate-secondary:
 *   post:
 *     tags: [Claims]
 *     summary: After primary payout (or external primary EOB entry), initiate secondary claim
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [secondaryPolicyId]
 *             properties:
 *               secondaryPolicyId: { type: string }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Secondary claim created as SUBMITTED
 *       400:
 *         description: Cannot initiate secondary claim — primary not yet paid or conditions not met
 *       404:
 *         description: Claim not found
 */
router.post(
  '/:id/cob/initiate-secondary',
  authenticate,
  requireRole('FINANCE_OFFICER', 'ADMIN'),
  validate(initiateSecondarySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = req.body as z.infer<typeof initiateSecondarySchema>;
      const primaryClaim = await prisma.claim.findUnique({
        where: { id: req.params['id'] },
        include: { policy: true, payout: true, cobDetail: true },
      });

      if (!primaryClaim) { res.status(404).json({ error: 'Claim not found' }); return; }
      if (!primaryClaim.cobFlag) {
        res.status(400).json({ error: 'This claim is not flagged as a COB scenario' });
        return;
      }
      if (primaryClaim.secondaryClaimId) {
        res.status(409).json({ error: 'A secondary claim has already been initiated for this claim' });
        return;
      }

      // Primary must be PAID (in-system) OR have external primary EOB entered
      const primaryPaid = primaryClaim.status === 'PAID' && primaryClaim.payout;
      const externalPrimaryEntered = !!primaryClaim.cobDetail?.primaryPaidAmount !== undefined && primaryClaim.cobDetail !== null;
      if (!primaryPaid && !externalPrimaryEntered) {
        res.status(400).json({ error: 'Primary claim must be paid (or external primary EOB entered) before initiating secondary claim' });
        return;
      }

      // Verify secondary policy belongs to the same patient and is active
      const secondaryUserPolicy = await prisma.userPolicy.findUnique({
        where: { userId_policyId: { userId: primaryClaim.patientId, policyId: data.secondaryPolicyId } },
        include: { policy: true },
      });
      if (!secondaryUserPolicy || new Date(secondaryUserPolicy.policy.expiryDate) < new Date()) {
        res.status(400).json({ error: 'Secondary policy not found or expired for this patient' });
        return;
      }
      if (secondaryUserPolicy.payerOrder !== 'SECONDARY') {
        res.status(400).json({ error: 'The selected policy is not configured as SECONDARY payer order' });
        return;
      }

      // Determine primary patient responsibility — this caps the secondary payout
      let primaryPatientResponsibility: number;
      if (primaryClaim.cobDetail?.patientResponsibility !== undefined && primaryClaim.cobDetail.patientResponsibility !== null) {
        primaryPatientResponsibility = primaryClaim.cobDetail.patientResponsibility;
      } else if (primaryClaim.payout) {
        primaryPatientResponsibility = Math.max(0, primaryClaim.totalAmount - primaryClaim.payout.amount);
      } else {
        primaryPatientResponsibility = primaryClaim.totalAmount;
      }

      // Secondary reimbursable = min(patientResponsibility, secondaryEligible)
      // We store patientResponsibility as the secondaryClaim's totalAmount to drive eligibility calc
      const secondaryTotalAmount = primaryPatientResponsibility;
      // Cap: total reimbursement (primary paid + secondary reimbursable) cannot exceed claimAmount
      const primaryAmountPaid = primaryClaim.payout?.amount ?? primaryClaim.cobDetail?.primaryPaidAmount ?? 0;
      const maxSecondary = Math.max(0, primaryClaim.totalAmount - primaryAmountPaid);

      const planYearStart = getPlanYearStart(
        { startDate: secondaryUserPolicy.startDate, planYearType: secondaryUserPolicy.planYearType },
        new Date(primaryClaim.incidentDate),
      );
      const claimNetworkStatus = (primaryClaim.networkStatus as 'IN' | 'OUT') ?? 'IN';

      const [deductiblePaid, oopPaid] = await Promise.all([
        getDeductiblePaid(primaryClaim.patientId, data.secondaryPolicyId, planYearStart, undefined, claimNetworkStatus),
        getOopPaid(primaryClaim.patientId, data.secondaryPolicyId, planYearStart, undefined, claimNetworkStatus),
      ]);

      const { eligibleAmount, deductible, reimbursable: rawReimbursable } = calculateEligible(
        secondaryTotalAmount,
        secondaryUserPolicy.policy,
        deductiblePaid,
        oopPaid,
        claimNetworkStatus,
      );

      // Enforce the no-profit cap
      const reimbursable = Math.min(rawReimbursable, maxSecondary);
      const claimNumber = await generateClaimNumber();

      const secondaryClaim = await prisma.claim.create({
        data: {
          claimNumber,
          patientId: primaryClaim.patientId,
          policyId: data.secondaryPolicyId,
          type: primaryClaim.type,
          description: `Secondary COB claim for ${primaryClaim.claimNumber}${data.notes ? ` — ${data.notes}` : ''}`,
          incidentDate: primaryClaim.incidentDate,
          totalAmount: secondaryTotalAmount,
          eligibleAmount,
          deductible,
          reimbursable,
          status: 'SUBMITTED',
          networkStatus: primaryClaim.networkStatus ?? 'IN',
          cobFlag: true,
          planYearStart,
          ...(primaryClaim.providerId ? { providerId: primaryClaim.providerId } : {}),
        },
        include: claimInclude,
      });

      // Link the two claims
      await prisma.claim.update({
        where: { id: primaryClaim.id },
        data: { secondaryClaimId: secondaryClaim.id },
      });

      await prisma.claimEvent.create({
        data: {
          claimId: secondaryClaim.id,
          userId: req.user!.id,
          action: 'SUBMITTED',
          fromStatus: 'DRAFT',
          toStatus: 'SUBMITTED',
          note: `COB secondary claim initiated from primary claim ${primaryClaim.claimNumber}`,
        },
      });

      await createAuditLog({
        userId: req.user!.id,
        action: 'COB_INITIATE_SECONDARY',
        resource: 'Claim',
        resourceId: secondaryClaim.id,
        details: { primaryClaimId: primaryClaim.id, primaryClaimNumber: primaryClaim.claimNumber, secondaryPolicyId: data.secondaryPolicyId },
        ipAddress: req.ip,
      });

      res.status(201).json(secondaryClaim);
    } catch (err) {
      next(err);
    }
  }
);

const reassignSchema = z.object({
  adjusterId: z.string().min(1, 'Adjuster ID is required'),
});

// ─── Unified Action Dispatcher Schema ────────────────────────────────────────

type ClaimAction =
  | { action: 'SUBMIT'; payload: Record<string, never> }
  | { action: 'WITHDRAW'; payload: z.infer<typeof withdrawSchema> }
  | { action: 'ASSIGN'; payload: z.infer<typeof assignSchema> }
  | { action: 'APPROVE'; payload: z.infer<typeof approveClaimSchema> }
  | { action: 'REJECT'; payload: z.infer<typeof rejectClaimSchema> }
  | { action: 'REQUEST_INFO'; payload: z.infer<typeof requestInfoSchema> }
  | { action: 'RESPOND_INFO'; payload: z.infer<typeof respondInfoSchema> }
  | { action: 'RESUBMIT'; payload: Record<string, never> }
  | { action: 'OVERRIDE_FILING_DEADLINE'; payload: z.infer<typeof overrideFilingDeadlineSchema> }
  | { action: 'APPEAL'; payload: z.infer<typeof initiateAppealSchema> }
  | { action: 'ASSIGN_APPEAL'; payload: z.infer<typeof assignSchema> }
  | { action: 'RESOLVE_APPEAL'; payload: z.infer<typeof resolveAppealSchema> }
  | { action: 'EXTERNAL_PRIMARY'; payload: z.infer<typeof externalPrimarySchema> }
  | { action: 'INITIATE_SECONDARY'; payload: z.infer<typeof initiateSecondarySchema> }
  | { action: 'REASSIGN'; payload: z.infer<typeof reassignSchema> }
  | { action: 'ADJUDICATE_LINE'; payload: z.infer<typeof adjudicateLineSchema> & { lineId: string } };

const claimActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('SUBMIT'), payload: z.object({}).strict() }),
  z.object({ action: z.literal('WITHDRAW'), payload: withdrawSchema }),
  z.object({ action: z.literal('ASSIGN'), payload: assignSchema }),
  z.object({ action: z.literal('APPROVE'), payload: approveClaimSchema }),
  z.object({ action: z.literal('REJECT'), payload: rejectClaimSchema }),
  z.object({ action: z.literal('REQUEST_INFO'), payload: requestInfoSchema }),
  z.object({ action: z.literal('RESPOND_INFO'), payload: respondInfoSchema }),
  z.object({ action: z.literal('RESUBMIT'), payload: z.object({}).strict() }),
  z.object({ action: z.literal('OVERRIDE_FILING_DEADLINE'), payload: overrideFilingDeadlineSchema }),
  z.object({ action: z.literal('APPEAL'), payload: initiateAppealSchema }),
  z.object({ action: z.literal('ASSIGN_APPEAL'), payload: assignSchema }),
  z.object({ action: z.literal('RESOLVE_APPEAL'), payload: resolveAppealSchema }),
  z.object({ action: z.literal('EXTERNAL_PRIMARY'), payload: externalPrimarySchema }),
  z.object({ action: z.literal('INITIATE_SECONDARY'), payload: initiateSecondarySchema }),
  z.object({ action: z.literal('REASSIGN'), payload: reassignSchema }),
  z.object({ action: z.literal('ADJUDICATE_LINE'), payload: adjudicateLineSchema.extend({ lineId: z.string().min(1) }) }),
]);

/**
 * @openapi
 * /claims/{id}/reassign:
 *   post:
 *     tags: [Claims]
 *     summary: Admin manually reassigns a claim to a different adjuster (Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [adjusterId]
 *             properties:
 *               adjusterId: { type: string }
 *     responses:
 *       200:
 *         description: Claim reassigned
 *       400:
 *         description: Invalid adjuster
 *       404:
 *         description: Claim not found
 */
router.post(
  '/:id/reassign',
  authenticate,
  requireRole('ADMIN'),
  validate(reassignSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { adjusterId } = req.body as z.infer<typeof reassignSchema>;
      const claim = await prisma.claim.findUnique({ where: { id: req.params['id'] } });
      if (!claim) { res.status(404).json({ error: 'Claim not found' }); return; }

      const adjuster = await prisma.user.findUnique({ where: { id: adjusterId } });
      if (!adjuster || adjuster.role !== 'ADJUSTER' || !adjuster.isActive) {
        res.status(400).json({ error: 'Invalid or inactive adjuster' });
        return;
      }

      const previousAdjusterId = claim.assignedAdjusterId;

      await prisma.claim.update({
        where: { id: claim.id },
        data: { assignedAdjusterId: adjusterId, status: 'UNDER_REVIEW' },
      });

      await prisma.claimEvent.create({
        data: {
          claimId: claim.id,
          userId: req.user!.id,
          action: 'REASSIGNED',
          fromStatus: claim.status,
          toStatus: 'UNDER_REVIEW',
          note: `Manually reassigned to ${adjuster.firstName} ${adjuster.lastName} by admin`,
        },
      });

      await createNotification({
        userId: adjusterId,
        title: 'Claim Assigned to You',
        message: `Claim ${claim.claimNumber} has been assigned to you.`,
        type: 'info',
        link: `/adjuster/claims/${claim.id}`,
        prefKey: 'claimUnderReview',
      });

      await createAuditLog({
        userId: req.user!.id,
        action: 'ADMIN_REASSIGN_CLAIM',
        resource: 'Claim',
        resourceId: claim.id,
        details: { claimNumber: claim.claimNumber, from: previousAdjusterId, to: adjusterId },
        ipAddress: req.ip,
      });

      const result = await prisma.claim.findUnique({ where: { id: claim.id }, include: claimInclude });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Line-level adjudication ─────────────────────────────────────────────────

/**
 * Derive overall claim status from the current adjudication statuses of its lines.
 * Called after any line adjudication to keep the claim status in sync.
 */
function deriveClaimStatusFromLines(
  lines: { adjudicationStatus: string }[],
): 'APPROVED' | 'REJECTED' | 'PARTIALLY_APPROVED' | 'UNDER_REVIEW' {
  if (lines.length === 0) return 'UNDER_REVIEW';
  const statuses = lines.map((l) => l.adjudicationStatus);
  const allApproved = statuses.every((s) => s === 'APPROVED');
  const allDenied = statuses.every((s) => s === 'DENIED');
  const anyPending = statuses.some((s) => s === 'PENDING');

  if (anyPending) return 'UNDER_REVIEW';
  if (allApproved) return 'APPROVED';
  if (allDenied) return 'REJECTED';
  return 'PARTIALLY_APPROVED';
}

/** POST /claims/:id/lines/:lineId/adjudicate — approve/deny/reduce a single line */
router.post(
  '/:id/lines/:lineId/adjudicate',
  authenticate,
  requireRole('ADJUSTER', 'ADMIN'),
  validate(adjudicateLineSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { adjudicationStatus, allowedAmount, denialReason, adjudicatorNote } =
        req.body as z.infer<typeof adjudicateLineSchema>;

      const claim = await prisma.claim.findUnique({
        where: { id: req.params['id'] },
        include: { patient: true, policy: true, lines: { orderBy: { lineNumber: 'asc' } } },
      });

      if (!claim) { res.status(404).json({ error: 'Claim not found' }); return; }
      if (!['UNDER_REVIEW', 'INFO_REQUESTED', 'INFO_RESPONDED'].includes(claim.status)) {
        res.status(400).json({ error: 'Claim must be UNDER_REVIEW or INFO_REQUESTED to adjudicate lines' });
        return;
      }
      if (claim.lines.length === 0) {
        res.status(400).json({ error: 'This claim has no line items' });
        return;
      }

      const line = claim.lines.find((l) => l.id === req.params['lineId']);
      if (!line) { res.status(404).json({ error: 'Line not found on this claim' }); return; }

      if (adjudicationStatus === 'REDUCED' && allowedAmount === undefined) {
        res.status(400).json({ error: 'allowedAmount is required when status is REDUCED' });
        return;
      }
      if (adjudicationStatus === 'DENIED' && !denialReason) {
        res.status(400).json({ error: 'denialReason is required when status is DENIED' });
        return;
      }
      if (adjudicationStatus === 'APPROVED') {
        // allowedAmount defaults to billedAmount when approving without override
        const resolvedAllowed = allowedAmount ?? line.billedAmount;
        await prisma.claimLine.update({
          where: { id: line.id },
          data: { adjudicationStatus: 'APPROVED', allowedAmount: resolvedAllowed, adjudicatorNote: adjudicatorNote ?? null },
        });
      } else {
        await prisma.claimLine.update({
          where: { id: line.id },
          data: {
            adjudicationStatus,
            allowedAmount: adjudicationStatus === 'REDUCED' ? allowedAmount! : null,
            denialReason: denialReason ?? null,
            adjudicatorNote: adjudicatorNote ?? null,
          },
        });
      }

      // Reload all lines to compute new totals and claim status
      const updatedLines = await prisma.claimLine.findMany({
        where: { claimId: claim.id },
        orderBy: { lineNumber: 'asc' },
      });

      const totalAllowed = updatedLines
        .filter((l) => l.adjudicationStatus === 'APPROVED' || l.adjudicationStatus === 'REDUCED')
        .reduce((sum, l) => sum + (l.allowedAmount ?? 0), 0);

      const newClaimStatus = deriveClaimStatusFromLines(updatedLines);

      // Compute eligibility on totalAllowed when claim is fully adjudicated
      let eligibilityUpdate: { eligibleAmount?: number; deductible?: number; reimbursable?: number; totalAllowed?: number } = {
        totalAllowed,
      };

      if (newClaimStatus !== 'UNDER_REVIEW') {
        const amountForElig = totalAllowed > 0 ? totalAllowed : 0;
        const planYearStart = claim.planYearStart ?? new Date(new Date().getFullYear(), 0, 1);
        const claimNetworkStatus = (claim.networkStatus as 'IN' | 'OUT') ?? 'IN';
        const [deductiblePaid, oopPaid] = await Promise.all([
          getDeductiblePaid(claim.patientId, claim.policyId, planYearStart, claim.id, claimNetworkStatus),
          getOopPaid(claim.patientId, claim.policyId, planYearStart, claim.id, claimNetworkStatus),
        ]);
        const { eligibleAmount, deductible, reimbursable } = calculateEligible(
          amountForElig,
          claim.policy,
          deductiblePaid,
          oopPaid,
          claimNetworkStatus,
        );
        eligibilityUpdate = { ...eligibilityUpdate, eligibleAmount, deductible, reimbursable };
      }

      await prisma.claim.update({
        where: { id: claim.id },
        data: { status: newClaimStatus, ...eligibilityUpdate },
      });

      // Record audit event for line adjudication
      await prisma.claimEvent.create({
        data: {
          claimId: claim.id,
          userId: req.user!.id,
          action: `LINE_${adjudicationStatus}`,
          fromStatus: claim.status,
          toStatus: newClaimStatus,
          lineId: line.id,
          note: adjudicatorNote ?? denialReason ?? null,
        },
      });

      await createAuditLog({
        userId: req.user!.id,
        action: 'ADJUDICATE_LINE',
        resource: 'ClaimLine',
        resourceId: line.id,
        details: { claimId: claim.id, claimNumber: claim.claimNumber, lineNumber: line.lineNumber, adjudicationStatus },
        ipAddress: req.ip,
      });

      const result = await prisma.claim.findUnique({ where: { id: claim.id }, include: claimInclude });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Unified Action Dispatcher ───────────────────────────────────────────────

/**
 * @openapi
 * /claims/{id}/actions:
 *   post:
 *     tags: [Claims]
 *     summary: Execute a claim action (unified dispatcher endpoint)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required: [action]
 *                 properties:
 *                   action: { type: string, enum: [SUBMIT, WITHDRAW, RESUBMIT, OVERRIDE_FILING_DEADLINE] }
 *               - type: object
 *                 required: [action, payload]
 *                 properties:
 *                   action: { type: string }
 *                   payload: { type: object }
 *     responses:
 *       200:
 *         description: Action executed successfully
 *       400:
 *         description: Invalid action or payload
 */
router.post(
  '/:id/actions',
  authenticate,
  validate(claimActionSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const claimId = req.params['id'];
      const actionReq = req.body as z.infer<typeof claimActionSchema>;
      const { role, id: userId } = req.user!;

      const claim = await prisma.claim.findUnique({
        where: { id: claimId },
        include: claimInclude,
      });

      if (!claim) {
        res.status(404).json({ error: 'Claim not found' });
        return;
      }

      let result: any;
      let auditAction: string = actionReq.action;

      switch (actionReq.action) {
        case 'SUBMIT': {
          if (role !== 'PATIENT') {
            res.status(403).json({ error: 'Only patients can submit claims' });
            return;
          }
          if (claim.patientId !== userId) {
            res.status(403).json({ error: 'Access denied' });
            return;
          }
          if (claim.status !== 'DRAFT') {
            res.status(400).json({ error: 'Only DRAFT claims can be submitted' });
            return;
          }

          if (new Date(claim.policy.expiryDate) < new Date()) {
            res.status(400).json({ error: 'Policy has expired. Cannot submit this claim.' });
            return;
          }

          if (!claim.filingDeadlineOverride) {
            const deadlineCheck = checkFilingDeadline(new Date(claim.incidentDate), new Date(), claim.policy.filingDeadlineDays);
            if (!deadlineCheck.withinDeadline) {
              res.status(422).json({
                error: `Claim filing deadline exceeded. Claims for this policy must be filed within ${deadlineCheck.deadlineDays} days of the incident date.`,
                code: 'FILING_DEADLINE_EXCEEDED',
                deadlineDays: deadlineCheck.deadlineDays,
                daysSinceIncident: deadlineCheck.daysSinceIncident,
              });
              return;
            }
          }

          const activeUserPolicies = await prisma.userPolicy.findMany({
            where: { userId },
            include: { policy: true },
          });
          const hasPrimary = activeUserPolicies.some((up) => up.payerOrder === 'PRIMARY' && new Date(up.policy.expiryDate) >= new Date());
          const hasSecondary = activeUserPolicies.some((up) => up.payerOrder === 'SECONDARY' && new Date(up.policy.expiryDate) >= new Date());
          const cobFlag = hasPrimary && hasSecondary;

          result = await prisma.claim.update({
            where: { id: claim.id },
            data: { status: 'SUBMITTED', cobFlag },
            include: claimInclude,
          });

          await prisma.claimEvent.create({
            data: { claimId: claim.id, userId, action: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' },
          });

          autoAssignClaim(claim.id, claim.claimNumber, userId, claim.provider?.specialty).catch((err: unknown) => {
            console.error('[Assignment] Auto-assign failed for claim', claim.claimNumber, err);
          });

          const adjusters = await prisma.user.findMany({ where: { role: 'ADJUSTER', isActive: true }, select: { id: true } });
          await Promise.all(
            adjusters.map((a) =>
              createNotification({
                userId: a.id,
                title: 'New Claim Submitted',
                message: `Claim ${claim.claimNumber} has been submitted and awaits assignment.`,
                type: 'info',
                link: `/adjuster/claims/${claim.id}`,
                prefKey: 'claimSubmitted',
              })
            )
          );

          await createNotification({
            userId: claim.patientId,
            title: 'Claim Submitted',
            message: `Your claim ${claim.claimNumber} has been submitted and is awaiting review.`,
            type: 'success',
            link: `/claims/${claim.id}`,
            prefKey: 'claimSubmitted',
          });
          await sendClaimSubmitted(claim.patient.email, claim.claimNumber);
          break;
        }

        case 'WITHDRAW': {
          if (role !== 'PATIENT') {
            res.status(403).json({ error: 'Only patients can withdraw claims' });
            return;
          }
          if (claim.patientId !== userId) {
            res.status(403).json({ error: 'Access denied' });
            return;
          }
          if (!['DRAFT', 'SUBMITTED'].includes(claim.status)) {
            res.status(400).json({ error: 'Claims can only be withdrawn before they reach Under Review' });
            return;
          }

          const { reason } = actionReq.payload as z.infer<typeof withdrawSchema>;
          result = await prisma.claim.update({
            where: { id: claim.id },
            data: { status: 'WITHDRAWN', adjusterNotes: reason ? `Withdrawn by patient: ${reason}` : 'Withdrawn by patient' },
            include: claimInclude,
          });

          await prisma.claimEvent.create({
            data: {
              claimId: claim.id,
              userId,
              action: 'WITHDRAWN',
              fromStatus: claim.status,
              toStatus: 'WITHDRAWN',
              note: reason || 'Withdrawn by patient',
            },
          });

          if (claim.adjusterId) {
            await createNotification({
              userId: claim.adjusterId,
              title: 'Claim Withdrawn',
              message: `Claim ${claim.claimNumber} has been withdrawn by the patient.`,
              type: 'warning',
              link: `/adjuster/claims/${claim.id}`,
            });
          }
          break;
        }

        case 'ASSIGN': {
          if (!['ADJUSTER', 'ADMIN'].includes(role)) {
            res.status(403).json({ error: 'Only adjusters and admins can assign claims' });
            return;
          }
          if (!['SUBMITTED', 'UNDER_REVIEW', 'INFO_RESPONDED'].includes(claim.status)) {
            res.status(400).json({ error: 'Claim must be SUBMITTED or UNDER_REVIEW to assign' });
            return;
          }

          const { adjusterId } = actionReq.payload as z.infer<typeof assignSchema>;
          const adjuster = await prisma.user.findUnique({ where: { id: adjusterId } });
          if (!adjuster || adjuster.role !== 'ADJUSTER') {
            res.status(400).json({ error: 'Invalid adjuster' });
            return;
          }

          const fromStatus = claim.status;
          const toStatus = 'UNDER_REVIEW';

          result = await prisma.claim.update({
            where: { id: claim.id },
            data: { adjusterId, status: toStatus },
            include: claimInclude,
          });

          await prisma.claimEvent.create({
            data: {
              claimId: claim.id,
              userId,
              action: 'ASSIGNED',
              fromStatus,
              toStatus,
              note: `Assigned to ${adjuster.firstName} ${adjuster.lastName}`,
            },
          });

          await createNotification({
            userId: claim.patientId,
            title: 'Claim Under Review',
            message: `Your claim ${claim.claimNumber} is now under review.`,
            type: 'info',
            link: `/claims/${claim.id}`,
            prefKey: 'claimUnderReview',
          });
          await createNotification({
            userId: adjusterId,
            title: 'Claim Assigned to You',
            message: `Claim ${claim.claimNumber} has been assigned to you for review.`,
            type: 'info',
            link: `/adjuster/claims/${claim.id}`,
            prefKey: 'claimUnderReview',
          });
          break;
        }

        case 'APPROVE': {
          if (!['ADJUSTER', 'ADMIN'].includes(role)) {
            res.status(403).json({ error: 'Only adjusters and admins can approve claims' });
            return;
          }
          if (!['UNDER_REVIEW', 'INFO_REQUESTED', 'INFO_RESPONDED', 'APPEAL_PENDING'].includes(claim.status)) {
            res.status(400).json({ error: 'Claim must be UNDER_REVIEW or INFO_REQUESTED to approve' });
            return;
          }

          const { notes, eligibleAmount: eligibleAmountOverride } = actionReq.payload as z.infer<typeof approveClaimSchema>;

          const planYearStart = claim.planYearStart ?? new Date(new Date().getFullYear(), 0, 1);
          const claimNetworkStatus = (claim.networkStatus as 'IN' | 'OUT') ?? 'IN';
          const [deductiblePaid, oopPaid] = await Promise.all([
            getDeductiblePaid(claim.patientId, claim.policyId, planYearStart, claim.id, claimNetworkStatus),
            getOopPaid(claim.patientId, claim.policyId, planYearStart, claim.id, claimNetworkStatus),
          ]);
          const { eligibleAmount: calculatedEligible } = calculateEligible(claim.totalAmount, claim.policy, deductiblePaid, oopPaid, claimNetworkStatus);

          if (eligibleAmountOverride !== undefined && eligibleAmountOverride > calculatedEligible) {
            res.status(400).json({ error: 'Eligible amount cannot exceed the calculated eligible amount' });
            return;
          }

          const { eligibleAmount, deductible, reimbursable } = calculateEligible(
            claim.totalAmount,
            claim.policy,
            deductiblePaid,
            oopPaid,
            claimNetworkStatus,
            eligibleAmountOverride,
          );

          const eventNote =
            eligibleAmountOverride !== undefined
              ? `Eligible amount overridden to $${eligibleAmountOverride.toFixed(2)} (calculated: $${calculatedEligible.toFixed(2)}). ${notes ?? ''}`.trim()
              : notes;

          const finalStatus = reimbursable === 0 ? 'PAID' : 'APPROVED';

          result = await prisma.claim.update({
            where: { id: claim.id },
            data: {
              status: finalStatus,
              adjusterNotes: notes,
              eligibleAmount,
              deductible,
              reimbursable,
              adjustedAmount: null,
            },
            include: claimInclude,
          });

          await prisma.claimEvent.create({
            data: { claimId: claim.id, userId, action: 'APPROVED', fromStatus: claim.status, toStatus: finalStatus, note: eventNote },
          });

          if (reimbursable === 0) {
            await prisma.payout.create({
              data: {
                claimId: claim.id,
                processedBy: userId,
                amount: 0,
                paymentRef: `ZERO-${claim.claimNumber}`,
                notes: 'Auto-closed: deductible and copay cover full eligible amount',
              },
            });
          }

          await createNotification({
            userId: claim.patientId,
            title: 'Claim Approved',
            message: `Your claim ${claim.claimNumber} has been approved. Reimbursable: $${reimbursable.toFixed(2)}`,
            type: 'success',
            link: `/claims/${claim.id}`,
            prefKey: 'claimApproved',
          });

          if (reimbursable > 0) {
            const financeOfficers = await prisma.user.findMany({ where: { role: 'FINANCE_OFFICER', isActive: true }, select: { id: true } });
            await Promise.all(
              financeOfficers.map((f) =>
                createNotification({
                  userId: f.id,
                  title: 'Claim Awaiting Payment',
                  message: `Claim ${claim.claimNumber} has been approved and is awaiting payment. Amount: $${reimbursable.toFixed(2)}`,
                  type: 'info',
                  link: `/finance/payouts`,
                  prefKey: 'claimApproved',
                })
              )
            );
          }

          await sendClaimApproved(claim.patient.email, claim.claimNumber, reimbursable);

          const wasAppealed = claim.status === 'APPEAL_PENDING' || !!(await prisma.claimEvent.findFirst({ where: { claimId: claim.id, action: 'APPEAL_RESOLVED' } }));
          generateAndStoreEob(claim.id, userId, wasAppealed).catch((err: unknown) => {
            console.error('[EOB] Failed to generate EOB for claim', claim.id, err);
          });
          break;
        }

        case 'REJECT': {
          if (!['ADJUSTER', 'ADMIN'].includes(role)) {
            res.status(403).json({ error: 'Only adjusters and admins can reject claims' });
            return;
          }
          if (!['UNDER_REVIEW', 'INFO_REQUESTED', 'INFO_RESPONDED', 'APPEAL_PENDING'].includes(claim.status)) {
            res.status(400).json({ error: 'Claim must be UNDER_REVIEW or INFO_REQUESTED to reject' });
            return;
          }

          const { notes } = actionReq.payload as z.infer<typeof rejectClaimSchema>;
          result = await prisma.claim.update({
            where: { id: claim.id },
            data: { status: 'REJECTED', adjusterNotes: notes },
            include: claimInclude,
          });

          await prisma.claimEvent.create({
            data: { claimId: claim.id, userId, action: 'REJECTED', fromStatus: claim.status, toStatus: 'REJECTED', note: notes },
          });

          await createNotification({
            userId: claim.patientId,
            title: 'Claim Rejected',
            message: `Your claim ${claim.claimNumber} has been rejected. Reason: ${notes}`,
            type: 'error',
            link: `/claims/${claim.id}`,
            prefKey: 'claimRejected',
          });

          await sendClaimRejected(claim.patient.email, claim.claimNumber, notes);
          break;
        }

        case 'REQUEST_INFO': {
          if (!['ADJUSTER', 'ADMIN'].includes(role)) {
            res.status(403).json({ error: 'Only adjusters and admins can request info' });
            return;
          }
          if (!['UNDER_REVIEW', 'INFO_RESPONDED', 'APPEAL_PENDING'].includes(claim.status)) {
            res.status(400).json({ error: 'Claim must be UNDER_REVIEW to request info' });
            return;
          }

          const { message } = actionReq.payload as z.infer<typeof requestInfoSchema>;
          const [updated] = await Promise.all([
            prisma.claim.update({ where: { id: claim.id }, data: { status: 'INFO_REQUESTED' }, include: claimInclude }),
            prisma.infoRequest.create({ data: { claimId: claim.id, fromId: userId, message } }),
            prisma.claimEvent.create({
              data: { claimId: claim.id, userId, action: 'INFO_REQUESTED', fromStatus: claim.status, toStatus: 'INFO_REQUESTED', note: message },
            }),
          ]);

          result = updated;

          await createNotification({
            userId: claim.patientId,
            title: 'Information Requested',
            message: `Additional information is required for claim ${claim.claimNumber}.`,
            type: 'warning',
            link: `/claims/${claim.id}`,
            prefKey: 'infoRequested',
          });
          await sendInfoRequested(claim.patient.email, claim.claimNumber, message);
          break;
        }

        case 'RESPOND_INFO': {
          if (role !== 'PATIENT') {
            res.status(403).json({ error: 'Only patients can respond to info requests' });
            return;
          }
          if (claim.patientId !== userId) {
            res.status(403).json({ error: 'Access denied' });
            return;
          }
          if (['PAID', 'REJECTED', 'WITHDRAWN', 'APPROVED'].includes(claim.status)) {
            res.status(400).json({ error: 'Cannot respond to a closed claim' });
            return;
          }

          const { response, infoRequestId } = actionReq.payload as z.infer<typeof respondInfoSchema>;
          const infoRequest = await prisma.infoRequest.findUnique({ where: { id: infoRequestId } });
          if (!infoRequest || infoRequest.claimId !== claim.id) {
            res.status(404).json({ error: 'Info request not found' });
            return;
          }
          if (infoRequest.respondedAt) {
            res.status(400).json({ error: 'This info request has already been responded to' });
            return;
          }

          await prisma.infoRequest.update({ where: { id: infoRequestId }, data: { response: response ?? '', respondedAt: new Date() } });

          result = await prisma.claim.update({ where: { id: claim.id }, data: { status: 'INFO_RESPONDED' }, include: claimInclude });

          await prisma.claimEvent.create({
            data: { claimId: claim.id, userId, action: 'INFO_RESPONDED', fromStatus: claim.status, toStatus: 'INFO_RESPONDED', note: response },
          });

          if (claim.adjusterId) {
            await createNotification({
              userId: claim.adjusterId,
              title: 'Information Received',
              message: `Patient has responded to info request for claim ${claim.claimNumber}.`,
              type: 'info',
              link: `/adjuster/claims/${claim.id}`,
              prefKey: 'infoRequested',
            });
          }
          break;
        }

        case 'RESUBMIT': {
          if (role !== 'PATIENT') {
            res.status(403).json({ error: 'Only patients can resubmit claims' });
            return;
          }
          if (claim.patientId !== userId) {
            res.status(403).json({ error: 'Access denied' });
            return;
          }
          if (claim.status !== 'REJECTED') {
            res.status(400).json({ error: 'Only REJECTED claims can be resubmitted' });
            return;
          }

          result = await prisma.claim.update({
            where: { id: claim.id },
            data: { status: 'SUBMITTED', adjusterId: null },
            include: claimInclude,
          });

          await prisma.claimEvent.create({
            data: { claimId: claim.id, userId, action: 'RESUBMITTED', fromStatus: 'REJECTED', toStatus: 'SUBMITTED' },
          });

          autoAssignClaim(claim.id, claim.claimNumber, userId, claim.provider?.specialty).catch((err: unknown) => {
            console.error('[Assignment] Auto-assign failed for claim', claim.claimNumber, err);
          });

          const adjusters = await prisma.user.findMany({ where: { role: 'ADJUSTER', isActive: true }, select: { id: true } });
          await Promise.all(
            adjusters.map((a) =>
              createNotification({
                userId: a.id,
                title: 'Claim Resubmitted',
                message: `Claim ${claim.claimNumber} has been resubmitted and awaits assignment.`,
                type: 'info',
                link: `/adjuster/claims/${claim.id}`,
                prefKey: 'claimSubmitted',
              })
            )
          );

          await createNotification({
            userId: claim.patientId,
            title: 'Claim Resubmitted',
            message: `Your claim ${claim.claimNumber} has been resubmitted and is awaiting review.`,
            type: 'success',
            link: `/claims/${claim.id}`,
            prefKey: 'claimSubmitted',
          });
          break;
        }

        case 'OVERRIDE_FILING_DEADLINE': {
          if (role !== 'ADMIN') {
            res.status(403).json({ error: 'Only admins can override filing deadlines' });
            return;
          }
          if (claim.status !== 'DRAFT') {
            res.status(400).json({ error: 'Filing deadline override can only be applied to DRAFT claims' });
            return;
          }

          const { reason } = actionReq.payload as z.infer<typeof overrideFilingDeadlineSchema>;
          const deadlineCheck = checkFilingDeadline(new Date(claim.incidentDate), new Date(), claim.policy.filingDeadlineDays);

          await prisma.claim.update({
            where: { id: claim.id },
            data: { filingDeadlineOverride: true },
          });

          await createAuditLog({
            userId,
            action: 'OVERRIDE_FILING_DEADLINE',
            resource: 'Claim',
            resourceId: claim.id,
            details: {
              claimNumber: claim.claimNumber,
              reason,
              daysSinceIncident: deadlineCheck.daysSinceIncident,
              deadlineDays: deadlineCheck.deadlineDays,
            },
            ipAddress: req.ip,
          });

          res.json({
            message: 'Filing deadline override applied. The claim may now be submitted.',
            claimId: claim.id,
            claimNumber: claim.claimNumber,
          });
          return;
        }

        case 'APPEAL': {
          if (role !== 'PATIENT') {
            res.status(403).json({ error: 'Only patients can appeal claims' });
            return;
          }
          if (claim.patientId !== userId) {
            res.status(403).json({ error: 'Access denied' });
            return;
          }
          if (claim.status !== 'REJECTED') {
            res.status(400).json({ error: 'Only REJECTED claims can be appealed' });
            return;
          }

          const { reason } = actionReq.payload as z.infer<typeof initiateAppealSchema>;
          const rejectionEvent = await prisma.claimEvent.findFirst({
            where: { claimId: claim.id, action: 'REJECTED' },
            orderBy: { createdAt: 'desc' },
          });
          const originalAdjudicatorId = rejectionEvent?.userId ?? claim.adjusterId;

          result = await prisma.claim.update({
            where: { id: claim.id },
            data: {
              status: 'APPEAL_PENDING',
              appealReason: reason,
              originalAdjudicatorId: originalAdjudicatorId ?? undefined,
              adjusterId: null,
            },
            include: claimInclude,
          });

          await prisma.claimEvent.create({
            data: {
              claimId: claim.id,
              userId,
              action: 'APPEAL_INITIATED',
              fromStatus: 'REJECTED',
              toStatus: 'APPEAL_PENDING',
              note: reason,
            },
          });

          if (originalAdjudicatorId) {
            await createNotification({
              userId: originalAdjudicatorId,
              title: 'Appeal Filed on Your Decision',
              message: `The patient has filed an internal appeal on claim ${claim.claimNumber}, which you previously rejected. A different adjudicator will review it.`,
              type: 'info',
              link: `/adjuster/claims/${claim.id}`,
              prefKey: 'appealPending',
            });
          }

          const adjusters = await prisma.user.findMany({
            where: { role: 'ADJUSTER', isActive: true, id: { not: originalAdjudicatorId ?? undefined } },
            select: { id: true },
          });
          await Promise.all(
            adjusters.map((a) =>
              createNotification({
                userId: a.id,
                title: 'Appeal Pending Assignment',
                message: `Claim ${claim.claimNumber} has entered appeal and needs a second adjudicator.`,
                type: 'warning',
                link: `/adjuster/claims/${claim.id}`,
                prefKey: 'appealPending',
              })
            )
          );

          await createNotification({
            userId: claim.patientId,
            title: 'Appeal Initiated',
            message: `Your appeal for claim ${claim.claimNumber} has been submitted and is pending review.`,
            type: 'info',
            link: `/claims/${claim.id}`,
            prefKey: 'claimSubmitted',
          });

          auditAction = 'INITIATE_APPEAL';
          break;
        }

        case 'ASSIGN_APPEAL': {
          if (!['ADJUSTER', 'ADMIN'].includes(role)) {
            res.status(403).json({ error: 'Only adjusters and admins can assign appeals' });
            return;
          }
          if (claim.status !== 'APPEAL_PENDING') {
            res.status(400).json({ error: 'Claim must be in APPEAL_PENDING status to assign an appeal adjudicator' });
            return;
          }

          const { adjusterId } = actionReq.payload as z.infer<typeof assignSchema>;
          const adjuster = await prisma.user.findUnique({ where: { id: adjusterId } });
          if (!adjuster || adjuster.role !== 'ADJUSTER') {
            res.status(400).json({ error: 'Invalid adjuster' });
            return;
          }

          if (claim.originalAdjudicatorId && adjusterId === claim.originalAdjudicatorId) {
            res.status(400).json({
              error: 'The appeal adjudicator must be different from the adjudicator who made the original rejection decision',
            });
            return;
          }

          result = await prisma.claim.update({
            where: { id: claim.id },
            data: { adjusterId },
            include: claimInclude,
          });

          await prisma.claimEvent.create({
            data: {
              claimId: claim.id,
              userId,
              action: 'ASSIGNED',
              fromStatus: 'APPEAL_PENDING',
              toStatus: 'APPEAL_PENDING',
              note: `Appeal assigned to ${adjuster.firstName} ${adjuster.lastName}`,
            },
          });

          await createNotification({
            userId: adjusterId,
            title: 'Appeal Assigned to You',
            message: `Appeal for claim ${claim.claimNumber} has been assigned to you for review.`,
            type: 'warning',
            link: `/adjuster/claims/${claim.id}`,
            prefKey: 'claimUnderReview',
          });

          auditAction = 'ASSIGN_APPEAL';
          break;
        }

        case 'RESOLVE_APPEAL': {
          if (role !== 'ADJUSTER') {
            res.status(403).json({ error: 'Only adjusters can resolve appeals' });
            return;
          }
          if (claim.status !== 'APPEAL_PENDING') {
            res.status(400).json({ error: 'Claim must be in APPEAL_PENDING status to resolve an appeal' });
            return;
          }

          if (claim.adjusterId !== userId) {
            res.status(403).json({ error: 'Only the assigned adjudicator may resolve this appeal' });
            return;
          }

          const { resolution, notes } = actionReq.payload as z.infer<typeof resolveAppealSchema>;
          const toStatus = resolution === 'APPEAL_APPROVED' ? 'UNDER_REVIEW' : 'APPEAL_DENIED';

          result = await prisma.claim.update({
            where: { id: claim.id },
            data: {
              status: toStatus,
              adjusterNotes: notes ?? claim.adjusterNotes,
            },
            include: claimInclude,
          });

          await prisma.claimEvent.create({
            data: {
              claimId: claim.id,
              userId,
              action: 'APPEAL_RESOLVED',
              fromStatus: 'APPEAL_PENDING',
              toStatus,
              note: notes,
            },
          });

          if (resolution === 'APPEAL_APPROVED') {
            await createNotification({
              userId: claim.patientId,
              title: 'Appeal Approved — Claim Under Review',
              message: `Your appeal for claim ${claim.claimNumber} was successful. The claim is now back under review.`,
              type: 'success',
              link: `/claims/${claim.id}`,
              prefKey: 'claimApproved',
            });
          } else {
            await createNotification({
              userId: claim.patientId,
              title: 'Appeal Denied',
              message: `Your internal appeal for claim ${claim.claimNumber} was denied. You have the right to request an independent external review.`,
              type: 'error',
              link: `/claims/${claim.id}`,
              prefKey: 'claimRejected',
            });
            await sendAppealDenied(claim.patient.email, claim.claimNumber, notes ?? '');
          }

          auditAction = 'RESOLVE_APPEAL';
          break;
        }

        case 'EXTERNAL_PRIMARY': {
          if (!['FINANCE_OFFICER', 'ADMIN'].includes(role)) {
            res.status(403).json({ error: 'Only finance officers and admins can enter external primary EOB' });
            return;
          }

          const { primaryInsurerName, primaryPaidAmount, primaryEOBDate } = actionReq.payload as z.infer<typeof externalPrimarySchema>;

          result = await prisma.claim.update({
            where: { id: claim.id },
            data: {
              cobDetail: {
                upsert: {
                  create: { primaryInsurerName, primaryPaidAmount, primaryEOBDate },
                  update: { primaryInsurerName, primaryPaidAmount, primaryEOBDate },
                },
              },
            },
            include: claimInclude,
          });

          await createAuditLog({
            userId,
            action: 'EXTERNAL_PRIMARY_EOB',
            resource: 'Claim',
            resourceId: claim.id,
            details: { claimNumber: claim.claimNumber, primaryInsurerName, primaryPaidAmount },
            ipAddress: req.ip,
          });

          auditAction = 'EXTERNAL_PRIMARY';
          break;
        }

        case 'INITIATE_SECONDARY': {
          if (!['FINANCE_OFFICER', 'ADMIN'].includes(role)) {
            res.status(403).json({ error: 'Only finance officers and admins can initiate secondary claims' });
            return;
          }
          if (!claim.cobFlag) {
            res.status(400).json({ error: 'This claim is not flagged as a COB scenario' });
            return;
          }
          if (claim.secondaryClaimId) {
            res.status(409).json({ error: 'A secondary claim has already been initiated for this claim' });
            return;
          }

          const { secondaryPolicyId, notes: cobNotes } = actionReq.payload as z.infer<typeof initiateSecondarySchema>;
          const primaryPaid = claim.status === 'PAID' && (await prisma.payout.findFirst({ where: { claimId: claim.id } }));
          const externalPrimaryEntered = !!claim.cobDetail && claim.cobDetail.primaryPaidAmount !== undefined && claim.cobDetail.primaryPaidAmount !== null;

          if (!primaryPaid && !externalPrimaryEntered) {
            res.status(400).json({ error: 'Primary claim must be paid (or external primary EOB entered) before initiating secondary claim' });
            return;
          }

          const secondaryUserPolicy = await prisma.userPolicy.findUnique({
            where: { userId_policyId: { userId: claim.patientId, policyId: secondaryPolicyId } },
            include: { policy: true },
          });
          if (!secondaryUserPolicy || new Date(secondaryUserPolicy.policy.expiryDate) < new Date()) {
            res.status(400).json({ error: 'Secondary policy not found or expired for this patient' });
            return;
          }
          if (secondaryUserPolicy.payerOrder !== 'SECONDARY') {
            res.status(400).json({ error: 'The selected policy is not configured as SECONDARY payer order' });
            return;
          }

          let primaryPatientResponsibility: number;
          if (claim.cobDetail?.patientResponsibility !== undefined && claim.cobDetail.patientResponsibility !== null) {
            primaryPatientResponsibility = claim.cobDetail.patientResponsibility;
          } else if (primaryPaid) {
            const payout = await prisma.payout.findFirst({ where: { claimId: claim.id } });
            primaryPatientResponsibility = payout ? Math.max(0, claim.totalAmount - payout.amount) : claim.totalAmount;
          } else {
            primaryPatientResponsibility = claim.totalAmount;
          }

          const secondaryTotalAmount = primaryPatientResponsibility;
          const primaryAmountPaid = claim.cobDetail?.primaryPaidAmount ?? (await prisma.payout.findFirst({ where: { claimId: claim.id } }))?.amount ?? 0;
          const maxSecondary = Math.max(0, claim.totalAmount - primaryAmountPaid);

          const planYearStart = getPlanYearStart(
            { startDate: secondaryUserPolicy.startDate, planYearType: secondaryUserPolicy.planYearType },
            new Date(claim.incidentDate),
          );
          const claimNetworkStatus = (claim.networkStatus as 'IN' | 'OUT') ?? 'IN';

          const [deductiblePaid, oopPaid] = await Promise.all([
            getDeductiblePaid(claim.patientId, secondaryPolicyId, planYearStart, undefined, claimNetworkStatus),
            getOopPaid(claim.patientId, secondaryPolicyId, planYearStart, undefined, claimNetworkStatus),
          ]);

          const { eligibleAmount, deductible, reimbursable: rawReimbursable } = calculateEligible(
            secondaryTotalAmount,
            secondaryUserPolicy.policy,
            deductiblePaid,
            oopPaid,
            claimNetworkStatus,
          );

          const reimbursable = Math.min(rawReimbursable, maxSecondary);
          const secondaryClaimNumber = await generateClaimNumber();

          const secondaryClaim = await prisma.claim.create({
            data: {
              claimNumber: secondaryClaimNumber,
              patientId: claim.patientId,
              policyId: secondaryPolicyId,
              type: claim.type,
              description: `Secondary COB claim for ${claim.claimNumber}${cobNotes ? ` — ${cobNotes}` : ''}`,
              incidentDate: claim.incidentDate,
              totalAmount: secondaryTotalAmount,
              eligibleAmount,
              deductible,
              reimbursable,
              status: 'SUBMITTED',
              networkStatus: claim.networkStatus ?? 'IN',
              cobFlag: true,
              planYearStart,
              ...(claim.providerId ? { providerId: claim.providerId } : {}),
            },
            include: claimInclude,
          });

          await prisma.claim.update({
            where: { id: claim.id },
            data: { secondaryClaimId: secondaryClaim.id },
          });

          await prisma.claimEvent.create({
            data: {
              claimId: secondaryClaim.id,
              userId,
              action: 'SUBMITTED',
              fromStatus: 'DRAFT',
              toStatus: 'SUBMITTED',
              note: `COB secondary claim initiated from primary claim ${claim.claimNumber}`,
            },
          });

          result = secondaryClaim;
          auditAction = 'COB_INITIATE_SECONDARY';
          break;
        }

        case 'REASSIGN': {
          if (role !== 'ADMIN') {
            res.status(403).json({ error: 'Only admins can reassign claims' });
            return;
          }

          const { adjusterId } = actionReq.payload as z.infer<typeof reassignSchema>;
          const adjuster = await prisma.user.findUnique({ where: { id: adjusterId } });
          if (!adjuster || adjuster.role !== 'ADJUSTER' || !adjuster.isActive) {
            res.status(400).json({ error: 'Invalid or inactive adjuster' });
            return;
          }

          const previousAdjusterId = claim.assignedAdjusterId;

          await prisma.claim.update({
            where: { id: claim.id },
            data: { assignedAdjusterId: adjusterId, status: 'UNDER_REVIEW' },
          });

          await prisma.claimEvent.create({
            data: {
              claimId: claim.id,
              userId,
              action: 'REASSIGNED',
              fromStatus: claim.status,
              toStatus: 'UNDER_REVIEW',
              note: `Manually reassigned to ${adjuster.firstName} ${adjuster.lastName} by admin`,
            },
          });

          await createNotification({
            userId: adjusterId,
            title: 'Claim Assigned to You',
            message: `Claim ${claim.claimNumber} has been assigned to you.`,
            type: 'info',
            link: `/adjuster/claims/${claim.id}`,
            prefKey: 'claimUnderReview',
          });

          await createAuditLog({
            userId,
            action: 'ADMIN_REASSIGN_CLAIM',
            resource: 'Claim',
            resourceId: claim.id,
            details: { claimNumber: claim.claimNumber, from: previousAdjusterId, to: adjusterId },
            ipAddress: req.ip,
          });

          result = await prisma.claim.findUnique({ where: { id: claim.id }, include: claimInclude });
          auditAction = 'REASSIGN';
          break;
        }

        case 'ADJUDICATE_LINE': {
          if (!['ADJUSTER', 'ADMIN'].includes(role)) {
            res.status(403).json({ error: 'Only adjusters and admins can adjudicate lines' });
            return;
          }
          if (!['UNDER_REVIEW', 'INFO_REQUESTED', 'INFO_RESPONDED'].includes(claim.status)) {
            res.status(400).json({ error: 'Claim must be UNDER_REVIEW or INFO_REQUESTED to adjudicate lines' });
            return;
          }
          if (claim.lines.length === 0) {
            res.status(400).json({ error: 'This claim has no line items' });
            return;
          }

          const { lineId, adjudicationStatus, allowedAmount, denialReason, adjudicatorNote } = actionReq.payload as z.infer<typeof adjudicateLineSchema> & {
            lineId: string;
          };

          const line = claim.lines.find((l) => l.id === lineId);
          if (!line) {
            res.status(404).json({ error: 'Line not found on this claim' });
            return;
          }

          if (adjudicationStatus === 'REDUCED' && allowedAmount === undefined) {
            res.status(400).json({ error: 'allowedAmount is required when status is REDUCED' });
            return;
          }
          if (adjudicationStatus === 'DENIED' && !denialReason) {
            res.status(400).json({ error: 'denialReason is required when status is DENIED' });
            return;
          }

          if (adjudicationStatus === 'APPROVED') {
            const resolvedAllowed = allowedAmount ?? line.billedAmount;
            await prisma.claimLine.update({
              where: { id: line.id },
              data: { adjudicationStatus: 'APPROVED', allowedAmount: resolvedAllowed, adjudicatorNote: adjudicatorNote ?? null },
            });
          } else {
            await prisma.claimLine.update({
              where: { id: line.id },
              data: {
                adjudicationStatus,
                allowedAmount: adjudicationStatus === 'REDUCED' ? allowedAmount! : null,
                denialReason: denialReason ?? null,
                adjudicatorNote: adjudicatorNote ?? null,
              },
            });
          }

          const updatedLines = await prisma.claimLine.findMany({
            where: { claimId: claim.id },
            orderBy: { lineNumber: 'asc' },
          });

          const totalAllowed = updatedLines
            .filter((l) => l.adjudicationStatus === 'APPROVED' || l.adjudicationStatus === 'REDUCED')
            .reduce((sum, l) => sum + (l.allowedAmount ?? 0), 0);

          const newClaimStatus = deriveClaimStatusFromLines(updatedLines);

          let eligibilityUpdate: { eligibleAmount?: number; deductible?: number; reimbursable?: number; totalAllowed?: number } = {
            totalAllowed,
          };

          if (newClaimStatus !== 'UNDER_REVIEW') {
            const amountForElig = totalAllowed > 0 ? totalAllowed : 0;
            const planYearStart = claim.planYearStart ?? new Date(new Date().getFullYear(), 0, 1);
            const claimNetworkStatus = (claim.networkStatus as 'IN' | 'OUT') ?? 'IN';
            const [deductiblePaid, oopPaid] = await Promise.all([
              getDeductiblePaid(claim.patientId, claim.policyId, planYearStart, claim.id, claimNetworkStatus),
              getOopPaid(claim.patientId, claim.policyId, planYearStart, claim.id, claimNetworkStatus),
            ]);
            const { eligibleAmount, deductible, reimbursable } = calculateEligible(
              amountForElig,
              claim.policy,
              deductiblePaid,
              oopPaid,
              claimNetworkStatus,
            );
            eligibilityUpdate = { ...eligibilityUpdate, eligibleAmount, deductible, reimbursable };
          }

          await prisma.claim.update({
            where: { id: claim.id },
            data: { status: newClaimStatus, ...eligibilityUpdate },
          });

          await prisma.claimEvent.create({
            data: {
              claimId: claim.id,
              userId,
              action: `LINE_${adjudicationStatus}`,
              fromStatus: claim.status,
              toStatus: newClaimStatus,
              lineId: line.id,
              note: adjudicatorNote ?? denialReason ?? null,
            },
          });

          result = await prisma.claim.findUnique({ where: { id: claim.id }, include: claimInclude });
          auditAction = 'ADJUDICATE_LINE';
          break;
        }

        default: {
          const _exhaustive: never = actionReq;
          return _exhaustive;
        }
      }

      // Create audit log for non-filing-deadline actions (they have their own audit logging)
      if ((actionReq as any).action !== 'OVERRIDE_FILING_DEADLINE') {
        await createAuditLog({
          userId,
          action: auditAction,
          resource: 'Claim',
          resourceId: claimId,
          details: { claimNumber: claim.claimNumber, action: (actionReq as any).action },
          ipAddress: req.ip,
        });
      }

      res.json(parseDiagnosisCodes(result!));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
