import prisma from '../lib/prisma';

interface NotificationInput {
  userId: string;
  title: string;
  message: string;
  type?: string;
  link?: string;
  prefKey?: string;
}

const PREF_DEFAULTS: Record<string, boolean> = {
  claimSubmitted: true,
  claimApproved: true,
  claimRejected: true,
  claimPaid: true,
  infoRequested: true,
  claimUnderReview: true,
};

export async function createNotification(input: NotificationInput): Promise<void> {
  try {
    if (input.prefKey) {
      const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: { notificationPrefs: true },
      });
      let stored: Record<string, boolean> = {};
      try { stored = JSON.parse(user?.notificationPrefs ?? '{}'); } catch { /* use empty */ }
      const enabled = stored[input.prefKey] ?? (PREF_DEFAULTS[input.prefKey] ?? true);
      if (!enabled) return;
    }

    await prisma.notification.create({
      data: {
        userId: input.userId,
        title: input.title,
        message: input.message,
        type: input.type ?? 'info',
        link: input.link ?? null,
      },
    });
  } catch (err) {
    console.error('[Notification] Failed to create notification:', err);
  }
}
