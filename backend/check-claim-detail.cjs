const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkClaimDetail() {
  try {
    const claim = await prisma.claim.findFirst({
      where: { claimNumber: 'CLM-2026-000025' },
      include: {
        patient: true,
        policy: true,
      },
    });

    console.log('\n========== POLICY DEDUCTIBLE CONFIG ==========');
    console.log(`Policy ID: ${claim.policy.id}`);
    console.log(`Policy Deductible (IN-Network): $${claim.policy.deductible}`);
    console.log(`Policy OON Deductible: $${claim.policy.oonDeductible}`);
    console.log(`Policy Copay (IN-Network): ${claim.policy.copayPercentage}%`);
    console.log(`Policy OON Copay: ${claim.policy.oonCopayPercent}%`);

    console.log('\n========== PATIENT OON CLAIMS IN THIS PLAN YEAR ==========');

    // Get all OON claims for this patient in this plan year
    const oonClaims = await prisma.claim.findMany({
      where: {
        patientId: claim.patientId,
        policyId: claim.policyId,
        networkStatus: 'OUT',
        planYearStart: { gte: claim.planYearStart },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        claimNumber: true,
        totalAmount: true,
        eligibleAmount: true,
        deductible: true,
        reimbursable: true,
        status: true,
        createdAt: true,
      },
    });

    let cumulativeDeductible = 0;
    oonClaims.forEach(c => {
      cumulativeDeductible += c.deductible;
      console.log(`${c.claimNumber}: $${c.totalAmount} eligible → deductible $${c.deductible} → reimbursable $${c.reimbursable} (${c.status})`);
    });

    console.log(`\nTotal OON Deductible Applied Across All Claims: $${cumulativeDeductible}`);
    console.log(`OON Deductible Limit: $${claim.policy.oonDeductible}`);

    if (cumulativeDeductible > claim.policy.oonDeductible) {
      console.log(`\n⚠️  OVERCHARGE: Deductible applied exceeds OON limit!`);
      console.log(`   Applied: $${cumulativeDeductible}, Limit: $${claim.policy.oonDeductible}`);
    }

    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkClaimDetail();
