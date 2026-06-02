import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkClaim() {
  try {
    // Search for claim by number
    const claim = await prisma.claim.findFirst({
      where: { claimNumber: 'CLM-2026-000025' },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, email: true } },
        policy: { select: { id: true, deductible: true, copayPercentage: true } },
      },
    });

    if (!claim) {
      console.log('❌ Claim CLM-2026-000025 not found');
      process.exit(1);
    }

    // Get deductible paid for this patient/policy/plan year
    const deductiblePaid = await prisma.claim.aggregate({
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

    const totalDeductiblePaid = (deductiblePaid._sum.deductible || 0) + claim.deductible;

    console.log('\n========== CLAIM DETAILS ==========');
    console.log(`Claim #: ${claim.claimNumber}`);
    console.log(`Patient: ${claim.patient.firstName} ${claim.patient.lastName} (${claim.patient.email})`);
    console.log(`Status: ${claim.status}`);
    console.log(`Network: ${claim.networkStatus}`);
    console.log(`Plan Year Start: ${claim.planYearStart}`);
    console.log('\n========== AMOUNTS ==========');
    console.log(`Total Amount (Billed): $${claim.totalAmount}`);
    console.log(`Eligible Amount: $${claim.eligibleAmount}`);
    console.log(`Deductible Applied (THIS CLAIM): $${claim.deductible}`);
    console.log(`Reimbursable: $${claim.reimbursable}`);
    console.log('\n========== POLICY & DEDUCTIBLE ==========');
    console.log(`Policy Deductible (per plan year): $${claim.policy.deductible}`);
    console.log(`Copay: ${claim.policy.copayPercentage}%`);
    console.log(`Deductible Already Paid (OTHER CLAIMS): $${deductiblePaid._sum.deductible || 0}`);
    console.log(`Deductible Already Paid (INCLUDING THIS): $${totalDeductiblePaid}`);

    const remainingDeductible = Math.max(0, claim.policy.deductible - totalDeductiblePaid);
    console.log(`Remaining Deductible: $${remainingDeductible}`);

    console.log('\n========== ANALYSIS ==========');
    if (claim.deductible > 0 && totalDeductiblePaid >= claim.policy.deductible) {
      console.log('⚠️  ISSUE FOUND: Deductible was already met, but system applied deductible to this claim!');
      console.log(`   Expected: $0 deductible (already paid $${claim.policy.deductible})`);
      console.log(`   Got: $${claim.deductible} deductible`);
    } else if (claim.deductible > 0) {
      console.log(`✓ Deductible appears correct for this claim`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkClaim();
