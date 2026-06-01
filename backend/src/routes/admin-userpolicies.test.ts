import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/prisma', () => {
  const mockPrisma = {
    userPolicy: { findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
  };

  return {
    default: mockPrisma,
  };
});

vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'admin-1', email: 'admin@test.com', role: 'ADMIN' };
    next();
  },
}));

vi.mock('../utils/audit', () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));

import prisma from '../lib/prisma';
import adminRouter from './admin';
import { errorHandler } from '../middleware/error';

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);
  app.use(errorHandler);
  return app;
};

const makeUserPolicy = (id: string, userId: string, policyId: string) => ({
  id,
  userId,
  policyId,
  startDate: new Date(),
  planYearType: 'CALENDAR',
  payerOrder: 'PRIMARY',
  createdAt: new Date(),
  deletedAt: null,
});

describe('DELETE /admin/user-policies/bulk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes all active assignments and returns them in the processed list', async () => {
    vi.mocked(prisma.userPolicy.findMany).mockResolvedValue([
      makeUserPolicy('up1', 'user-1', 'policy-1'),
      makeUserPolicy('up2', 'user-2', 'policy-2'),
    ] as never);
    vi.mocked(prisma.userPolicy.update).mockResolvedValue({} as never);

    const res = await request(buildApp())
      .delete('/admin/user-policies/bulk')
      .send({ userPolicyIds: ['up1', 'up2'] });

    expect(res.status).toBe(200);
    expect(res.body.processed).toHaveLength(2);
    expect(res.body.errors).toHaveLength(0);
    expect(res.body.processed[0]).toMatchObject({ userPolicyId: 'up1', userId: 'user-1', policyId: 'policy-1' });
  });

  it('skips already-deleted assignments and continues processing', async () => {
    vi.mocked(prisma.userPolicy.findMany).mockResolvedValue([
      makeUserPolicy('up2', 'user-2', 'policy-2'),
    ] as never);
    vi.mocked(prisma.userPolicy.update).mockResolvedValue({} as never);

    const res = await request(buildApp())
      .delete('/admin/user-policies/bulk')
      .send({ userPolicyIds: ['up1', 'up2'] });

    expect(res.status).toBe(200);
    expect(res.body.processed).toHaveLength(1);
    expect(res.body.processed[0].userPolicyId).toBe('up2');
  });

  it('returns 400 when no active assignments match the provided IDs', async () => {
    vi.mocked(prisma.userPolicy.findMany).mockResolvedValue([]);

    const res = await request(buildApp())
      .delete('/admin/user-policies/bulk')
      .send({ userPolicyIds: ['nonexistent'] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no active assignments/i);
  });

  it('returns 400 when userPolicyIds array is empty', async () => {
    const res = await request(buildApp())
      .delete('/admin/user-policies/bulk')
      .send({ userPolicyIds: [] });

    expect(res.status).toBe(400);
  });
});
