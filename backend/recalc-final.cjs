const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function recalc() {
  try {
    const claim = await prisma.claim.findFirst({
      where: { claimNumber: 'CLM-2026-000025' },
      include: { policy: true },
    });

    // Get ALL deductible paid (all networks) EXCEPT this claim
    const deductibleResult = await prisma.claim.aggregate({
      _sum: { deductible: true },
      where: {
        patientId: claim.patientId,
        policyId: claim.policyId,
        planYearStart: { gte: claim.planYearStart },
        status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED', 'APPROVED', 'PARTIALLY_APPROVED', 'PAID'] },
        NOT: { id: claim.id },
      },
    });

    const deductiblePaid = deductibleResult._sum.deductible || 0;
    const policyDeductible = 500;
    const remainingDeductible = Math.max(0, policyDeductible - deductiblePaid);

    // Apply deductible
    const deductibleApplied = Math.min(claim.eligibleAmount, remainingDeductible);
    const afterDeductible = Math.max(0, claim.eligibleAmount - deductibleApplied);

    // Apply OON copay (50%)
    const copayAmount = Math.round(afterDeductible * 0.50 * 100) / 100;
    const newReimbursable = Math.round((claim.eligibleAmount - deductibleApplied - copayAmount) * 100) / 100;

    console.log('\n========== FIXED DEDUCTIBLE CALCULATION ==========');
    console.log(`Total Deductible Paid (ALL networks): $${deductiblePaid}`);
    console.log(`Policy Deductible: $${policyDeductible}`);
    console.log(`Remaining Deductible: $${remainingDeductible}`);
    console.log(`\nDeductible for This Claim: $${deductibleApplied}`);
    console.log(`Copay (50%): $${copayAmount}`);
    console.log(`Reimbursable: $${newReimbursable}`);

    console.log(`\n========== UPDATE ==========`);
    console.log(`OLD: $${claim.deductible} deductible → $${claim.reimbursable} reimbursable`);
    console.log(`NEW: $${deductibleApplied} deductible → $${newReimbursable} reimbursable`);

    const updated = await prisma.claim.update({
      where: { id: claim.id },
      data: {
        deductible: deductibleApplied,
        reimbursable: newReimbursable,
      },
    });

    console.log(`\n✅ CLAIM FIXED`);
    console.log(`Patient now pays: $${deductibleApplied + copayAmount} total ($${deductibleApplied} deductible + $${copayAmount} copay)`);
    console.log(`Patient gets reimbursed: $${newReimbursable}`);

    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

recalc();
