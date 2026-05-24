import prisma from '../lib/prisma';

export async function generateClaimNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CLM-${year}-`;

  // Find the latest claim number for this year
  const latest = await prisma.claim.findFirst({
    where: { claimNumber: { startsWith: prefix } },
    orderBy: { claimNumber: 'desc' },
    select: { claimNumber: true },
  });

  let nextSeq = 1;
  if (latest) {
    const parts = latest.claimNumber.split('-');
    const seq = parseInt(parts[2] ?? '0', 10);
    if (!isNaN(seq)) {
      nextSeq = seq + 1;
    }
  }

  return `${prefix}${String(nextSeq).padStart(6, '0')}`;
}
