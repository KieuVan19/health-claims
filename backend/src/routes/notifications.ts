import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

const bulkReadSchema = z.object({
  notificationIds: z.array(z.string()).min(1, 'At least one notification ID is required'),
});

/**
 * @openapi
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: Get current user's notifications
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of notifications
 */
router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const notifications = await prisma.notification.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      res.json(notifications);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /notifications/unread-count:
 *   get:
 *     tags: [Notifications]
 *     summary: Get count of unread notifications
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread count
 */
router.get(
  '/unread-count',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const count = await prisma.notification.count({
        where: { userId: req.user!.id, isRead: false },
      });
      res.json({ count });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /notifications/read-all:
 *   put:
 *     tags: [Notifications]
 *     summary: Mark all notifications as read
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 */
router.put(
  '/read-all',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await prisma.notification.updateMany({
        where: { userId: req.user!.id, isRead: false },
        data: { isRead: true },
      });
      res.json({ message: 'All notifications marked as read' });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /notifications/bulk-read:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark multiple notifications as read
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [notificationIds]
 *             properties:
 *               notificationIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Notifications marked as read
 */
router.patch(
  '/bulk-read',
  authenticate,
  validate(bulkReadSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { notificationIds } = req.body as z.infer<typeof bulkReadSchema>;

      const result = await prisma.notification.updateMany({
        where: {
          id: { in: notificationIds },
          userId: req.user!.id,
          isRead: false,
        },
        data: { isRead: true },
      });

      res.json({ updated: result.count });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /notifications/{notificationId}/read:
 *   put:
 *     tags: [Notifications]
 *     summary: Mark a notification as read
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notification marked as read
 */
router.put(
  '/:notificationId/read',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const notification = await prisma.notification.findUnique({
        where: { id: req.params['notificationId'] },
      });

      if (!notification) {
        res.status(404).json({ error: 'Notification not found' });
        return;
      }

      if (notification.userId !== req.user!.id) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const updated = await prisma.notification.update({
        where: { id: notification.id },
        data: { isRead: true },
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

export default router;

