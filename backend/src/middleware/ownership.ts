import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

// Extend Express Request to include the loaded resource
declare global {
  namespace Express {
    interface Request {
      resource?: any;
    }
  }
}

type ResourceType = 'claim' | 'document' | 'notification';

/**
 * Middleware factory that checks resource ownership.
 * Loads the resource by ID from params and verifies the current user has access.
 * For patients, only their own resources are accessible.
 * For staff (ADJUSTER, FINANCE_OFFICER, ADMIN), all resources are accessible.
 */
export function requireOwnership(resourceType: ResourceType) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id || req.params.claimId;
      if (!id) {
        res.status(400).json({ error: 'Resource ID is required' });
        return;
      }

      const resource = await getResourceById(resourceType, id);
      if (!resource) {
        res.status(404).json({ error: `${capitalize(resourceType)} not found` });
        return;
      }

      // Check access: patients can only access their own resources
      const hasAccess = checkAccess(req.user!.role, resource, req.user!.id, resourceType);
      if (!hasAccess) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Attach the resource to the request for use in the handler
      req.resource = resource;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Load a resource by ID based on type
 */
async function getResourceById(resourceType: ResourceType, id: string): Promise<any> {
  switch (resourceType) {
    case 'claim':
      return await prisma.claim.findUnique({
        where: { id },
        include: {
          patient: { select: { id: true, email: true, firstName: true, lastName: true } },
          adjuster: { select: { id: true, email: true, firstName: true, lastName: true } },
          assignedAdjuster: { select: { id: true, email: true, firstName: true, lastName: true } },
          policy: true,
          provider: true,
          documents: true,
          lines: { orderBy: { lineNumber: 'asc' as const } },
          events: {
            include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
            orderBy: { createdAt: 'asc' as const },
          },
          infoRequests: {
            include: { from: { select: { id: true, firstName: true, lastName: true, role: true } } },
            orderBy: { createdAt: 'desc' as const },
          },
          payout: true,
          cobDetail: true,
          secondaryClaim: {
            select: { id: true, claimNumber: true, status: true, reimbursable: true, payout: true },
          },
          primaryClaim: {
            select: { id: true, claimNumber: true, status: true, reimbursable: true, payout: true },
          },
        },
      });
    case 'document':
      return await prisma.document.findUnique({
        where: { id },
        include: { claim: { select: { id: true, patientId: true } } },
      });
    case 'notification':
      return await prisma.notification.findUnique({
        where: { id },
      });
    default:
      throw new Error(`Unknown resource type: ${resourceType}`);
  }
}

/**
 * Check if the current user has access to the resource.
 * Patients can only access their own resources.
 * Staff (ADJUSTER, FINANCE_OFFICER, ADMIN) can access all resources.
 */
function checkAccess(
  role: string,
  resource: any,
  userId: string,
  resourceType: ResourceType,
): boolean {
  // Staff always has access
  if (role !== 'PATIENT') {
    return true;
  }

  // Patient can only access their own resources
  switch (resourceType) {
    case 'claim':
      return resource.patientId === userId;
    case 'document':
      return resource.claim.patientId === userId;
    case 'notification':
      return resource.userId === userId;
    default:
      return false;
  }
}

/**
 * Capitalize first letter of string
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
