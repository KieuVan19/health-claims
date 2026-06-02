/**
 * Parse date range from query parameters into Prisma filter format.
 * Handles timezone boundaries (end of day for 'to' date).
 */
export function parseDateRange(from?: string, to?: string): Record<string, Date> | undefined {
  if (!from && !to) return undefined;

  const dateFilter: Record<string, Date> = {};
  if (from) {
    dateFilter.gte = new Date(from);
  }
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    dateFilter.lte = toDate;
  }
  return dateFilter;
}

/**
 * Build a Prisma OR filter for searching across multiple fields.
 * Matches substring (case-insensitive via Prisma contains).
 */
export function buildSearchWhere(
  searchTerm: string | undefined,
  fields: string[]
): Record<string, unknown> | undefined {
  if (!searchTerm) return undefined;

  return {
    OR: fields.map(field => ({
      [field]: { contains: searchTerm },
    })),
  };
}
