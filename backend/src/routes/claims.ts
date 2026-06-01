import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { requirePatientOwnershipIfPatient } from '../middleware/ownership';
import { validate } from '../middleware/validate';
import { createAuditLog, logRead } from '../utils/audit';
import { createNotification } from '../utils/notification';
import { generateClaimNumber } from '../utils/claimNumber';
import { getPaginationParams, createPaginatedResponse } from '../utils/pagination';
import { checkPatientOwnershipIfPatient, checkPatientOwnership } from '../utils/ownership';
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
import { CLAIM_STATUSES, USER_ROLES, CLAIM_TYPES, NETWORK_STATUSES, ADJUDICATION_STATUSES, OPEN_CLAIM_STATUSES } from '../constants/enums';

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
  type: z.enum([CLAIM_TYPES.HOSPITALIZATION, CLAIM_TYPES.OUTPATIENT, CLAIM_TYPES.DENTAL, CLAIM_TYPES.VISION, CLAIM_TYPES.PHARMACY] as const),
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
  adjudicationStatus: z.enum([ADJUDICATION_STATUSES.APPROVED, ADJUDICATION_STATUSES.DENIED, ADJUDICATION_STATUSES.REDUCED] as const),
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

const initiateSecondarySchema = z.object({
  secondaryPolicyId: z.string().min(1, 'Secondary policy ID is required'),
  notes: z.string().optional(),
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
  const reference = [CLAIM_STATUSES.PAID, CLAIM_STATUSES.REJECTED, 'WITHDRAWN', CLAIM_STATUSES.APPEAL_DENIED, CLAIM_STATUSES.APPROVED, CLAIM_STATUSES.PARTIALLY_APPROVED].includes(claim.status)
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
  const terminalStatuses = [CLAIM_STATUSES.PAID, CLAIM_STATUSES.REJECTED, 'WITHDRAWN', CLAIM_STATUSES.APPEAL_DENIED, CLAIM_STATUSES.APPROVED, CLAIM_STATUSES.PARTIALLY_APPROVED, CLAIM_STATUSES.DRAFT];
  if (terminalStatuses.includes(claim.status) || !submittedAt) return null;
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

      const { pageNum, limitNum, skip } = getPaginationParams(page, limit);

      const where: Record<string, unknown> = { deletedAt: null };
      if (role === USER_ROLES.PATIENT) where['patientId'] = userId;
      if (role === USER_ROLES.ADJUSTER && myAppeals === 'true') {
        // All appeals on claims this adjuster originally rejected — regardless of current status
        where['originalAdjudicatorId'] = userId;
      } else if (role === USER_ROLES.ADJUSTER && history === 'true') {
        where['adjusterId'] = userId;
        where['status'] = { in: [CLAIM_STATUSES.APPROVED, CLAIM_STATUSES.PARTIALLY_APPROVED, CLAIM_STATUSES.REJECTED, CLAIM_STATUSES.PAID, 'WITHDRAWN', CLAIM_STATUSES.APPEAL_DENIED] };
      } else if (role === USER_ROLES.ADJUSTER && unassigned === 'true') {
        // Show claims with no auto-assignment and no active adjuster
        where['adjusterId'] = null;
        where['assignedAdjusterId'] = null;
        where['status'] = { in: [CLAIM_STATUSES.SUBMITTED, CLAIM_STATUSES.APPEAL_PENDING] };
        // Exclude appeal claims that this adjuster originally rejected — they cannot self-assign
        where['AND'] = [
          { OR: [{ originalAdjudicatorId: null }, { originalAdjudicatorId: { not: userId } }] },
        ];
      } else if (role === USER_ROLES.ADJUSTER) {
        // "Mine" tab: claims auto-assigned to this adjuster OR actively assigned for review
        where['OR'] = [{ assignedAdjusterId: userId }, { adjusterId: userId }];
        if (status) {
          where['status'] = status;
        } else {
          // Default: only claims actively being processed
          where['status'] = { in: [CLAIM_STATUSES.SUBMITTED, CLAIM_STATUSES.UNDER_REVIEW, CLAIM_STATUSES.INFO_REQUESTED, CLAIM_STATUSES.INFO_RESPONDED, CLAIM_STATUSES.APPEAL_PENDING] };
        }
      } else if (status) {
        where['status'] = status;
      } else if (role !== USER_ROLES.PATIENT) {
        where['status'] = { not: CLAIM_STATUSES.DRAFT };
      }
      if (type) where['type'] = type;
      if (dateFrom || dateTo) {
        where['incidentDate'] = {
          ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
          ...(dateTo ? { lte: new Date(new Date(dateTo).setHours(23, 59, 59, 999)) } : {}),
        };
      }
      if (search) {
        where['OR'] = [
          { claimNumber: { contains: search } },
          { description: { contains: search } },
          { patient: { firstName: { contains: search } } },
          { patient: { lastName: { contains: search } } },
        ];
      }

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
            where: { claimId: { in: claimIds }, toStatus: CLAIM_STATUSES.SUBMITTED },
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

      res.json(createPaginatedResponse(claimsWithSla, total, pageNum, limitNum));
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
          status: { in: [CLAIM_STATUSES.APPROVED, CLAIM_STATUSES.PARTIALLY_APPROVED, CLAIM_STATUSES.PAID] },
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
            status: { in: [CLAIM_STATUSES.APPROVED, CLAIM_STATUSES.PARTIALLY_APPROVED, CLAIM_STATUSES.PAID] },
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
          status: { notIn: [CLAIM_STATUSES.REJECTED, 'WITHDRAWN'] },
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
      let networkStatus: typeof NETWORK_STATUSES[keyof typeof NETWORK_STATUSES] = NETWORK_STATUSES.IN;
      if (data.providerId) {
        const prov = await prisma.provider.findUnique({ where: { id: data.providerId }, select: { inNetwork: true } });
        if (prov && !prov.inNetwork) networkStatus = NETWORK_STATUSES.OUT;
      }

      const [deductiblePaid, oopPaid] = await Promise.all([
        getDeductiblePaid(req.user!.id, data.policyId, planYearStart, undefined),
        getOopPaid(req.user!.id, data.policyId, planYearStart, undefined),
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

      const claim = await prisma.$transaction(async (tx) => {
        const newClaim = await tx.claim.create({
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
            status: CLAIM_STATUSES.DRAFT,
            networkStatus,
            fraudScore,
            fraudFlags: JSON.stringify(fraudFlagsList),
            diagnosisCodes: JSON.stringify(diagCodes),
            planYearStart,
            ...(data.providerId ? { providerId: data.providerId } : {}),
          },
        });

        if (data.lines && data.lines.length > 0) {
          await tx.claimLine.createMany({
            data: data.lines.map((line, idx) => ({
              claimId: newClaim.id,
              lineNumber: idx + 1,
              cptCode: line.cptCode,
              modifier: line.modifier ?? null,
              diagnosisPointers: JSON.stringify(line.diagnosisPointers),
              units: line.units,
              billedAmount: line.billedAmount,
              adjudicationStatus: ADJUDICATION_STATUSES.PENDING,
            })),
          });
        }

        await tx.claimEvent.create({
          data: {
            claimId: newClaim.id,
            userId: req.user!.id,
            action: 'CREATED',
            toStatus: CLAIM_STATUSES.DRAFT,
            note: 'Claim created as draft',
          },
        });

        return newClaim;
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
 *         name: claimId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Claim detail with events, documents, info requests
 *       404:
 *         description: Claim not found
 */
/** GET /claims/:claimId — get claim detail */
router.get(
  '/:claimId',
  authenticate,
  requirePatientOwnershipIfPatient('claim', 'claimId', { events: true, infoRequests: true, documents: true, lines: true, patient: true, adjuster: true, assignedAdjuster: true, policy: true, payout: true, cobDetail: true, secondaryClaim: true, primaryClaim: true }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const claim = req.resource!.claim;
      const isOwn = req.user!.role === USER_ROLES.PATIENT && claim.patientId === req.user!.id;
      logRead(req.user!.id, 'Claim', claim.id, req, isOwn);

      // Derive submittedAt and ack SLA from events already included in the claim
      const submittedEvent = claim.events.find((e: any) => e.toStatus === CLAIM_STATUSES.SUBMITTED);
      const underReviewEvent = claim.events.find((e: any) => e.toStatus === CLAIM_STATUSES.UNDER_REVIEW);
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

/** GET /claims/:claimId/type-summary — per-type usage for adjuster review */
router.get(
  '/:claimId/type-summary',
  authenticate,
  requireRole('ADJUSTER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const claim = await prisma.claim.findUnique({
        where: { id: req.params['claimId'] },
        include: { policy: true },
      });

      if (!claim) {
        res.status(404).json({ error: 'Claim not found' });
        return;
      }

      const claimTypes = [CLAIM_TYPES.HOSPITALIZATION, CLAIM_TYPES.OUTPATIENT, CLAIM_TYPES.DENTAL, CLAIM_TYPES.VISION, CLAIM_TYPES.PHARMACY] as const;
      const benefits = JSON.parse((claim.policy.benefits as string) || '{}') as Record<string, { limit?: number }>;
      const yearStart = new Date(new Date().getFullYear(), 0, 1);

      const typeUsages = await Promise.all(
        claimTypes.map(async (type) => {
          const agg = await prisma.claim.aggregate({
            where: {
              patientId: claim.patientId,
              policyId: claim.policyId,
              type,
              status: { in: [CLAIM_STATUSES.APPROVED, CLAIM_STATUSES.PARTIALLY_APPROVED, CLAIM_STATUSES.PAID] },
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
 *         name: claimId
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
/** GET /claims/:claimId/eob — download Explanation of Benefits PDF */
router.get(
  '/:claimId/eob',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const claim = await prisma.claim.findUnique({
        where: { id: req.params['claimId'] },
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

      if (!checkPatientOwnershipIfPatient(req.user!.role, claim.patientId, req.user!.id, res)) {
        return;
      }

      const validEobStatuses = [CLAIM_STATUSES.APPROVED, CLAIM_STATUSES.PARTIALLY_APPROVED, CLAIM_STATUSES.REJECTED, CLAIM_STATUSES.PAID] as const;
      if (!validEobStatuses.includes(claim.status as unknown as typeof validEobStatuses[number])) {
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
      const fallbackCopayRate = claim.networkStatus === 'OUT' ? claim.policy.copayPercentage * 2 : claim.policy.copayPercentage;
      pdfDoc.text(`Network Tier: ${fallbackNetworkLabel}`);
      pdfDoc.text(`Applied Copay Rate: ${fallbackCopayRate}%`);
      if (claim.adjuster) {
        pdfDoc.text(`Reviewed By: ${claim.adjuster.firstName} ${claim.adjuster.lastName}`);
      }
      pdfDoc.moveDown(1);

      if (claim.status === CLAIM_STATUSES.REJECTED && claim.adjusterNotes) {
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
      const insurancePaid = claim.status === CLAIM_STATUSES.REJECTED ? 0 : (claim.adjustedAmount ?? reimb);
      const patientResponsibility = claim.status === CLAIM_STATUSES.REJECTED ? claim.totalAmount : Math.max(0, claim.totalAmount - insurancePaid);

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
 *         name: claimId
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
/** PUT /claims/:claimId — update DRAFT claim */
;

const reassignSchema = z.object({
  adjusterId: z.string().min(1, 'Adjuster ID is required'),
});

;

// ─── Line-level adjudication ─────────────────────────────────────────────────

/**
 * Derive overall claim status from the current adjudication statuses of its lines.
 * Called after any line adjudication to keep the claim status in sync.
 */
function deriveClaimStatusFromLines(
  lines: { adjudicationStatus: string }[],
): typeof CLAIM_STATUSES[keyof typeof CLAIM_STATUSES] {
  if (lines.length === 0) return CLAIM_STATUSES.UNDER_REVIEW;
  const statuses = lines.map((l) => l.adjudicationStatus);
  const allApproved = statuses.every((s) => s === ADJUDICATION_STATUSES.APPROVED);
  const allDenied = statuses.every((s) => s === ADJUDICATION_STATUSES.DENIED);
  const anyPending = statuses.some((s) => s === ADJUDICATION_STATUSES.PENDING);

  if (anyPending) return CLAIM_STATUSES.UNDER_REVIEW;
  if (allApproved) return CLAIM_STATUSES.APPROVED;
  if (allDenied) return CLAIM_STATUSES.REJECTED;
  return CLAIM_STATUSES.PARTIALLY_APPROVED;
}

;

export default router;



