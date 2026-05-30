import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { validate } from '../middleware/validate';
import { createAuditLog } from '../utils/audit';
import { validateNpi } from '../utils/npi';
import { getPaginationParams } from '../utils/pagination';

const router = Router();

const PROVIDER_TYPES = ['PHYSICIAN', 'HOSPITAL', 'CLINIC', 'OTHER'] as const;

const createProviderSchema = z.object({
  npi: z
    .string()
    .regex(/^\d{10}$/, 'NPI must be exactly 10 digits')
    .refine(validateNpi, 'NPI failed Luhn checksum validation'),
  name: z.string().min(1, 'Name is required').max(200),
  providerType: z.enum(PROVIDER_TYPES),
  inNetwork: z.boolean().default(false),
  specialty: z.string().max(200).optional(),
});

const updateProviderSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  providerType: z.enum(PROVIDER_TYPES).optional(),
  inNetwork: z.boolean().optional(),
  specialty: z.string().max(200).nullable().optional(),
});

/**
 * @openapi
 * /providers:
 *   get:
 *     tags: [Providers]
 *     summary: Search providers by NPI or name (authenticated users)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: inNetwork
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
 *     responses:
 *       200:
 *         description: Paginated list of providers
 */
router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        search,
        inNetwork,
        page = '1',
        limit = '20',
      } = req.query as Record<string, string>;

      const { pageNum, limitNum, skip } = getPaginationParams(page, limit);

      const where: Record<string, unknown> = {};
      if (inNetwork === 'true') where['inNetwork'] = true;
      if (inNetwork === 'false') where['inNetwork'] = false;
      if (search) {
        where['OR'] = [
          { npi: { contains: search } },
          { name: { contains: search } },
          { specialty: { contains: search } },
        ];
      }

      const [total, providers] = await Promise.all([
        prisma.provider.count({ where }),
        prisma.provider.findMany({
          where,
          orderBy: { name: 'asc' },
          skip,
          take: limitNum,
        }),
      ]);

      res.json({ providers, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /providers/{id}:
 *   get:
 *     tags: [Providers]
 *     summary: Get a provider by ID
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
 *         description: Provider record
 *       404:
 *         description: Provider not found
 */
router.get(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const provider = await prisma.provider.findUnique({ where: { id: req.params['id'] } });
      if (!provider) { res.status(404).json({ error: 'Provider not found' }); return; }
      res.json(provider);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /providers:
 *   post:
 *     tags: [Providers]
 *     summary: Create a provider (Admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [npi, name, providerType]
 *             properties:
 *               npi: { type: string }
 *               name: { type: string }
 *               providerType: { type: string, enum: [PHYSICIAN, HOSPITAL, CLINIC, OTHER] }
 *               inNetwork: { type: boolean }
 *               specialty: { type: string }
 *     responses:
 *       201:
 *         description: Provider created
 *       409:
 *         description: NPI already exists
 */
router.post(
  '/',
  authenticate,
  requireRole('ADMIN'),
  validate(createProviderSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = req.body as z.infer<typeof createProviderSchema>;

      const existing = await prisma.provider.findUnique({ where: { npi: data.npi } });
      if (existing) {
        res.status(409).json({ error: `A provider with NPI ${data.npi} already exists` });
        return;
      }

      const provider = await prisma.provider.create({ data });

      await createAuditLog({
        userId: req.user!.id,
        action: 'CREATE_PROVIDER',
        resource: 'Provider',
        resourceId: provider.id,
        details: { npi: provider.npi, name: provider.name },
        ipAddress: req.ip,
      });

      res.status(201).json(provider);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /providers/{id}:
 *   put:
 *     tags: [Providers]
 *     summary: Update a provider (Admin only)
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
 *         description: Provider updated
 *       404:
 *         description: Provider not found
 */
router.put(
  '/:id',
  authenticate,
  requireRole('ADMIN'),
  validate(updateProviderSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = req.body as z.infer<typeof updateProviderSchema>;

      const existing = await prisma.provider.findUnique({ where: { id: req.params['id'] } });
      if (!existing) { res.status(404).json({ error: 'Provider not found' }); return; }

      const provider = await prisma.provider.update({
        where: { id: req.params['id'] },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.providerType !== undefined && { providerType: data.providerType }),
          ...(data.inNetwork !== undefined && { inNetwork: data.inNetwork }),
          ...(data.specialty !== undefined && { specialty: data.specialty }),
        },
      });

      await createAuditLog({
        userId: req.user!.id,
        action: 'UPDATE_PROVIDER',
        resource: 'Provider',
        resourceId: provider.id,
        details: data as Record<string, unknown>,
        ipAddress: req.ip,
      });

      res.json(provider);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
