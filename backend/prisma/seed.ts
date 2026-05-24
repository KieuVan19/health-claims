import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { calculateEligible } from '../src/services/claims';

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

function claimNo(index: number): string {
  return `CLM-2026-${String(index).padStart(6, '0')}`;
}

const d = (s: string) => new Date(s);

async function main() {
  console.log('Starting seed...');

  await prisma.payout.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.infoRequest.deleteMany();
  await prisma.claimEvent.deleteMany();
  await prisma.document.deleteMany();
  await prisma.claim.deleteMany();
  await prisma.provider.deleteMany();
  await prisma.userPolicy.deleteMany();
  await prisma.policy.deleteMany();
  await prisma.user.deleteMany();

  console.log('Cleaned existing data.');

  const [adminPw, adjPw, finPw, patPw] = await Promise.all([
    hashPassword('Admin123!'),
    hashPassword('Adjuster123!'),
    hashPassword('Finance123!'),
    hashPassword('Patient123!'),
  ]);

  const [admin, adj1, adj2, finance, p1, p2, p3] = await Promise.all([
    prisma.user.create({ data: { email: 'admin@healthclaims.com', password: adminPw, firstName: 'System', lastName: 'Admin', role: 'ADMIN' } }),
    prisma.user.create({ data: { email: 'adjuster1@healthclaims.com', password: adjPw, firstName: 'Alice', lastName: 'Johnson', role: 'ADJUSTER' } }),
    prisma.user.create({ data: { email: 'adjuster2@healthclaims.com', password: adjPw, firstName: 'Bob', lastName: 'Williams', role: 'ADJUSTER' } }),
    prisma.user.create({ data: { email: 'finance@healthclaims.com', password: finPw, firstName: 'Carol', lastName: 'Davis', role: 'FINANCE_OFFICER' } }),
    prisma.user.create({ data: { email: 'patient1@healthclaims.com', password: patPw, firstName: 'David', lastName: 'Brown', role: 'PATIENT' } }),
    prisma.user.create({ data: { email: 'patient2@healthclaims.com', password: patPw, firstName: 'Emma', lastName: 'Wilson', role: 'PATIENT' } }),
    prisma.user.create({ data: { email: 'patient3@healthclaims.com', password: patPw, firstName: 'Frank', lastName: 'Miller', role: 'PATIENT' } }),
  ]);

  console.log('Created users.');

  // ── Demo Providers ─────────────────────────────────────────────────────────
  const [prov1, prov2, prov3, prov4, prov5] = await Promise.all([
    prisma.provider.create({ data: { npi: '1003000126', name: 'City General Hospital', providerType: 'HOSPITAL', inNetwork: true, specialty: 'General Medicine' } }),
    prisma.provider.create({ data: { npi: '1679576722', name: 'Dr. Sarah Mitchell, MD', providerType: 'PHYSICIAN', inNetwork: true, specialty: 'Internal Medicine' } }),
    prisma.provider.create({ data: { npi: '1952387490', name: 'Riverside Dental Clinic', providerType: 'CLINIC', inNetwork: true, specialty: 'Dentistry' } }),
    prisma.provider.create({ data: { npi: '1234567893', name: 'Vision Care Associates', providerType: 'CLINIC', inNetwork: false, specialty: 'Ophthalmology' } }),
    prisma.provider.create({ data: { npi: '1987654328', name: 'MedPlus Pharmacy Group', providerType: 'OTHER', inNetwork: true, specialty: 'Pharmacy' } }),
  ]);
  console.log('Created 5 demo providers.');

  void [prov1, prov2, prov3, prov4, prov5];

  const basicBenefits = JSON.stringify({ hospitalization: { limit: 10000, coveragePercent: 70 }, outpatient: { limit: 10000, coveragePercent: 60 }, dental: { limit: 10000, coveragePercent: 50 }, vision: { limit: 10000, coveragePercent: 50 }, pharmacy: { limit: 10000, coveragePercent: 70 } });
  const stdBenefits = JSON.stringify({ hospitalization: { limit: 20000, coveragePercent: 80 }, outpatient: { limit: 20000, coveragePercent: 70 }, dental: { limit: 20000, coveragePercent: 60 }, vision: { limit: 20000, coveragePercent: 50 }, pharmacy: { limit: 20000, coveragePercent: 80 } });
  const premBenefits = JSON.stringify({ hospitalization: { limit: 40000, coveragePercent: 90 }, outpatient: { limit: 40000, coveragePercent: 85 }, dental: { limit: 40000, coveragePercent: 80 }, vision: { limit: 40000, coveragePercent: 75 }, pharmacy: { limit: 40000, coveragePercent: 90 } });

  const [basic, standard, premium] = await Promise.all([
    prisma.policy.create({ data: { name: 'Basic Health Plan', type: 'BASIC', coverageAmount: 50000, deductible: 500, copayPercentage: 30, oopMax: 8000, oonDeductible: 1000, oonCopayPercent: 50, effectiveDate: d('2024-01-01'), expiryDate: d('2027-12-31'), description: 'Essential health coverage for individuals.', benefits: basicBenefits } }),
    prisma.policy.create({ data: { name: 'Standard Health Plan', type: 'STANDARD', coverageAmount: 100000, deductible: 250, copayPercentage: 20, oopMax: 6000, oonDeductible: 500, oonCopayPercent: 40, effectiveDate: d('2024-01-01'), expiryDate: d('2027-12-31'), description: 'Comprehensive health coverage for individuals and families.', benefits: stdBenefits } }),
    prisma.policy.create({ data: { name: 'Premium Health Plan', type: 'PREMIUM', coverageAmount: 200000, deductible: 100, copayPercentage: 10, oopMax: 4000, oonDeductible: 250, oonCopayPercent: 30, effectiveDate: d('2024-01-01'), expiryDate: d('2027-12-31'), description: 'Top-tier coverage with maximum benefits.', benefits: premBenefits } }),
  ]);

  await Promise.all([
    prisma.userPolicy.create({ data: { userId: p1.id, policyId: basic.id, startDate: new Date('2024-01-01'), planYearType: 'CALENDAR' } }),
    prisma.userPolicy.create({ data: { userId: p2.id, policyId: standard.id, startDate: new Date('2024-01-01'), planYearType: 'CALENDAR' } }),
    prisma.userPolicy.create({ data: { userId: p3.id, policyId: premium.id, startDate: new Date('2024-01-01'), planYearType: 'CALENDAR' } }),
  ]);

  console.log('Created policies and assigned to patients.');

  let idx = 1;

  // All 2026 seeded claims use a CALENDAR plan year starting Jan 1 2026.
  const PY = d('2026-01-01');

  // Per-patient deductible + OOP accumulators — updated after each APPROVED/PAID claim.
  let p1Ded = 0, p1Oop = 0;
  let p3Ded = 0, p3Oop = 0;

  type Evt = { userId: string; action: string; fromStatus?: string; toStatus: string };

  async function claim(
    data: Parameters<typeof prisma.claim.create>[0]['data'],
    events: Evt[],
    payout?: { amount: number; paymentRef: string; notes?: string }
  ) {
    const c = await prisma.claim.create({ data });
    await prisma.claimEvent.createMany({ data: events.map((e) => ({ ...e, claimId: c.id })) });
    if (payout) {
      await prisma.payout.create({ data: { claimId: c.id, processedBy: finance.id, ...payout } });
    }
    return c;
  }

  // ── January 2026 (4 claims) ──────────────────────────────────────────────

  const e1 = calculateEligible(1200, basic, p1Ded, p1Oop);
  const c1 = await claim(
    { claimNumber: claimNo(idx++), patientId: p1.id, policyId: basic.id, type: 'DENTAL', status: 'PAID', description: 'Emergency dental extraction and crown placement.', incidentDate: d('2026-01-03'), totalAmount: 1200, ...e1, adjusterId: adj1.id, adjusterNotes: 'Approved after verifying dental records.', createdAt: d('2026-01-05'), planYearStart: PY },
    [{ userId: p1.id, action: 'CREATED', toStatus: 'DRAFT' }, { userId: p1.id, action: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }, { userId: adj1.id, action: 'ASSIGNED', fromStatus: 'SUBMITTED', toStatus: 'UNDER_REVIEW' }, { userId: adj1.id, action: 'APPROVED', fromStatus: 'UNDER_REVIEW', toStatus: 'APPROVED' }, { userId: finance.id, action: 'PAID', fromStatus: 'APPROVED', toStatus: 'PAID' }],
    { amount: e1.reimbursable, paymentRef: 'PAY-2026-001' }
  );
  p1Ded += e1.deductible; p1Oop += e1.eligibleAmount - e1.reimbursable;

  const c3 = await claim(
    { claimNumber: claimNo(idx++), patientId: p3.id, policyId: premium.id, type: 'OUTPATIENT', status: 'UNDER_REVIEW', description: 'Specialist consultation and diagnostic imaging for chronic back pain.', incidentDate: d('2026-01-10'), totalAmount: 950, ...calculateEligible(950, premium, p3Ded, p3Oop), adjusterId: adj2.id, createdAt: d('2026-01-12'), planYearStart: PY },
    [{ userId: p3.id, action: 'CREATED', toStatus: 'DRAFT' }, { userId: p3.id, action: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }, { userId: adj2.id, action: 'ASSIGNED', fromStatus: 'SUBMITTED', toStatus: 'UNDER_REVIEW' }]
  );

  const c4 = await claim(
    { claimNumber: claimNo(idx++), patientId: p1.id, policyId: basic.id, type: 'PHARMACY', status: 'SUBMITTED', description: 'Three-month supply of prescription medication for hypertension.', incidentDate: d('2026-01-13'), totalAmount: 720, ...calculateEligible(720, basic, p1Ded, p1Oop), createdAt: d('2026-01-15'), planYearStart: PY },
    [{ userId: p1.id, action: 'CREATED', toStatus: 'DRAFT' }, { userId: p1.id, action: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }]
  );

  const c6 = await claim(
    { claimNumber: claimNo(idx++), patientId: p3.id, policyId: premium.id, type: 'DENTAL', status: 'INFO_REQUESTED', description: 'Root canal treatment and porcelain crown on upper molar.', incidentDate: d('2026-01-22'), totalAmount: 1800, ...calculateEligible(1800, premium, p3Ded, p3Oop), adjusterId: adj1.id, createdAt: d('2026-01-25'), planYearStart: PY },
    [{ userId: p3.id, action: 'CREATED', toStatus: 'DRAFT' }, { userId: p3.id, action: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }, { userId: adj1.id, action: 'ASSIGNED', fromStatus: 'SUBMITTED', toStatus: 'UNDER_REVIEW' }, { userId: adj1.id, action: 'INFO_REQUESTED', fromStatus: 'UNDER_REVIEW', toStatus: 'INFO_REQUESTED' }]
  );
  await prisma.infoRequest.create({ data: { claimId: c6.id, fromId: adj1.id, message: 'Please provide the dental X-rays and treatment plan from your dentist.' } });

  // ── February 2026 (4 claims) ─────────────────────────────────────────────

  const e7 = calculateEligible(6200, basic, p1Ded, p1Oop);
  const c7 = await claim(
    { claimNumber: claimNo(idx++), patientId: p1.id, policyId: basic.id, type: 'HOSPITALIZATION', status: 'PAID', description: 'Hernia repair surgery with one-night observation stay.', incidentDate: d('2026-02-01'), totalAmount: 6200, ...e7, adjusterId: adj2.id, adjusterNotes: 'Inpatient surgery confirmed. Deductible already met.', createdAt: d('2026-02-03'), planYearStart: PY },
    [{ userId: p1.id, action: 'CREATED', toStatus: 'DRAFT' }, { userId: p1.id, action: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }, { userId: adj2.id, action: 'ASSIGNED', fromStatus: 'SUBMITTED', toStatus: 'UNDER_REVIEW' }, { userId: adj2.id, action: 'APPROVED', fromStatus: 'UNDER_REVIEW', toStatus: 'APPROVED' }, { userId: finance.id, action: 'PAID', fromStatus: 'APPROVED', toStatus: 'PAID' }],
    { amount: e7.reimbursable, paymentRef: 'PAY-2026-002' }
  );
  p1Ded += e7.deductible; p1Oop += e7.eligibleAmount - e7.reimbursable;

  const c9 = await claim(
    { claimNumber: claimNo(idx++), patientId: p3.id, policyId: premium.id, type: 'PHARMACY', status: 'SUBMITTED', description: 'Specialty biologics for autoimmune condition — monthly supply.', incidentDate: d('2026-02-10'), totalAmount: 2100, ...calculateEligible(2100, premium, p3Ded, p3Oop), createdAt: d('2026-02-12'), planYearStart: PY },
    [{ userId: p3.id, action: 'CREATED', toStatus: 'DRAFT' }, { userId: p3.id, action: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }]
  );

  const e10 = calculateEligible(1400, basic, p1Ded, p1Oop);
  const c10 = await claim(
    { claimNumber: claimNo(idx++), patientId: p1.id, policyId: basic.id, type: 'DENTAL', status: 'APPROVED', description: 'Deep cleaning (scaling and root planing) on all four quadrants.', incidentDate: d('2026-02-16'), totalAmount: 1400, ...e10, adjusterId: adj2.id, adjusterNotes: 'Periodontal treatment covered under dental benefit.', createdAt: d('2026-02-18'), planYearStart: PY },
    [{ userId: p1.id, action: 'CREATED', toStatus: 'DRAFT' }, { userId: p1.id, action: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }, { userId: adj2.id, action: 'ASSIGNED', fromStatus: 'SUBMITTED', toStatus: 'UNDER_REVIEW' }, { userId: adj2.id, action: 'APPROVED', fromStatus: 'UNDER_REVIEW', toStatus: 'APPROVED' }]
  );
  p1Ded += e10.deductible; p1Oop += e10.eligibleAmount - e10.reimbursable;

  // ── March 2026 (5 claims) ────────────────────────────────────────────────

  const e12 = calculateEligible(3200, premium, p3Ded, p3Oop);
  const c12 = await claim(
    { claimNumber: claimNo(idx++), patientId: p3.id, policyId: premium.id, type: 'VISION', status: 'PAID', description: 'LASIK laser vision correction surgery — both eyes.', incidentDate: d('2026-02-28'), totalAmount: 3200, ...e12, adjusterId: adj1.id, adjusterNotes: 'Elective vision correction covered under premium plan.', createdAt: d('2026-03-02'), planYearStart: PY },
    [{ userId: p3.id, action: 'CREATED', toStatus: 'DRAFT' }, { userId: p3.id, action: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }, { userId: adj1.id, action: 'ASSIGNED', fromStatus: 'SUBMITTED', toStatus: 'UNDER_REVIEW' }, { userId: adj1.id, action: 'APPROVED', fromStatus: 'UNDER_REVIEW', toStatus: 'APPROVED' }, { userId: finance.id, action: 'PAID', fromStatus: 'APPROVED', toStatus: 'PAID' }],
    { amount: e12.reimbursable, paymentRef: 'PAY-2026-003' }
  );
  p3Ded += e12.deductible; p3Oop += e12.eligibleAmount - e12.reimbursable;

  const c13 = await claim(
    { claimNumber: claimNo(idx++), patientId: p1.id, policyId: basic.id, type: 'OUTPATIENT', status: 'UNDER_REVIEW', description: 'Dermatology consultation and excision of benign skin lesion.', incidentDate: d('2026-03-04'), totalAmount: 680, ...calculateEligible(680, basic, p1Ded, p1Oop), adjusterId: adj2.id, createdAt: d('2026-03-06'), planYearStart: PY },
    [{ userId: p1.id, action: 'CREATED', toStatus: 'DRAFT' }, { userId: p1.id, action: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }, { userId: adj2.id, action: 'ASSIGNED', fromStatus: 'SUBMITTED', toStatus: 'UNDER_REVIEW' }]
  );

  const c15 = await claim(
    { claimNumber: claimNo(idx++), patientId: p3.id, policyId: premium.id, type: 'DENTAL', status: 'SUBMITTED', description: 'Porcelain veneers on upper front six teeth.', incidentDate: d('2026-03-12'), totalAmount: 4800, ...calculateEligible(4800, premium, p3Ded, p3Oop), createdAt: d('2026-03-14'), planYearStart: PY },
    [{ userId: p3.id, action: 'CREATED', toStatus: 'DRAFT' }, { userId: p3.id, action: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }]
  );

  const c16 = await claim(
    { claimNumber: claimNo(idx++), patientId: p1.id, policyId: basic.id, type: 'PHARMACY', status: 'INFO_REQUESTED', description: 'Insulin and diabetic supplies for monthly management.', incidentDate: d('2026-03-16'), totalAmount: 850, ...calculateEligible(850, basic, p1Ded, p1Oop), adjusterId: adj2.id, createdAt: d('2026-03-18'), planYearStart: PY },
    [{ userId: p1.id, action: 'CREATED', toStatus: 'DRAFT' }, { userId: p1.id, action: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }, { userId: adj2.id, action: 'ASSIGNED', fromStatus: 'SUBMITTED', toStatus: 'UNDER_REVIEW' }, { userId: adj2.id, action: 'INFO_REQUESTED', fromStatus: 'UNDER_REVIEW', toStatus: 'INFO_REQUESTED' }]
  );
  await prisma.infoRequest.create({ data: { claimId: c16.id, fromId: adj2.id, message: 'Please provide a copy of your valid prescription and receipts from the pharmacy.' } });

  const c18 = await claim(
    { claimNumber: claimNo(idx++), patientId: p3.id, policyId: premium.id, type: 'HOSPITALIZATION', status: 'SUBMITTED', description: 'Spinal fusion surgery for degenerative disc disease. 4-day stay.', incidentDate: d('2026-03-26'), totalAmount: 42000, ...calculateEligible(42000, premium, p3Ded, p3Oop), createdAt: d('2026-03-28'), planYearStart: PY },
    [{ userId: p3.id, action: 'CREATED', toStatus: 'DRAFT' }, { userId: p3.id, action: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }]
  );

  // ── April 2026 (4 claims) ────────────────────────────────────────────────

  const e19 = calculateEligible(900, basic, p1Ded, p1Oop);
  const c19 = await claim(
    { claimNumber: claimNo(idx++), patientId: p1.id, policyId: basic.id, type: 'DENTAL', status: 'PAID', description: 'Three-surface amalgam fillings and fluoride treatment.', incidentDate: d('2026-03-31'), totalAmount: 900, ...e19, adjusterId: adj2.id, adjusterNotes: 'Routine restorative dental work approved.', createdAt: d('2026-04-02'), planYearStart: PY },
    [{ userId: p1.id, action: 'CREATED', toStatus: 'DRAFT' }, { userId: p1.id, action: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }, { userId: adj2.id, action: 'ASSIGNED', fromStatus: 'SUBMITTED', toStatus: 'UNDER_REVIEW' }, { userId: adj2.id, action: 'APPROVED', fromStatus: 'UNDER_REVIEW', toStatus: 'APPROVED' }, { userId: finance.id, action: 'PAID', fromStatus: 'APPROVED', toStatus: 'PAID' }],
    { amount: e19.reimbursable, paymentRef: 'PAY-2026-004' }
  );
  p1Ded += e19.deductible; p1Oop += e19.eligibleAmount - e19.reimbursable;

  const c21 = await claim(
    { claimNumber: claimNo(idx++), patientId: p3.id, policyId: premium.id, type: 'OUTPATIENT', status: 'SUBMITTED', description: 'Gastroenterology consultation with endoscopy procedure.', incidentDate: d('2026-04-08'), totalAmount: 2200, ...calculateEligible(2200, premium, p3Ded, p3Oop), createdAt: d('2026-04-10'), planYearStart: PY },
    [{ userId: p3.id, action: 'CREATED', toStatus: 'DRAFT' }, { userId: p3.id, action: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }]
  );

  const e22 = calculateEligible(820, basic, p1Ded, p1Oop);
  const c22 = await claim(
    { claimNumber: claimNo(idx++), patientId: p1.id, policyId: basic.id, type: 'VISION', status: 'APPROVED', description: 'Comprehensive eye exam and progressive lens prescription glasses.', incidentDate: d('2026-04-13'), totalAmount: 820, ...e22, adjusterId: adj2.id, adjusterNotes: 'Annual vision benefit applied.', createdAt: d('2026-04-15'), planYearStart: PY },
    [{ userId: p1.id, action: 'CREATED', toStatus: 'DRAFT' }, { userId: p1.id, action: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }, { userId: adj2.id, action: 'ASSIGNED', fromStatus: 'SUBMITTED', toStatus: 'UNDER_REVIEW' }, { userId: adj2.id, action: 'APPROVED', fromStatus: 'UNDER_REVIEW', toStatus: 'APPROVED' }]
  );
  p1Ded += e22.deductible; p1Oop += e22.eligibleAmount - e22.reimbursable;

  const c24 = await claim(
    { claimNumber: claimNo(idx++), patientId: p3.id, policyId: premium.id, type: 'PHARMACY', status: 'INFO_REQUESTED', description: 'Immunosuppressant therapy — 90-day supply for organ transplant patient.', incidentDate: d('2026-04-23'), totalAmount: 6800, ...calculateEligible(6800, premium, p3Ded, p3Oop), adjusterId: adj1.id, createdAt: d('2026-04-25'), planYearStart: PY },
    [{ userId: p3.id, action: 'CREATED', toStatus: 'DRAFT' }, { userId: p3.id, action: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }, { userId: adj1.id, action: 'ASSIGNED', fromStatus: 'SUBMITTED', toStatus: 'UNDER_REVIEW' }, { userId: adj1.id, action: 'INFO_REQUESTED', fromStatus: 'UNDER_REVIEW', toStatus: 'INFO_REQUESTED' }]
  );
  await prisma.infoRequest.create({ data: { claimId: c24.id, fromId: adj1.id, message: 'Please provide transplant documentation and current treating physician letter confirming ongoing therapy.' } });

  // ── May 2026 (3 claims) ──────────────────────────────────────────────────

  const c25 = await claim(
    { claimNumber: claimNo(idx++), patientId: p1.id, policyId: basic.id, type: 'OUTPATIENT', status: 'UNDER_REVIEW', description: 'Pulmonology consultation and spirometry test for chronic cough.', incidentDate: d('2026-04-30'), totalAmount: 670, ...calculateEligible(670, basic, p1Ded, p1Oop), adjusterId: adj2.id, createdAt: d('2026-05-02'), planYearStart: PY },
    [{ userId: p1.id, action: 'CREATED', toStatus: 'DRAFT' }, { userId: p1.id, action: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }, { userId: adj2.id, action: 'ASSIGNED', fromStatus: 'SUBMITTED', toStatus: 'UNDER_REVIEW' }]
  );

  const c27 = await claim(
    { claimNumber: claimNo(idx++), patientId: p3.id, policyId: premium.id, type: 'DENTAL', status: 'UNDER_REVIEW', description: 'Full arch dental rehabilitation with zirconia crowns.', incidentDate: d('2026-05-10'), totalAmount: 9500, ...calculateEligible(9500, premium, p3Ded, p3Oop), adjusterId: adj1.id, createdAt: d('2026-05-12'), planYearStart: PY },
    [{ userId: p3.id, action: 'CREATED', toStatus: 'DRAFT' }, { userId: p3.id, action: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }, { userId: adj1.id, action: 'ASSIGNED', fromStatus: 'SUBMITTED', toStatus: 'UNDER_REVIEW' }]
  );

  const c28 = await claim(
    { claimNumber: claimNo(idx++), patientId: p1.id, policyId: basic.id, type: 'PHARMACY', status: 'SUBMITTED', description: 'Blood pressure medication and cholesterol management — 90 days.', incidentDate: d('2026-05-16'), totalAmount: 780, ...calculateEligible(780, basic, p1Ded, p1Oop), createdAt: d('2026-05-18'), planYearStart: PY },
    [{ userId: p1.id, action: 'CREATED', toStatus: 'DRAFT' }, { userId: p1.id, action: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }]
  );

  // ── Approved — ready for payment testing ────────────────────────────────

  const eAppr1 = calculateEligible(2200, basic, p1Ded, p1Oop);
  const appr1 = await claim(
    { claimNumber: claimNo(idx++), patientId: p1.id, policyId: basic.id, type: 'HOSPITALIZATION', status: 'APPROVED', description: 'Emergency room visit and overnight observation for chest pain.', incidentDate: d('2026-05-20'), totalAmount: 2200, ...eAppr1, adjusterId: adj1.id, adjusterNotes: 'ER admission verified. Deductible already met for this plan year.', createdAt: d('2026-05-21'), planYearStart: PY },
    [{ userId: p1.id, action: 'CREATED', toStatus: 'DRAFT' }, { userId: p1.id, action: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }, { userId: adj1.id, action: 'ASSIGNED', fromStatus: 'SUBMITTED', toStatus: 'UNDER_REVIEW' }, { userId: adj1.id, action: 'APPROVED', fromStatus: 'UNDER_REVIEW', toStatus: 'APPROVED' }]
  );
  p1Ded += eAppr1.deductible; p1Oop += eAppr1.eligibleAmount - eAppr1.reimbursable;

  const eAppr3 = calculateEligible(1500, premium, p3Ded, p3Oop);
  const appr3 = await claim(
    { claimNumber: claimNo(idx++), patientId: p3.id, policyId: premium.id, type: 'OUTPATIENT', status: 'APPROVED', description: 'MRI scan and neurology consultation for recurring migraines.', incidentDate: d('2026-05-21'), totalAmount: 1500, ...eAppr3, adjusterId: adj1.id, adjusterNotes: 'Specialist referral confirmed. Approved under outpatient benefit.', createdAt: d('2026-05-22'), planYearStart: PY },
    [{ userId: p3.id, action: 'CREATED', toStatus: 'DRAFT' }, { userId: p3.id, action: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }, { userId: adj1.id, action: 'ASSIGNED', fromStatus: 'SUBMITTED', toStatus: 'UNDER_REVIEW' }, { userId: adj1.id, action: 'APPROVED', fromStatus: 'UNDER_REVIEW', toStatus: 'APPROVED' }]
  );
  p3Ded += eAppr3.deductible; p3Oop += eAppr3.eligibleAmount - eAppr3.reimbursable;

  const eAppr5 = calculateEligible(3800, premium, p3Ded, p3Oop);
  const appr5 = await claim(
    { claimNumber: claimNo(idx++), patientId: p3.id, policyId: premium.id, type: 'DENTAL', status: 'APPROVED', description: 'Dental implant placement and temporary crown — upper left molar.', incidentDate: d('2026-05-22'), totalAmount: 3800, ...eAppr5, adjusterId: adj1.id, adjusterNotes: 'Implant pre-authorisation on file. Approved.', createdAt: d('2026-05-22'), planYearStart: PY },
    [{ userId: p3.id, action: 'CREATED', toStatus: 'DRAFT' }, { userId: p3.id, action: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }, { userId: adj1.id, action: 'ASSIGNED', fromStatus: 'SUBMITTED', toStatus: 'UNDER_REVIEW' }, { userId: adj1.id, action: 'APPROVED', fromStatus: 'UNDER_REVIEW', toStatus: 'APPROVED' }]
  );
  p3Ded += eAppr5.deductible; p3Oop += eAppr5.eligibleAmount - eAppr5.reimbursable;

  console.log('Created 22 claims across Jan–May 2026 (including 5 APPROVED ready for payout). Patient 2 has no claims.');

  await prisma.notification.createMany({
    data: [
      { userId: p1.id, title: 'Information Requested', message: `Additional info required for claim ${c16.claimNumber}.`, type: 'warning', link: `/claims/${c16.id}`, isRead: false },
      { userId: p3.id, title: 'Information Requested', message: `Additional info required for claim ${c24.claimNumber}.`, type: 'warning', link: `/claims/${c24.id}`, isRead: false },
      { userId: p3.id, title: 'Information Requested', message: `Additional info required for claim ${c6.claimNumber}.`, type: 'warning', link: `/claims/${c6.id}`, isRead: false },
      { userId: p1.id, title: 'Claim Approved', message: `Claim ${c10.claimNumber} has been approved.`, type: 'success', link: `/claims/${c10.id}`, isRead: false },
      { userId: adj2.id, title: 'New Claim Submitted', message: `Claim ${c28.claimNumber} awaits assignment.`, type: 'info', link: `/claims/${c28.id}`, isRead: false },
      { userId: finance.id, title: 'Claim Ready for Payment', message: `Claim ${c22.claimNumber} is approved and awaiting payout.`, type: 'info', link: `/claims/${c22.id}`, isRead: false },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      { userId: admin.id, action: 'CREATE', resource: 'Policy', resourceId: basic.id, details: JSON.stringify({ name: 'Basic Health Plan' }), ipAddress: '127.0.0.1' },
      { userId: admin.id, action: 'CREATE', resource: 'Policy', resourceId: standard.id, details: JSON.stringify({ name: 'Standard Health Plan' }), ipAddress: '127.0.0.1' },
      { userId: admin.id, action: 'CREATE', resource: 'Policy', resourceId: premium.id, details: JSON.stringify({ name: 'Premium Health Plan' }), ipAddress: '127.0.0.1' },
    ],
  });

  console.log('Created notifications and audit logs.');
  console.log('\nSeed complete! Credentials:');
  console.log('  admin@healthclaims.com      / Admin123!');
  console.log('  adjuster1@healthclaims.com  / Adjuster123!');
  console.log('  finance@healthclaims.com    / Finance123!');
  console.log('  patient1@healthclaims.com   / Patient123!');
  console.log('  patient2@healthclaims.com   / Patient123!  (new account, no claims)');

  void admin;
  void p2;
  void [c3, c4, c6, c7, c9, c13, c15, c18, c21, c25, c27];
  void [appr1, appr3, appr5];
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
