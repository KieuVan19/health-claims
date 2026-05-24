import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../config';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  if (config.smtp.host && config.smtp.user) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
    console.log('[Email] Using SMTP transport');
  } else {
    // Mock transport — logs to console
    transporter = {
      sendMail: async (options: nodemailer.SendMailOptions) => {
        console.log('[Email Mock] ─────────────────────────────────');
        console.log(`[Email Mock] To:      ${String(options.to)}`);
        console.log(`[Email Mock] Subject: ${String(options.subject)}`);
        console.log(`[Email Mock] Body:\n${String(options.text ?? options.html)}`);
        console.log('[Email Mock] ─────────────────────────────────');
        return { messageId: `mock-${Date.now()}` };
      },
    } as unknown as Transporter;
    console.log('[Email] Using console (mock) transport — configure SMTP to send real emails');
  }

  return transporter;
}

async function sendMail(to: string, subject: string, text: string, html?: string): Promise<void> {
  try {
    await getTransporter().sendMail({
      from: config.smtp.from,
      to,
      subject,
      text,
      html,
    });
  } catch (err) {
    console.error('[Email] Failed to send email:', err);
  }
}

function wrap(content: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #1d4ed8; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 20px;">HealthClaims Portal</h1>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        ${content}
      </div>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">
        This is an automated message. Please do not reply to this email.
      </p>
    </div>
  `;
}

export async function sendClaimSubmitted(to: string, claimNumber: string): Promise<void> {
  const subject = `Claim ${claimNumber} Submitted Successfully`;
  const text = `Your claim ${claimNumber} has been submitted and is pending review.\n\nBest regards,\nHealthClaims Team`;
  const html = wrap(`
    <h2 style="color: #1d4ed8;">Claim Submitted Successfully</h2>
    <p>Your claim <strong>${claimNumber}</strong> has been submitted and is pending review.</p>
    <p>You will be notified once your claim has been reviewed.</p>
  `);
  await sendMail(to, subject, text, html);
}

export async function sendClaimApproved(to: string, claimNumber: string, amount: number): Promise<void> {
  const subject = `Claim ${claimNumber} Approved`;
  const text = `Great news! Your claim ${claimNumber} has been approved.\nReimbursable amount: $${amount.toFixed(2)}\n\nBest regards,\nHealthClaims Team`;
  const html = wrap(`
    <h2 style="color: #16a34a;">Claim Approved</h2>
    <p>Great news! Your claim <strong>${claimNumber}</strong> has been approved.</p>
    <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
      <tr><td style="padding: 8px; background: #f3f4f6; font-weight: bold;">Claim Number</td><td style="padding: 8px;">${claimNumber}</td></tr>
      <tr><td style="padding: 8px; background: #f3f4f6; font-weight: bold;">Reimbursable Amount</td><td style="padding: 8px; color: #16a34a; font-weight: bold;">$${amount.toFixed(2)}</td></tr>
    </table>
    <p>Your payment will be processed shortly.</p>
  `);
  await sendMail(to, subject, text, html);
}

export async function sendClaimRejected(to: string, claimNumber: string, reason: string): Promise<void> {
  const subject = `Claim ${claimNumber} Rejected`;
  const text = `We regret to inform you that your claim ${claimNumber} has been rejected.\nReason: ${reason}\n\nYou may resubmit your claim with additional documentation.\n\nBest regards,\nHealthClaims Team`;
  const html = wrap(`
    <h2 style="color: #dc2626;">Claim Rejected</h2>
    <p>We regret to inform you that your claim <strong>${claimNumber}</strong> has been rejected.</p>
    <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
      <tr><td style="padding: 8px; background: #f3f4f6; font-weight: bold;">Claim Number</td><td style="padding: 8px;">${claimNumber}</td></tr>
      <tr><td style="padding: 8px; background: #f3f4f6; font-weight: bold;">Reason</td><td style="padding: 8px;">${reason}</td></tr>
    </table>
    <p>You may resubmit your claim with additional documentation or contact support for assistance.</p>
  `);
  await sendMail(to, subject, text, html);
}

export async function sendClaimPaid(
  to: string,
  claimNumber: string,
  amount: number,
  paymentRef: string
): Promise<void> {
  const subject = `Payment Processed for Claim ${claimNumber}`;
  const text = `Payment of $${amount.toFixed(2)} has been processed for claim ${claimNumber}.\nPayment Reference: ${paymentRef}\n\nBest regards,\nHealthClaims Team`;
  const html = wrap(`
    <h2 style="color: #16a34a;">Payment Processed</h2>
    <p>Your payment has been successfully processed.</p>
    <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
      <tr><td style="padding: 8px; background: #f3f4f6; font-weight: bold;">Claim Number</td><td style="padding: 8px;">${claimNumber}</td></tr>
      <tr><td style="padding: 8px; background: #f3f4f6; font-weight: bold;">Amount Paid</td><td style="padding: 8px; color: #16a34a; font-weight: bold;">$${amount.toFixed(2)}</td></tr>
      <tr><td style="padding: 8px; background: #f3f4f6; font-weight: bold;">Payment Reference</td><td style="padding: 8px;">${paymentRef}</td></tr>
    </table>
  `);
  await sendMail(to, subject, text, html);
}

export async function sendInfoRequested(to: string, claimNumber: string, message: string): Promise<void> {
  const subject = `Information Requested for Claim ${claimNumber}`;
  const text = `Additional information is required for your claim ${claimNumber}:\n\n${message}\n\nPlease log in to the portal to respond.\n\nBest regards,\nHealthClaims Team`;
  const html = wrap(`
    <h2 style="color: #d97706;">Information Required</h2>
    <p>Additional information is required to process your claim <strong>${claimNumber}</strong>:</p>
    <div style="background: #fffbeb; border-left: 4px solid #d97706; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0;">
      <p style="margin: 0;">${message}</p>
    </div>
    <p>Please log in to the portal to provide your response.</p>
  `);
  await sendMail(to, subject, text, html);
}

export async function sendAppealDenied(to: string, claimNumber: string, denialReason: string): Promise<void> {
  const subject = `Internal Appeal Denied for Claim ${claimNumber} — External Review Rights`;
  const text = [
    `We have completed our internal appeal review for claim ${claimNumber}.`,
    `Decision: Appeal Denied`,
    denialReason ? `Reason: ${denialReason}` : '',
    '',
    'NOTICE OF EXTERNAL APPEAL RIGHTS (ACA §2719)',
    'You have the right to request an independent external review of this decision.',
    'To request an external review, contact your state insurance commissioner or submit a request',
    'to an Independent Review Organisation (IRO) within 4 months of this notice.',
    '',
    'Best regards,',
    'HealthClaims Team',
  ].filter(Boolean).join('\n');

  const html = wrap(`
    <h2 style="color: #dc2626;">Internal Appeal Denied — Claim ${claimNumber}</h2>
    <p>We have completed our internal appeal review for claim <strong>${claimNumber}</strong>.</p>
    ${denialReason ? `
    <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
      <tr><td style="padding: 8px; background: #f3f4f6; font-weight: bold;">Denial Reason</td><td style="padding: 8px;">${denialReason}</td></tr>
    </table>` : ''}
    <div style="background: #fef3c7; border-left: 4px solid #d97706; padding: 16px; margin: 16px 0; border-radius: 0 4px 4px 0;">
      <p style="margin: 0 0 8px 0; font-weight: bold; color: #92400e;">NOTICE OF EXTERNAL APPEAL RIGHTS (ACA §2719)</p>
      <p style="margin: 0; color: #78350f;">
        You have the right to request an <strong>independent external review</strong> of this decision
        by a qualified Independent Review Organisation (IRO). To initiate an external appeal,
        contact your state insurance commissioner or submit a written request within
        <strong>4 months</strong> of receiving this notice.
      </p>
    </div>
    <p style="color: #6b7280; font-size: 12px;">
      This notice is provided in compliance with the Affordable Care Act internal and external appeal
      rights requirements under 45 CFR §147.136.
    </p>
  `);
  await sendMail(to, subject, text, html);
}

export async function sendPasswordReset(to: string, resetLink: string): Promise<void> {
  const subject = 'Password Reset Request';
  const text = `You requested a password reset. Click the link below (valid for 1 hour):\n${resetLink}\n\nIf you did not request this, ignore this email.\n\nBest regards,\nHealthClaims Team`;
  const html = wrap(`
    <h2 style="color: #1d4ed8;">Password Reset Request</h2>
    <p>You requested a password reset. Click the button below to set a new password. This link is valid for <strong>1 hour</strong>.</p>
    <div style="text-align: center; margin: 24px 0;">
      <a href="${resetLink}" style="background: #1d4ed8; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Reset Password</a>
    </div>
    <p style="color: #6b7280; font-size: 14px;">If you did not request this, please ignore this email.</p>
    <p style="color: #6b7280; font-size: 12px; word-break: break-all;">Or copy this link: ${resetLink}</p>
  `);
  await sendMail(to, subject, text, html);
}
