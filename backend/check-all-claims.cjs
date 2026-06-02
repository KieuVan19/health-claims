const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkAllClaims() {
  try {
    const claim = await prisma.claim.findFirst({
      where: { claimNumber: 'CLM-2026-000025' },
      include: { patient: true },
    });

    console.log(`\n========== ALL CLAIMS FOR ${claim.patient.firstName} ${claim.patient.lastName} ==========\n`);

    const allClaims = await prisma.claim.findMany({
      where: { patientId: claim.patientId },
      orderBy: { createdAt: 'asc' },
      include: { policy: { select: { deductible: true, oonDeductible: true } } },
    });

    let totalDeductiblePaid = 0;
    let totalOonDeductiblePaid = 0;

    allClaims.forEach(c => {
      const network = c.networkStatus === 'OUT' ? '🌐 OON' : '🏥 IN ';
      console.log(`${c.claimNumber} | ${network} | $${c.totalAmount.toString().padStart(5)} | Elig: $${c.eligibleAmount.toString().padStart(5)} | Ded: $${c.deductible.toString().padStart(4)} | Reimb: $${c.reimbursable.toString().padStart(4)} | ${c.status.padEnd(18)}`);

      totalDeductiblePaid += c.deductible;
      if (c.networkStatus === 'OUT') {
        totalOonDeductiblePaid += c.deductible;
      }
    });

    console.log('\n========== SUMMARY ==========');
    console.log(`Total Deductible Paid (All Networks): $${totalDeductiblePaid}`);
    console.log(`Total OON Deductible Paid: $${totalOonDeductiblePaid}`);
    console.log(`OON Deductible Limit: $${claim.policy ? claim.policy.oonDeductible : 'N/A'}`);
    console.log(`Remaining OON Deductible: $${Math.max(0, (claim.policy ? claim.policy.oonDeductible : 0) - totalOonDeductiblePaid)}`);

    if (totalOonDeductiblePaid > 0) {
      console.log(`\n⚠️  PATIENT HAS PAID $${totalOonDeductiblePaid} OF $${claim.policy.oonDeductible} OON DEDUCTIBLE`);
      console.log(`CLM-2026-000025 SHOULD HAVE ONLY $${Math.max(0, claim.policy.oonDeductible - totalOonDeductiblePaid)} DEDUCTIBLE, NOT $1000`);
    }

    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkAllClaims();
