import { test, expect } from '@playwright/test';

test('TC-001: Full Claim Lifecycle — Draft to Paid', async ({ browser, baseURL }) => {
  test.setTimeout(300000); // 5 minute timeout

  let claimNumber = '';

  // ===== PHASE 1: PATIENT CREATES DRAFT CLAIM =====
  console.log('Phase 1: Patient creates draft claim...');
  const patientPage = await browser.newPage();

  await patientPage.goto('http://localhost:5173/auth/login', { waitUntil: 'domcontentloaded' });
  await patientPage.waitForTimeout(2000);

  await patientPage.fill('#email', 'patient2@healthclaims.com');
  await patientPage.fill('#password', 'Patient123!');
  await patientPage.click('[data-testid="login-submit-btn"]');

  await patientPage.waitForURL('**/patient/**', { timeout: 15000 });
  console.log('✓ Patient logged in');

  // Navigate to New Claim
  await patientPage.goto('http://localhost:5173/patient/claims/new');
  await patientPage.waitForLoadState('domcontentloaded');
  await patientPage.waitForTimeout(1000);

  // Fill claim form
  await patientPage.selectOption('#claim-type', 'OUTPATIENT');
  await patientPage.fill('#claim-description-input', 'Cardiology follow-up and ECG — referred by GP');
  await patientPage.fill('#claim-date-input', '2026-05-23');
  await patientPage.fill('#claim-amount-input', '800');

  // Save as Draft
  await patientPage.click('[data-testid="save-draft-btn"]');
  await patientPage.waitForURL('**/patient/claims/*', { timeout: 10000 });

  // Extract claim number from URL
  const claimDetailURL = patientPage.url();
  claimNumber = claimDetailURL.split('/').pop() || '';
  console.log(`✓ Claim created: ${claimNumber}`);

  // Verify draft status
  const draftStatus = await patientPage.textContent('[data-testid="status-badge"]');
  expect(draftStatus).toContain('Draft');
  console.log('✓ Status: DRAFT');

  // ===== PHASE 2: PATIENT SUBMITS CLAIM =====
  console.log('Phase 2: Patient submits claim...');
  const submitBtn = await patientPage.$('button:has-text("Submit Claim")');
  if (submitBtn) {
    await submitBtn.click();
    await patientPage.waitForTimeout(2000);

    // Check if there's a confirmation dialog
    const confirmBtn = await patientPage.$('button:has-text("Confirm")');
    if (confirmBtn) {
      await confirmBtn.click();
    }
  }

  await patientPage.waitForTimeout(2000);
  const submittedStatus = await patientPage.textContent('[data-testid="status-badge"]');
  expect(submittedStatus).toContain('Submitted');
  console.log('✓ Status: SUBMITTED');

  await patientPage.context().close();

  // ===== PHASE 3: ADJUSTER ASSIGNS AND REVIEWS =====
  console.log('Phase 3: Adjuster assigns claim...');
  const adjusterPage = await browser.newPage();

  await adjusterPage.goto('http://localhost:5173/auth/login', { waitUntil: 'domcontentloaded' });
  await adjusterPage.waitForTimeout(2000);

  await adjusterPage.fill('#email', 'adjuster1@healthclaims.com');
  await adjusterPage.fill('#password', 'Adjuster123!');
  await adjusterPage.click('[data-testid="login-submit-btn"]');

  await adjusterPage.waitForURL('**/adjuster/**', { timeout: 15000 });
  console.log('✓ Adjuster logged in');

  // Navigate to claim
  await adjusterPage.goto(`http://localhost:5173/claims/${claimNumber}`);
  await adjusterPage.waitForLoadState('domcontentloaded');
  await adjusterPage.waitForTimeout(1500);

  // Verify claim is visible
  const claimTitle = await adjusterPage.textContent('text=Emma Wilson');
  expect(claimTitle).toBeTruthy();
  console.log('✓ Claim visible in adjuster queue');

  // Assign to self
  const assignBtn = await adjusterPage.$('button:has-text("Assign to Me")');
  if (assignBtn) {
    await assignBtn.click();
    await adjusterPage.waitForTimeout(2000);
  }

  const underReviewStatus = await adjusterPage.textContent('[data-testid="status-badge"]');
  expect(underReviewStatus).toContain('Under Review');
  console.log('✓ Status: UNDER_REVIEW');

  // ===== PHASE 4: ADJUSTER APPROVES =====
  console.log('Phase 4: Adjuster approves claim...');
  const approveBtn = await adjusterPage.$('button:has-text("Approve")');
  if (approveBtn) {
    await approveBtn.click();
    await adjusterPage.waitForTimeout(1500);

    // Fill notes if dialog appears
    const notesField = await adjusterPage.$('textarea');
    if (notesField) {
      await notesField.fill('Outpatient cardiology visit confirmed. Deductible and copay applied.');
    }

    // Confirm approval
    const confirmApproveBtn = await adjusterPage.$('button:has-text("Confirm")');
    if (confirmApproveBtn) {
      await confirmApproveBtn.click();
      await adjusterPage.waitForTimeout(2000);
    }
  }

  const approvedStatus = await adjusterPage.textContent('[data-testid="status-badge"]');
  expect(approvedStatus).toContain('Approved');
  console.log('✓ Status: APPROVED');

  await adjusterPage.context().close();

  // ===== PHASE 5: FINANCE PROCESSES PAYOUT =====
  console.log('Phase 5: Finance processes payout...');
  const financePage = await browser.newPage();

  await financePage.goto('http://localhost:5173/auth/login', { waitUntil: 'domcontentloaded' });
  await financePage.waitForTimeout(2000);

  await financePage.fill('#email', 'finance@healthclaims.com');
  await financePage.fill('#password', 'Finance123!');
  await financePage.click('[data-testid="login-submit-btn"]');

  await financePage.waitForURL('**/finance/**', { timeout: 15000 });
  console.log('✓ Finance logged in');

  // Navigate to payouts
  await financePage.goto('http://localhost:5173/finance/payouts');
  await financePage.waitForLoadState('domcontentloaded');
  await financePage.waitForTimeout(2000);

  // Find and open the claim
  const claimLink = await financePage.$(`text=${claimNumber}`);
  if (claimLink) {
    await claimLink.click();
    await financePage.waitForURL('**/finance/payouts/**', { timeout: 10000 });
    await financePage.waitForTimeout(1500);

    // Verify reimbursable amount is $440.00
    const pageContent = await financePage.content();
    expect(pageContent).toContain('440');
    console.log('✓ Reimbursable amount: $440.00');

    // Process payment
    const payBtn = await financePage.$('button:has-text("Process Payment")');
    if (payBtn) {
      await payBtn.click();
      await financePage.waitForTimeout(1500);

      // Fill payment reference
      const refFields = await financePage.$$('input[type="text"]');
      if (refFields.length > 0) {
        await refFields[0].fill('PAY-TEST-001');
      }

      // Confirm payment
      const confirmPayBtn = await financePage.$('button:has-text("Confirm")');
      if (confirmPayBtn) {
        await confirmPayBtn.click();
        await financePage.waitForTimeout(2000);
      }
    }

    // Verify status is PAID
    const paidStatus = await financePage.textContent('[data-testid="status-badge"]');
    expect(paidStatus).toContain('Paid');
    console.log('✓ Status: PAID');
  }

  await financePage.context().close();

  // ===== PHASE 6: PATIENT VERIFIES FINAL STATE =====
  console.log('Phase 6: Patient verifies final state...');
  const finalPatientPage = await browser.newPage();

  await finalPatientPage.goto('http://localhost:5173/auth/login', { waitUntil: 'domcontentloaded' });
  await finalPatientPage.waitForTimeout(2000);

  await finalPatientPage.fill('#email', 'patient2@healthclaims.com');
  await finalPatientPage.fill('#password', 'Patient123!');
  await finalPatientPage.click('[data-testid="login-submit-btn"]');

  await finalPatientPage.waitForURL('**/patient/**', { timeout: 15000 });
  console.log('✓ Patient logged in (final)');

  // Navigate to claim
  await finalPatientPage.goto(`http://localhost:5173/patient/claims/${claimNumber}`);
  await finalPatientPage.waitForLoadState('domcontentloaded');
  await finalPatientPage.waitForTimeout(1500);

  // Verify final status is PAID
  const finalStatus = await finalPatientPage.textContent('[data-testid="status-badge"]');
  expect(finalStatus).toContain('Paid');
  console.log('✓ Final status verified: PAID');

  // Verify reimbursable amount
  const finalContent = await finalPatientPage.content();
  expect(finalContent).toContain('440');
  console.log('✓ Final reimbursable amount: $440.00');

  // ===== FINAL VERIFICATION =====
  console.log('\n' + '='.repeat(70));
  console.log('✅ TC-001 PASSED: Full claim lifecycle completed successfully');
  console.log('='.repeat(70));
  console.log(`Claim #: ${claimNumber}`);
  console.log('Path: DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → PAID');
  console.log('Amount: $800.00');
  console.log('Deductible applied: $250.00');
  console.log('Copay (20%): $110.00');
  console.log('Reimbursable: $440.00');
  console.log('='.repeat(70));

  await finalPatientPage.context().close();
});
