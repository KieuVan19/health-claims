import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/prisma', () => {
  const mockPrisma = {
    notification: { updateMany: vi.fn() },
  };

  return {
    default: mockPrisma,
  };
});

vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', email: 'user@test.com', role: 'PATIENT' };
    next();
  },
}));

import prisma from '../lib/prisma';
import notificationRouter from './notifications';
import { errorHandler } from '../middleware/error';

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/notifications', notificationRouter);
  app.use(errorHandler);
  return app;
};

describe('PATCH /notifications/bulk-read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks all specified notifications as read for the current user', async () => {
    vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 2 });

    const res = await request(buildApp())
      .patch('/notifications/bulk-read')
      .send({ notificationIds: ['notif-1', 'notif-2'] });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);

    // Verify the userId filter was applied
    const callArgs = vi.mocked(prisma.notification.updateMany).mock.calls[0][0] as any;
    expect(callArgs.where.userId).toBe('user-1');
    expect(callArgs.where.id).toEqual({ in: ['notif-1', 'notif-2'] });
    expect(callArgs.where.isRead).toBe(false);
  });

  it('respects user ownership by filtering on userId', async () => {
    vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 0 });

    const res = await request(buildApp())
      .patch('/notifications/bulk-read')
      .send({ notificationIds: ['other-users-notif'] });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(0);

    // Confirm the query included userId filter
    const callArgs = vi.mocked(prisma.notification.updateMany).mock.calls[0][0] as any;
    expect(callArgs.where.userId).toBe('user-1');
  });

  it('returns 400 when notificationIds array is empty', async () => {
    const res = await request(buildApp())
      .patch('/notifications/bulk-read')
      .send({ notificationIds: [] });

    expect(res.status).toBe(400);
  });

  it('returns 400 when notificationIds is missing', async () => {
    const res = await request(buildApp())
      .patch('/notifications/bulk-read')
      .send({});

    expect(res.status).toBe(400);
  });
});
