import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/prisma', () => {
  const mockPrisma = {
    policy: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    userPolicy: { findUnique: vi.fn(), create: vi.fn() },
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
import policiesRouter from './policies';
import { errorHandler } from '../middleware/error';

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/policies', policiesRouter);
  app.use(errorHandler);
  return app;
};

describe('POST /policies/:policyId/assign/:userId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assigns a policy to a patient successfully', async () => {
    const mockPolicy = { id: 'policy-1', name: 'Test Policy' };
    const mockUser = { id: 'user-1', email: 'patient@test.com', role: 'PATIENT', isActive: true };
    const mockUserPolicy = {
      id: 'up-1',
      userId: 'user-1',
      policyId: 'policy-1',
      policy: mockPolicy,
      user: { id: mockUser.id, email: mockUser.email, firstName: 'John', lastName: 'Doe' },
    };

    vi.mocked(prisma.policy.findUnique).mockResolvedValue(mockPolicy as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);
    vi.mocked(prisma.userPolicy.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.userPolicy.create).mockResolvedValue(mockUserPolicy as never);

    const res = await request(buildApp())
      .post('/policies/policy-1/assign/user-1')
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('up-1');
    expect(vi.mocked(prisma.userPolicy.create)).toHaveBeenCalled();
  });

  it('returns 404 when policy not found', async () => {
    vi.mocked(prisma.policy.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1', role: 'PATIENT' } as never);

    const res = await request(buildApp())
      .post('/policies/nonexistent/assign/user-1')
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Policy not found/i);
  });

  it('returns 404 when user not found', async () => {
    vi.mocked(prisma.policy.findUnique).mockResolvedValue({ id: 'policy-1' } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await request(buildApp())
      .post('/policies/policy-1/assign/nonexistent')
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/User not found/i);
  });

  it('returns 400 when user is not a patient', async () => {
    vi.mocked(prisma.policy.findUnique).mockResolvedValue({ id: 'policy-1' } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      role: 'ADJUSTER',
      isActive: true,
    } as never);

    const res = await request(buildApp())
      .post('/policies/policy-1/assign/user-1')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/can only be assigned to patients/i);
  });

  it('returns 409 when policy is already assigned to patient', async () => {
    vi.mocked(prisma.policy.findUnique).mockResolvedValue({ id: 'policy-1' } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      role: 'PATIENT',
      isActive: true,
    } as never);
    vi.mocked(prisma.userPolicy.findUnique).mockResolvedValue({
      id: 'up-1',
      userId: 'user-1',
      policyId: 'policy-1',
    } as never);

    const res = await request(buildApp())
      .post('/policies/policy-1/assign/user-1')
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already assigned/i);
  });
});
