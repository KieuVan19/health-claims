import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing the module under test
vi.mock('../lib/prisma', () => ({
  default: {
    user: { findUnique: vi.fn() },
    notification: { create: vi.fn() },
  },
}));

import prisma from '../lib/prisma';
import { createNotification } from './notification';

const mockUser = (prefs: Record<string, boolean> = {}) =>
  (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
    notificationPrefs: JSON.stringify(prefs),
  });

beforeEach(() => vi.clearAllMocks());

describe('createNotification', () => {
  it('creates notification when prefKey is enabled by default', async () => {
    mockUser({});
    await createNotification({ userId: 'u1', title: 'T', message: 'M', prefKey: 'claimUnderReview' });
    expect(prisma.notification.create).toHaveBeenCalledOnce();
  });

  it('skips notification when user has disabled the prefKey', async () => {
    mockUser({ claimUnderReview: false });
    await createNotification({ userId: 'u1', title: 'T', message: 'M', prefKey: 'claimUnderReview' });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('creates notification for adjuster using claimUnderReview prefKey', async () => {
    // Regression: adjuster was never notified on claim assignment because the
    // createNotification call for adjusterId was missing from the assign endpoint.
    mockUser({});
    await createNotification({
      userId: 'adjuster-id',
      title: 'Claim Assigned to You',
      message: 'Claim HC-001 has been assigned to you for review.',
      type: 'info',
      link: '/adjuster/claims/1',
      prefKey: 'claimUnderReview',
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        userId: 'adjuster-id',
        title: 'Claim Assigned to You',
        message: 'Claim HC-001 has been assigned to you for review.',
        type: 'info',
        link: '/adjuster/claims/1',
      },
    });
  });

  it('skips adjuster notification when claimUnderReview is disabled', async () => {
    mockUser({ claimUnderReview: false });
    await createNotification({
      userId: 'adjuster-id',
      title: 'Claim Assigned to You',
      message: 'Claim HC-001 has been assigned to you for review.',
      prefKey: 'claimUnderReview',
    });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});
