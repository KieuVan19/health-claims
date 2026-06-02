// Centralized enum definitions for the entire application
// This is the single source of truth for all statuses, roles, and constants

// ─── User Roles ─────────────────────────────────────────────────────────────

export const USER_ROLES = ['PATIENT', 'ADJUSTER', 'FINANCE_OFFICER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

// ─── Claim Statuses ─────────────────────────────────────────────────────────

export const CLAIM_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'INFO_REQUESTED',
  'INFO_RESPONDED',
  'APPROVED',
  'PARTIALLY_APPROVED',
  'REJECTED',
  'PAID',
  'WITHDRAWN',
  'APPEAL_PENDING',
  'APPEAL_DENIED',
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

// Terminal statuses where SLA is no longer active
export const CLAIM_TERMINAL_STATUSES = [
  'PAID',
  'REJECTED',
  'WITHDRAWN',
  'APPEAL_DENIED',
  'APPROVED',
  'PARTIALLY_APPROVED',
  'DRAFT',
] as const;

// ─── Claim Types ────────────────────────────────────────────────────────────

export const CLAIM_TYPES = [
  'HOSPITALIZATION',
  'OUTPATIENT',
  'DENTAL',
  'VISION',
  'PHARMACY',
] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

// ─── Network Status ─────────────────────────────────────────────────────────

export const NETWORK_STATUSES = ['IN', 'OUT'] as const;
export type NetworkStatus = (typeof NETWORK_STATUSES)[number];

// ─── Claim Line Adjudication Status ─────────────────────────────────────────

export const CLAIM_LINE_ADJUDICATION_STATUSES = [
  'PENDING',
  'APPROVED',
  'DENIED',
  'REDUCED',
] as const;
export type ClaimLineAdjudicationStatus = (typeof CLAIM_LINE_ADJUDICATION_STATUSES)[number];

// ─── Overpayment Statuses ───────────────────────────────────────────────────

export const OVERPAYMENT_STATUSES = ['IDENTIFIED', 'OFFSET', 'WAIVED'] as const;
export type OverpaymentStatus = (typeof OVERPAYMENT_STATUSES)[number];

// ─── Overpayment Reasons ────────────────────────────────────────────────────

export const OVERPAYMENT_REASONS = ['ADJUSTER_ERROR', 'COB_UPDATE', 'POLICY_CHANGE'] as const;
export type OverpaymentReason = (typeof OVERPAYMENT_REASONS)[number];

// ─── Document Type ──────────────────────────────────────────────────────────

export const DOCUMENT_TYPES = ['DOCUMENT'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

// ─── Notification Type ──────────────────────────────────────────────────────

export const NOTIFICATION_TYPES = ['info', 'success', 'warning', 'error'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// ─── UserPolicy Plan Year Type ──────────────────────────────────────────────

export const PLAN_YEAR_TYPES = ['CALENDAR', 'FISCAL'] as const;
export type PlanYearType = (typeof PLAN_YEAR_TYPES)[number];

// ─── UserPolicy Payer Order ─────────────────────────────────────────────────

export const PAYER_ORDERS = ['PRIMARY', 'SECONDARY'] as const;
export type PayerOrder = (typeof PAYER_ORDERS)[number];
