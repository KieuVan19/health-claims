import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/prisma', () => {
  const mockPrisma = {
    overpayment: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    claim: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
  };

  return {
    default: mockPrisma,
  };
});

vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'finance-1', email: 'finance@test.com', role: 'FINANCE_OFFICER' };
    next();
  },
}));

vi.mock('../utils/notification', () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../utils/audit', () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));

import prisma from '../lib/prisma';
import overpaymentRouter from './overpayments';
import { errorHandler } from '../middleware/error';

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/overpayments', overpaymentRouter);
  app.use(errorHandler);
  return app;
};

const makeOverpayment = (id: string, claimNumber: string, overpaidAmount = 100) => ({
  id,
  claimId: `claim-${id}`,
  overpaidAmount,
  status: 'IDENTIFIED',
  originalPayoutId: 'payout-1',
  reason: 'ADJUSTER_ERROR',
  waiverReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  claim: { patientId: 'patient-1', claimNumber },
});

describe('POST /overpayments/bulk-waive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('waives all identified overpayments and returns them in the processed list', async () => {
    const op1 = makeOverpayment('op1', 'CLM-001', 100);
    const op2 = makeOverpayment('op2', 'CLM-002', 200);
    vi.mocked(prisma.overpayment.findMany).mockResolvedValue([op1, op2] as never);
    vi.mocked(prisma.overpayment.update)
      .mockResolvedValueOnce({ ...op1, id: 'op1', waiverReason: 'Policy update' } as never)
      .mockResolvedValueOnce({ ...op2, id: 'op2', waiverReason: 'Policy update' } as never);

    const res = await request(buildApp())
      .post('/overpayments/bulk-waive')
      .send({ overpaymentIds: ['op1', 'op2'], waiverReason: 'Policy update' });

    expect(res.status).toBe(200);
    expect(res.body.processed).toHaveLength(2);
    expect(res.body.errors).toHaveLength(0);
    expect(res.body.processed[0]).toMatchObject({ overpaymentId: 'op1', claimNumber: 'CLM-001', overpaidAmount: 100 });
  });

  it('skips overpayments not in IDENTIFIED status and reports them as errors', async () => {
    const identified = makeOverpayment('op2', 'CLM-002', 200);
    vi.mocked(prisma.overpayment.findMany).mockResolvedValue([identified] as never);
    vi.mocked(prisma.overpayment.update).mockResolvedValue({ ...identified, id: 'op2', waiverReason: 'Policy update' } as never);

    const res = await request(buildApp())
      .post('/overpayments/bulk-waive')
      .send({ overpaymentIds: ['op1', 'op2'], waiverReason: 'Policy update' });

    expect(res.status).toBe(200);
    expect(res.body.processed).toHaveLength(1);
    expect(res.body.processed[0].overpaymentId).toBe('op2');
  });

  it('returns 400 when no identified overpayments match the provided IDs', async () => {
    vi.mocked(prisma.overpayment.findMany).mockResolvedValue([]);

    const res = await request(buildApp())
      .post('/overpayments/bulk-waive')
      .send({ overpaymentIds: ['nonexistent'], waiverReason: 'Policy update' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no identified/i);
  });

  it('returns 400 when overpaymentIds array is empty', async () => {
    const res = await request(buildApp())
      .post('/overpayments/bulk-waive')
      .send({ overpaymentIds: [], waiverReason: 'Policy update' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when waiverReason is missing', async () => {
    const res = await request(buildApp())
      .post('/overpayments/bulk-waive')
      .send({ overpaymentIds: ['op1'] });

    expect(res.status).toBe(400);
  });
});
