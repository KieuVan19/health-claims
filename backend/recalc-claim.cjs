const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function recalcClaim() {
  try {
    const claim = await prisma.claim.findFirst({
      where: { claimNumber: 'CLM-2026-000025' },
      include: { policy: true },
    });

    // Get deductible already paid on other OON claims (excluding this one)
    const deductiblePaidResult = await prisma.claim.aggregate({
      _sum: { deductible: true },
      where: {
        patientId: claim.patientId,
        policyId: claim.policyId,
        networkStatus: claim.networkStatus,
        planYearStart: { gte: claim.planYearStart },
        status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED', 'APPROVED', 'PARTIALLY_APPROVED', 'PAID'] },
        NOT: { id: claim.id },
      },
    });

    const deductiblePaid = deductiblePaidResult._sum.deductible || 0;
    const policyDeductible = claim.policy.oonDeductible || claim.policy.deductible;
    const remainingDeductible = Math.max(0, policyDeductible - deductiblePaid);

    // Apply deductible
    const deductibleApplied = Math.min(claim.eligibleAmount, remainingDeductible);
    const afterDeductible = Math.max(0, claim.eligibleAmount - deductibleApplied);

    // Apply OON copay (50%)
    const oonCopay = claim.policy.oonCopayPercent || claim.policy.copayPercentage;
    const copayFraction = oonCopay / 100;
    const copayAmount = Math.round(afterDeductible * copayFraction * 100) / 100;

    // Reimbursable = eligible - deductible - copay
    const newReimbursable = Math.round((claim.eligibleAmount - deductibleApplied - copayAmount) * 100) / 100;

    console.log('\n========== RECALCULATION ==========');
    console.log(`Eligible Amount: $${claim.eligibleAmount}`);
    console.log(`Deductible Paid (Other Claims): $${deductiblePaid}`);
    console.log(`Policy Deductible: $${policyDeductible}`);
    console.log(`Remaining Deductible: $${remainingDeductible}`);
    console.log(`\nDeductible to Apply: $${deductibleApplied}`);
    console.log(`After Deductible: $${afterDeductible}`);
    console.log(`OON Copay (${oonCopay}%): $${copayAmount}`);
    console.log(`New Reimbursable: $${newReimbursable}`);

    console.log(`\n========== UPDATE ==========`);
    console.log(`OLD: Deductible $${claim.deductible} → Reimbursable $${claim.reimbursable}`);
    console.log(`NEW: Deductible $${deductibleApplied} → Reimbursable $${newReimbursable}`);

    // Update the claim
    const updated = await prisma.claim.update({
      where: { id: claim.id },
      data: {
        deductible: deductibleApplied,
        reimbursable: newReimbursable,
      },
    });

    console.log(`\n✅ CLAIM UPDATED`);
    console.log(`Deductible: $${claim.deductible} → $${updated.deductible}`);
    console.log(`Reimbursable: $${claim.reimbursable} → $${updated.reimbursable}`);

    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

recalcClaim();
