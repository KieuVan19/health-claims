import prisma from '../lib/prisma';

/**
 * Soft-delete a resource by setting deletedAt and optionally deletedBy
 * @param model - Prisma model name
 * @param id - Resource ID
 * @param userId - User performing the delete (optional)
 */
export async function softDelete(
  model: 'claim' | 'document' | 'user',
  id: string,
  userId?: string | null,
): Promise<void> {
  const data: Record<string, any> = { deletedAt: new Date() };
  if (userId) data.deletedBy = userId;

  switch (model) {
    case 'claim':
      await prisma.claim.update({ where: { id }, data });
      break;
    case 'document':
      await prisma.document.update({ where: { id }, data });
      break;
    case 'user':
      await prisma.user.update({ where: { id }, data });
      break;
  }
}

/**
 * Exclude soft-deleted records from a where clause
 * @param where - Existing where clause
 * @param field - Field name (default: 'deletedAt')
 * @returns Updated where clause
 */
export function excludeDeleted(where?: Record<string, any>, field: string = 'deletedAt'): Record<string, any> {
  if (!where) where = {};
  return { ...where, [field]: null };
}
