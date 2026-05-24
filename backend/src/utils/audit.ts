import { Request } from 'express';
import prisma from '../lib/prisma';

interface AuditLogInput {
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function createAuditLog(input: AuditLogInput): Promise<void>;
export async function createAuditLog(
  userId: string | null | undefined,
  action: string,
  resource: string,
  resourceId?: string | null,
  details?: Record<string, unknown> | null,
  ipAddress?: string | null
): Promise<void>;
export async function createAuditLog(
  userIdOrInput: string | null | undefined | AuditLogInput,
  action?: string,
  resource?: string,
  resourceId?: string | null,
  details?: Record<string, unknown> | null,
  ipAddress?: string | null
): Promise<void> {
  try {
    let data: AuditLogInput;
    if (typeof userIdOrInput === 'object' && userIdOrInput !== null) {
      data = userIdOrInput;
    } else {
      data = {
        userId: userIdOrInput,
        action: action!,
        resource: resource!,
        resourceId,
        details,
        ipAddress,
      };
    }

    await prisma.auditLog.create({
      data: {
        userId: data.userId ?? null,
        action: data.action,
        resource: data.resource,
        resourceId: data.resourceId ?? null,
        details: data.details ? JSON.stringify(data.details) : null,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
      },
    });
  } catch (err) {
    // Audit log failures should not crash the application
    console.error('[AuditLog] Failed to create audit log:', err);
  }
}

/**
 * Fire-and-forget read-access log. Does not block the response.
 * Patients viewing their own resources get VIEW_OWN; all other access gets VIEW.
 */
export function logRead(
  userId: string,
  resource: string,
  resourceId: string,
  req: Request,
  isOwn = false,
): void {
  const action = isOwn ? 'VIEW_OWN' : 'VIEW';
  createAuditLog({
    userId,
    action,
    resource,
    resourceId,
    ipAddress: req.ip ?? null,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
  }).catch(() => {
    // already swallowed inside createAuditLog; this prevents unhandled rejection
  });
}
