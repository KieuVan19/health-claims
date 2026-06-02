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
  WITHDRAWN: 'WITHDRAWN',
  APPEAL_PENDING: 'APPEAL_PENDING',
  APPEAL_DENIED: 'APPEAL_DENIED',
} as const;

export type ClaimStatus = typeof CLAIM_STATUSES[keyof typeof CLAIM_STATUSES];

// For Zod validation - use array values
export const CLAIM_STATUSES_ARRAY = [
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

// Open claim statuses that can be assigned or transitioned
export const OPEN_CLAIM_STATUSES = [
  CLAIM_STATUSES.SUBMITTED,
  CLAIM_STATUSES.UNDER_REVIEW,
  CLAIM_STATUSES.INFO_REQUESTED,
  CLAIM_STATUSES.INFO_RESPONDED,
  CLAIM_STATUSES.APPEAL_PENDING,
] as const;

// Terminal statuses where SLA is no longer active
export const CLAIM_TERMINAL_STATUSES = [
  CLAIM_STATUSES.PAID,
  CLAIM_STATUSES.REJECTED,
  CLAIM_STATUSES.WITHDRAWN,
  CLAIM_STATUSES.APPEAL_DENIED,
] as const;

// User Roles
export const USER_ROLES = {
  PATIENT: 'PATIENT',
  ADJUSTER: 'ADJUSTER',
  FINANCE_OFFICER: 'FINANCE_OFFICER',
  ADMIN: 'ADMIN',
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

export const USER_ROLES_ARRAY = ['PATIENT', 'ADJUSTER', 'FINANCE_OFFICER', 'ADMIN'] as const;

// Claim Types
export const CLAIM_TYPES = {
  HOSPITALIZATION: 'HOSPITALIZATION',
  OUTPATIENT: 'OUTPATIENT',
  DENTAL: 'DENTAL',
  VISION: 'VISION',
  PHARMACY: 'PHARMACY',
} as const;

export type ClaimType = typeof CLAIM_TYPES[keyof typeof CLAIM_TYPES];

export const CLAIM_TYPES_ARRAY = ['HOSPITALIZATION', 'OUTPATIENT', 'DENTAL', 'VISION', 'PHARMACY'] as const;

// Network Status
export const NETWORK_STATUSES = {
  IN: 'IN',
  OUT: 'OUT',
} as const;

export type NetworkStatus = typeof NETWORK_STATUSES[keyof typeof NETWORK_STATUSES];

export const NETWORK_STATUSES_ARRAY = ['IN', 'OUT'] as const;

// Line Adjudication Status
export const ADJUDICATION_STATUSES = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  DENIED: 'DENIED',
  REDUCED: 'REDUCED',
} as const;

export type AdjudicationStatus = typeof ADJUDICATION_STATUSES[keyof typeof ADJUDICATION_STATUSES];

export const ADJUDICATION_STATUSES_ARRAY = ['PENDING', 'APPROVED', 'DENIED', 'REDUCED'] as const;

// Claim Line Adjudication Status (alias)
export const CLAIM_LINE_ADJUDICATION_STATUSES = ADJUDICATION_STATUSES_ARRAY;
export type ClaimLineAdjudicationStatus = AdjudicationStatus;

// Document Types
export const DOCUMENT_TYPES = {
  DOCUMENT: 'DOCUMENT',
  EOB: 'EOB',
} as const;

export type DocumentType = typeof DOCUMENT_TYPES[keyof typeof DOCUMENT_TYPES];

export const DOCUMENT_TYPES_ARRAY = ['DOCUMENT', 'EOB'] as const;

// Notification Types
export const NOTIFICATION_TYPES = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
} as const;

export type NotificationType = typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES];

export const NOTIFICATION_TYPES_ARRAY = ['info', 'success', 'warning', 'error'] as const;

// Payer Order
export const PAYER_ORDERS = {
  PRIMARY: 'PRIMARY',
  SECONDARY: 'SECONDARY',
} as const;

export type PayerOrder = typeof PAYER_ORDERS[keyof typeof PAYER_ORDERS];

export const PAYER_ORDERS_ARRAY = ['PRIMARY', 'SECONDARY'] as const;

// Plan Year Type
export const PLAN_YEAR_TYPES = {
  CALENDAR: 'CALENDAR',
  FISCAL: 'FISCAL',
} as const;

export type PlanYearType = typeof PLAN_YEAR_TYPES[keyof typeof PLAN_YEAR_TYPES];

export const PLAN_YEAR_TYPES_ARRAY = ['CALENDAR', 'FISCAL'] as const;

// Overpayment Status
export const OVERPAYMENT_STATUSES = {
  IDENTIFIED: 'IDENTIFIED',
  OFFSET: 'OFFSET',
  WAIVED: 'WAIVED',
} as const;

export type OverpaymentStatus = typeof OVERPAYMENT_STATUSES[keyof typeof OVERPAYMENT_STATUSES];

export const OVERPAYMENT_STATUSES_ARRAY = ['IDENTIFIED', 'OFFSET', 'WAIVED'] as const;

// Overpayment Reasons
export const OVERPAYMENT_REASONS = {
  ADJUSTER_ERROR: 'ADJUSTER_ERROR',
  COB_UPDATE: 'COB_UPDATE',
  POLICY_CHANGE: 'POLICY_CHANGE',
} as const;

export type OverpaymentReason = typeof OVERPAYMENT_REASONS[keyof typeof OVERPAYMENT_REASONS];

export const OVERPAYMENT_REASONS_ARRAY = ['ADJUSTER_ERROR', 'COB_UPDATE', 'POLICY_CHANGE'] as const;
