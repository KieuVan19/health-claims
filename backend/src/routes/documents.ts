import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { requireOwnership } from '../middleware/ownership';
import { uploadDocuments } from '../middleware/upload';
import { logRead } from '../utils/audit';
import { softDelete } from '../utils/softDelete';

const router = Router();

/**
 * @openapi
 * /documents/upload:
 *   post:
 *     tags: [Documents]
 *     summary: Upload documents to a claim (Patient only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: claimId
 *         required: true
 *         schema:
 *           type: string
 *         description: Claim ID to attach documents to
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [documents]
 *             properties:
 *               documents:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Files to upload (PDF, JPG, PNG)
 *     responses:
 *       201:
 *         description: Documents uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Document'
 *       400:
 *         description: Invalid request or no files provided
 *       403:
 *         description: Forbidden - claim ownership required
 *       404:
 *         description: Claim not found
 */
router.post(
  '/upload',
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
      const { claimId } = req.query;

      if (!claimId || typeof claimId !== 'string') {
        res.status(400).json({ error: 'claimId query parameter is required' });
        return;
      }

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
 * /documents:
 *   get:
 *     tags: [Documents]
 *     summary: List all documents for a claim
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: claimId
 *         required: true
 *         schema:
 *           type: string
 *         description: Claim ID to list documents for
 *     responses:
 *       200:
 *         description: List of documents for the claim
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Document'
 *       400:
 *         description: Missing claimId parameter
 *       403:
 *         description: Forbidden - claim ownership required for patients
 *       404:
 *         description: Claim not found
 */
router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { claimId } = req.query;

      if (!claimId || typeof claimId !== 'string') {
        res.status(400).json({ error: 'claimId query parameter is required' });
        return;
      }

      const claim = await prisma.claim.findUnique({
        where: { id: claimId },
        include: { patient: true },
      });

      if (!claim) {
        res.status(404).json({ error: 'Claim not found' });
        return;
      }

      const isOwn = req.user!.role === 'PATIENT' && claim.patientId === req.user!.id;
      if (req.user!.role === 'PATIENT' && !isOwn) {
        res.status(403).json({ error: 'You can only access your own claims' });
        return;
      }

      const documents = await prisma.document.findMany({
        where: { claimId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });

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
 *         description: Document ID
 *     responses:
 *       200:
 *         description: File download
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Document or file not found
 *       403:
 *         description: Forbidden - claim ownership required for patients
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
 *         description: Document ID
 *     responses:
 *       200:
 *         description: Document deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *       400:
 *         description: Cannot delete document from non-DRAFT claim
 *       403:
 *         description: Cannot delete system-generated documents
 *       404:
 *         description: Document not found
 */
router.delete(
  '/:id',
  authenticate,
  requireRole('PATIENT'),
  requireOwnership('document'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const document = req.resource;

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

      await prisma.document.update({ where: { id: document.id }, data: { deletedAt: new Date(), deletedBy: req.user!.id } });

      res.json({ message: 'Document deleted successfully' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
