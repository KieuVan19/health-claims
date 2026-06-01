import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { requireOwnership } from '../middleware/ownership';
import { uploadDocuments } from '../middleware/upload';
import { logRead } from '../utils/audit';

const router = Router();

/**
 * @openapi
 * /documents/claims/{claimId}/upload:
 *   post:
 *     tags: [Documents]
 *     summary: Upload documents to a claim (Patient only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: claimId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               documents:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Documents uploaded
 */
router.post(
  '/claims/:claimId/upload',
  authenticate,
  requireRole('PATIENT'),
  requireOwnership('claim'),
  (req: Request, res: Response, next: NextFunction): void => {
    uploadDocuments(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { claimId } = req.params;

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        res.status(400).json({ error: 'No files uploaded' });
        return;
      }

      const documents = await Promise.all(
        files.map((file) =>
          prisma.document.create({
            data: {
              claimId,
              filename: file.filename,
              originalName: file.originalname,
              mimeType: file.mimetype,
              size: file.size,
              path: file.path,
            },
          })
        )
      );

      res.status(201).json(documents);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /documents/claims/{claimId}:
 *   get:
 *     tags: [Documents]
 *     summary: List all documents for a claim
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: claimId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of documents
 */
router.get(
  '/claims/:claimId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { claimId } = req.params;

      const claim = await prisma.claim.findUnique({ where: { id: claimId } });
      if (!claim) {
        res.status(404).json({ error: 'Claim not found' });
        return;
      }

      // Patients can only access their own claim documents
      if (req.user!.role === 'PATIENT' && claim.patientId !== req.user!.id) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const documents = await prisma.document.findMany({
        where: { claimId },
        orderBy: { createdAt: 'desc' },
      });

      const isOwn = req.user!.role === 'PATIENT' && claim.patientId === req.user!.id;
      logRead(req.user!.id, 'DocumentList', claimId, req, isOwn);

      res.json(documents);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /documents/{id}/download:
 *   get:
 *     tags: [Documents]
 *     summary: Download a document
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
 *         description: File download
 */
router.get(
  '/:id/download',
  authenticate,
  requireOwnership('document'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const document = req.resource;

      const isOwn = req.user!.role === 'PATIENT' && document.claim.patientId === req.user!.id;
      logRead(req.user!.id, 'Document', document.id, req, isOwn);

      const filePath = path.resolve(document.path);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'File not found on server' });
        return;
      }

      res.setHeader('Content-Type', document.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${document.originalName}"`);
      res.sendFile(filePath);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /documents/{id}:
 *   delete:
 *     tags: [Documents]
 *     summary: Delete a document from a DRAFT claim (Patient only)
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
 *         description: Document deleted
 */
router.delete(
  '/:id',
  authenticate,
  requireRole('PATIENT'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const document = await prisma.document.findUnique({
        where: { id: req.params['id'] },
        include: { claim: true },
      });

      if (!document) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }

      if (document.claim.patientId !== req.user!.id) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      if (document.isSystemGenerated) {
        res.status(403).json({ error: 'System-generated documents cannot be deleted' });
        return;
      }

      if (document.claim.status !== 'DRAFT') {
        res.status(400).json({ error: 'Documents can only be deleted from DRAFT claims' });
        return;
      }

      // Delete file from disk
      const filePath = path.resolve(document.path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      await prisma.document.delete({ where: { id: document.id } });

      res.json({ message: 'Document deleted successfully' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
