// Claim Status Lifecycle
export const CLAIM_STATUSES = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  INFO_REQUESTED: 'INFO_REQUESTED',
  INFO_RESPONDED: 'INFO_RESPONDED',
  APPROVED: 'APPROVED',
  PARTIALLY_APPROVED: 'PARTIALLY_APPROVED',
  REJECTED: 'REJECTED',
  PAID: 'PAID',
  APPEAL_PENDING: 'APPEAL_PENDING',
  APPEAL_DENIED: 'APPEAL_DENIED',
} as const;

export type ClaimStatus = typeof CLAIM_STATUSES[keyof typeof CLAIM_STATUSES];

// Open claim statuses that can be assigned or transitioned
export const OPEN_CLAIM_STATUSES = [
  CLAIM_STATUSES.SUBMITTED,
  CLAIM_STATUSES.UNDER_REVIEW,
  CLAIM_STATUSES.INFO_REQUESTED,
  CLAIM_STATUSES.INFO_RESPONDED,
  CLAIM_STATUSES.APPEAL_PENDING,
] as const;

// User Roles
export const USER_ROLES = {
  PATIENT: 'PATIENT',
  ADJUSTER: 'ADJUSTER',
  FINANCE_OFFICER: 'FINANCE_OFFICER',
  ADMIN: 'ADMIN',
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

// Claim Types
export const CLAIM_TYPES = {
  HOSPITALIZATION: 'HOSPITALIZATION',
  OUTPATIENT: 'OUTPATIENT',
  DENTAL: 'DENTAL',
  VISION: 'VISION',
  PHARMACY: 'PHARMACY',
} as const;

export type ClaimType = typeof CLAIM_TYPES[keyof typeof CLAIM_TYPES];

// Network Status
export const NETWORK_STATUSES = {
  IN: 'IN',
  OUT: 'OUT',
} as const;

export type NetworkStatus = typeof NETWORK_STATUSES[keyof typeof NETWORK_STATUSES];

// Line Adjudication Status
export const ADJUDICATION_STATUSES = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  DENIED: 'DENIED',
  REDUCED: 'REDUCED',
} as const;

export type AdjudicationStatus = typeof ADJUDICATION_STATUSES[keyof typeof ADJUDICATION_STATUSES];

// Document Types
export const DOCUMENT_TYPES = {
  DOCUMENT: 'DOCUMENT',
  EOB: 'EOB',
} as const;

export type DocumentType = typeof DOCUMENT_TYPES[keyof typeof DOCUMENT_TYPES];

// Payer Order
export const PAYER_ORDERS = {
  PRIMARY: 'PRIMARY',
  SECONDARY: 'SECONDARY',
} as const;

export type PayerOrder = typeof PAYER_ORDERS[keyof typeof PAYER_ORDERS];

// Plan Year Type
export const PLAN_YEAR_TYPES = {
  CALENDAR: 'CALENDAR',
  FISCAL: 'FISCAL',
} as const;

export type PlanYearType = typeof PLAN_YEAR_TYPES[keyof typeof PLAN_YEAR_TYPES];

// Overpayment Status
export const OVERPAYMENT_STATUSES = {
  IDENTIFIED: 'IDENTIFIED',
  OFFSET: 'OFFSET',
  WAIVED: 'WAIVED',
} as const;

export type OverpaymentStatus = typeof OVERPAYMENT_STATUSES[keyof typeof OVERPAYMENT_STATUSES];

// Overpayment Reasons
export const OVERPAYMENT_REASONS = {
  ADJUSTER_ERROR: 'ADJUSTER_ERROR',
  COB_UPDATE: 'COB_UPDATE',
  POLICY_CHANGE: 'POLICY_CHANGE',
} as const;

export type OverpaymentReason = typeof OVERPAYMENT_REASONS[keyof typeof OVERPAYMENT_REASONS];
