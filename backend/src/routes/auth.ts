import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { signToken, generateResetToken } from '../utils/jwt';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { createAuditLog } from '../utils/audit';
import { sendPasswordReset } from '../services/email';

const router = Router();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new patient account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, firstName, lastName]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               firstName: { type: string }
 *               lastName: { type: string }
 *     responses:
 *       201:
 *         description: User registered successfully
 *       409:
 *         description: Email already exists
 */
router.post(
  '/register',
  validate(registerSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password, firstName, lastName } = req.body as z.infer<typeof registerSchema>;

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        res.status(409).json({ error: 'Email address is already registered' });
        return;
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: { email, password: hashedPassword, firstName, lastName, role: 'PATIENT' },
        select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, createdAt: true },
      });

      const token = signToken({ id: user.id, email: user.email, role: user.role });

      await createAuditLog({ userId: user.id, action: 'REGISTER', resource: 'User', resourceId: user.id, details: { email }, ipAddress: req.ip });

      res.status(201).json({ token, user });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post(
  '/login',
  validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body as z.infer<typeof loginSchema>;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.isActive) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      const passwordValid = await bcrypt.compare(password, user.password);
      if (!passwordValid) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      const token = signToken({ id: user.id, email: user.email, role: user.role });

      await createAuditLog({ userId: user.id, action: 'LOGIN', resource: 'User', resourceId: user.id, ipAddress: req.ip });

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user data
 *       401:
 *         description: Not authenticated
 */
router.get(
  '/me',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, createdAt: true, updatedAt: true },
      });
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.json(user);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout (invalidates session server-side audit log)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
router.post(
  '/logout',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await createAuditLog({ userId: req.user!.id, action: 'LOGOUT', resource: 'User', resourceId: req.user!.id, ipAddress: req.ip });
      res.json({ message: 'Logged out successfully' });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset link
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Reset email sent if account exists
 */
router.post(
  '/forgot-password',
  validate(forgotPasswordSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = req.body as z.infer<typeof forgotPasswordSchema>;

      // Always return 200 to prevent user enumeration
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        const { token, hashedToken, expires } = generateResetToken();

        await prisma.user.update({
          where: { id: user.id },
          data: { resetToken: hashedToken, resetTokenExp: expires },
        });

        const frontendUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:3000';
        const resetLink = `${frontendUrl}/reset-password/${token}`;
        await sendPasswordReset(user.email, resetLink);

        await createAuditLog({ userId: user.id, action: 'PASSWORD_RESET_REQUEST', resource: 'User', resourceId: user.id, ipAddress: req.ip });
      }

      res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /auth/reset-password/{token}:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password using a reset token
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Invalid or expired token
 */
router.post(
  '/reset-password/:token',
  validate(resetPasswordSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = req.params;
      const { password } = req.body as z.infer<typeof resetPasswordSchema>;

      const providedHashed = crypto.createHash('sha256').update(token).digest('hex');

      const user = await prisma.user.findFirst({
        where: {
          resetToken: providedHashed,
          resetTokenExp: { gt: new Date() },
        },
      });

      if (!user) {
        res.status(400).json({ error: 'Invalid or expired reset token' });
        return;
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          resetToken: null,
          resetTokenExp: null,
        },
      });

      await createAuditLog({ userId: user.id, action: 'PASSWORD_RESET', resource: 'User', resourceId: user.id, ipAddress: req.ip });

      res.json({ message: 'Password reset successfully. You can now log in with your new password.' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
