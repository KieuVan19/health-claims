import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { USER_ROLES } from '../constants/enums';

declare global {
  namespace Express {
    interface Request {
      resource?: {
        claim?: any;
        document?: any;
      };
    }
  }
}

type ResourceType = 'claim' | 'document';

/**
 * Middleware to verify patient ownership of a resource.
 * Enforces strict ownership — only the patient can access their resources.
 * Fetches the resource and attaches it to req.resource[type].
 */
export function requirePatientOwnership(
  resourceType: ResourceType,
  idParamName: string = 'id',
  loadRelations?: { [key: string]: boolean },
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const resourceId = req.params[idParamName];
      if (!resourceId) {
        res.status(400).json({ error: `Missing ${idParamName} parameter` });
        return;
      }

      let resource: any;
      let patientId: string;

      if (resourceType === 'claim') {
        resource = await prisma.claim.findUnique({
          where: { id: resourceId },
          include: loadRelations || {},
        });
        if (!resource) {
          res.status(404).json({ error: 'Claim not found' });
          return;
        }
        patientId = resource.patientId;
      } else if (resourceType === 'document') {
        resource = await prisma.document.findUnique({
          where: { id: resourceId },
          include: { claim: true, ...loadRelations },
        });
        if (!resource) {
          res.status(404).json({ error: 'Document not found' });
          return;
        }
        patientId = resource.claim.patientId;
      } else {
        res.status(500).json({ error: 'Invalid resource type' });
        return;
      }

      if (patientId !== req.user!.id) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      if (!req.resource) req.resource = {};
      req.resource[resourceType] = resource;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware to verify patient ownership of a resource if the user is a PATIENT.
 * Admins, adjusters, and finance officers have unrestricted access.
 * Fetches the resource and attaches it to req.resource[type].
 */
export function requirePatientOwnershipIfPatient(
  resourceType: ResourceType,
  idParamName: string = 'id',
  loadRelations?: { [key: string]: boolean },
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const resourceId = req.params[idParamName];
      if (!resourceId) {
        res.status(400).json({ error: `Missing ${idParamName} parameter` });
        return;
      }

      let resource: any;
      let patientId: string;

      if (resourceType === 'claim') {
        resource = await prisma.claim.findUnique({
          where: { id: resourceId },
          include: loadRelations || {},
        });
        if (!resource) {
          res.status(404).json({ error: 'Claim not found' });
          return;
        }
        patientId = resource.patientId;
      } else if (resourceType === 'document') {
        resource = await prisma.document.findUnique({
          where: { id: resourceId },
          include: { claim: true, ...loadRelations },
        });
        if (!resource) {
          res.status(404).json({ error: 'Document not found' });
          return;
        }
        patientId = resource.claim.patientId;
      } else {
        res.status(500).json({ error: 'Invalid resource type' });
        return;
      }

      if (req.user!.role === USER_ROLES.PATIENT && patientId !== req.user!.id) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      if (!req.resource) req.resource = {};
      req.resource[resourceType] = resource;
      next();
    } catch (err) {
      next(err);
    }
  };
}
