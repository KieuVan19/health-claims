import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import prisma from '../lib/prisma';
import { config } from '../config';

interface EobClaimData {
  id: string;
  claimNumber: string;
  type: string;
  status: string;
  networkStatus: string;
  incidentDate: Date;
  description: string;
  totalAmount: number;
  eligibleAmount: number | null;
  deductible: number | null;
  reimbursable: number | null;
  adjustedAmount: number | null;
  adjusterNotes: string | null;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  policy: {
    id: string;
    name: string;
    type: string;
    coverageAmount: number;
    copayPercentage: number;
    oonCopayPercent: number;
  };
  adjuster: {
    firstName: string;
    lastName: string;
  } | null;
}

function buildEobPdf(claim: EobClaimData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const isRejected = claim.status === 'REJECTED';

    doc.fontSize(20).font('Helvetica-Bold').text('Explanation of Benefits', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').text('Health Claims Portal', { align: 'center' });
    doc.text(
      `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
      { align: 'center' },
    );
    doc.text(`Status: ${claim.status}`, { align: 'center' });

    doc.moveDown(1.5);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(1);

    doc.fontSize(12).font('Helvetica-Bold').text('Member Information');
    doc.fontSize(10).font('Helvetica');
    doc.text(`Name: ${claim.patient.firstName} ${claim.patient.lastName}`);
    doc.text(`Member ID: ${claim.patient.id}`);
    doc.text(`Email: ${claim.patient.email}`);
    doc.text(`Policy: ${claim.policy.name} (${claim.policy.type})`);
    doc.text(`Policy Number: ${claim.policy.id}`);
    doc.moveDown(1);

    doc.fontSize(12).font('Helvetica-Bold').text('Claim Details');
    doc.fontSize(10).font('Helvetica');
    doc.text(`Claim Number: ${claim.claimNumber}`);
    doc.text(`Claim Type: ${claim.type}`);
    doc.text(
      `Date of Service: ${new Date(claim.incidentDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    );
    doc.text(`Provider: ${claim.description}`);
    const networkLabel = claim.networkStatus === 'OUT' ? 'Out-of-Network' : 'In-Network';
    const appliedCopay = claim.networkStatus === 'OUT' ? claim.policy.oonCopayPercent ?? claim.policy.copayPercentage : claim.policy.copayPercentage;
    doc.text(`Network Tier: ${networkLabel}`);
    doc.text(`Applied Copay Rate: ${appliedCopay}%`);
    if (claim.adjuster) {
      doc.text(`Reviewed By: ${claim.adjuster.firstName} ${claim.adjuster.lastName}`);
    }
    doc.moveDown(1);

    if (isRejected) {
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#cc0000').text('Denial Information');
      doc.fontSize(10).font('Helvetica').fillColor('black');
      doc.text(`Denial Reason: ${claim.adjusterNotes ?? 'No reason provided'}`);
      doc.moveDown(1);
    }

    doc.fontSize(12).font('Helvetica-Bold').fillColor('black').text('Financial Summary');
    doc.moveDown(0.5);

    const tableLeft = 50;
    const tableRight = 400;
    const rowHeight = 20;
    let y = doc.y;

    const drawRow = (label: string, value: string, bold = false) => {
      doc.fontSize(10).font(bold ? 'Helvetica-Bold' : 'Helvetica');
      doc.text(label, tableLeft, y);
      doc.text(value, tableRight, y, { align: 'right' });
      y += rowHeight;
    };

    const eligible = claim.eligibleAmount ?? 0;
    const ded = claim.deductible ?? 0;
    const reimb = claim.reimbursable ?? 0;
    const copay = Math.max(0, eligible - ded - reimb);
    const insurancePaid = claim.adjustedAmount ?? reimb;
    const patientResponsibility = claim.totalAmount - insurancePaid;
    const copayRate = claim.networkStatus === 'OUT' ? claim.policy.oonCopayPercent ?? claim.policy.copayPercentage : claim.policy.copayPercentage;
    const networkTag = claim.networkStatus === 'OUT' ? ' OON' : '';

    drawRow('Billed Amount:', `$${claim.totalAmount.toFixed(2)}`);
    drawRow('Allowed Amount (post-deductible base):', `$${eligible.toFixed(2)}`);
    drawRow('Deductible Applied:', `-$${ded.toFixed(2)}`);
    drawRow(`Co-pay${networkTag} (${copayRate}%):`, `-$${copay.toFixed(2)}`);

    doc.moveTo(tableLeft, y).lineTo(550, y).stroke();
    y += 5;

    if (isRejected) {
      drawRow('Insurance Paid:', '$0.00', true);
      drawRow('Patient Responsibility:', `$${claim.totalAmount.toFixed(2)}`, true);
    } else {
      drawRow('Insurance Paid:', `$${insurancePaid.toFixed(2)}`, true);
      drawRow('Patient Responsibility:', `$${Math.max(0, patientResponsibility).toFixed(2)}`, true);
    }

    doc.y = y + 10;
    doc.moveDown(2);

    doc.fontSize(8).font('Helvetica').fillColor('#888888');
    doc.text(
      'This document is an official Explanation of Benefits under ACA §2715. Please retain for your records.',
      { align: 'center' },
    );
    doc.text('For questions, contact your insurance administrator.', { align: 'center' });

    doc.end();
  });
}

/**
 * Generate an EOB PDF for a claim (APPROVED or REJECTED), save it to disk,
 * and create a Document record linked to the claim.
 * Idempotent: if an EOB already exists for this claim, does nothing.
 */
export async function generateAndStoreEob(claimId: string, triggeredByUserId: string, force = false): Promise<void> {
  if (!force) {
    const existing = await prisma.document.findFirst({
      where: { claimId, type: 'EOB' },
    });
    if (existing) return;
  }

  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, email: true } },
      policy: { select: { id: true, name: true, type: true, coverageAmount: true, copayPercentage: true, oonCopayPercent: true } },
      adjuster: { select: { firstName: true, lastName: true } },
    },
  });

  if (!claim) throw new Error(`Claim ${claimId} not found`);

  const pdfBuffer = await buildEobPdf(claim as EobClaimData);

  const eobDir = path.join(config.uploadDir, 'eob', claimId);
  fs.mkdirSync(eobDir, { recursive: true });

  const filename = `EOB-${claim.claimNumber}-${Date.now()}.pdf`;
  const filePath = path.join(eobDir, filename);
  fs.writeFileSync(filePath, pdfBuffer);

  await prisma.document.create({
    data: {
      claimId,
      filename,
      originalName: force ? `EOB-${claim.claimNumber} (Revised).pdf` : `EOB-${claim.claimNumber}.pdf`,
      mimeType: 'application/pdf',
      size: pdfBuffer.length,
      path: filePath,
      type: 'EOB',
      isSystemGenerated: true,
      uploadedById: triggeredByUserId,
    },
  });
}
