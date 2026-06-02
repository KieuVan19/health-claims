const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixPolicy() {
  try {
    const claim = await prisma.claim.findFirst({
      where: { claimNumber: 'CLM-2026-000025' },
      include: { policy: true },
    });

    const policyId = claim.policyId;

    // Update the policy OON deductible from 1000 to 500 (same as IN-network)
    const updated = await prisma.policy.update({
      where: { id: policyId },
      data: { oonDeductible: 500 },
    });

    console.log('\n✅ POLICY FIXED');
    console.log(`Policy ID: ${policyId}`);
    console.log(`IN-Network Deductible: $${updated.deductible}`);
    console.log(`OON Deductible: $1000 → $500`);
    console.log(`\nNow both networks use the same $500 deductible per plan year`);
    console.log(`\n⚠️  CLM-2026-000025 needs to be recalculated:`);
    console.log(`   Current: $1000 deductible → Should be: $500 deductible`);

    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixPolicy();
