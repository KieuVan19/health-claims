import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

const FEATURE_KEYS = ['diagnosisCodesEnabled', 'cptCodesEnabled'] as const;

router.get(
  '/',
  authenticate,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rows = await prisma.systemSetting.findMany({
        where: { key: { in: [...FEATURE_KEYS] } },
      });

      const defaults: Record<(typeof FEATURE_KEYS)[number], boolean> = {
        diagnosisCodesEnabled: false,
        cptCodesEnabled: false,
      };

      const result = { ...defaults };
      for (const row of rows) {
        const key = row.key as (typeof FEATURE_KEYS)[number];
        result[key] = row.value === 'true';
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
