export type Role = 'PATIENT' | 'ADJUSTER' | 'FINANCE_OFFICER' | 'ADMIN'
export type ProviderType = 'PHYSICIAN' | 'HOSPITAL' | 'CLINIC' | 'OTHER'
export type SlaStatus = 'ON_TRACK' | 'AT_RISK' | 'BREACHED'
export type ClaimStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'INFO_REQUESTED'
  | 'INFO_RESPONDED'
  | 'APPROVED'
  | 'PARTIALLY_APPROVED'
  | 'REJECTED'
  | 'PAID'
  | 'WITHDRAWN'
  | 'APPEAL_PENDING'
  | 'APPEAL_APPROVED'
  | 'APPEAL_DENIED'

export type LineAdjudicationStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'REDUCED'

export interface ClaimLine {
  id: string
  claimId: string
  lineNumber: number
  cptCode: string
  modifier?: string | null
  diagnosisPointers: number[]
  units: number
  billedAmount: number
  allowedAmount?: number | null
  adjudicationStatus: LineAdjudicationStatus
  denialReason?: string | null
  adjudicatorNote?: string | null
  createdAt: string
  updatedAt: string
}

export interface ClaimLineInput {
  cptCode: string
  modifier?: string
  diagnosisPointers: number[]
  units: number
  billedAmount: number
}
export type ClaimType = 'HOSPITALIZATION' | 'OUTPATIENT' | 'DENTAL' | 'VISION' | 'PHARMACY'
export type PolicyType = 'BASIC' | 'STANDARD' | 'PREMIUM'

export interface Provider {
  id: string
  npi: string
  name: string
  providerType: ProviderType
  inNetwork: boolean
  specialty?: string
  createdAt: string
  updatedAt: string
}

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: Role
  isActive: boolean
  specialty?: string | null
  createdAt: string
}

export interface PolicyBenefits {
  hospitalization?: { limit: number; coveragePercent?: number }
  outpatient?: { limit: number; coveragePercent?: number }
  dental?: { limit: number; coveragePercent?: number }
  vision?: { limit: number; coveragePercent?: number }
  pharmacy?: { limit: number; coveragePercent?: number }
  [key: string]: { limit: number; coveragePercent?: number } | undefined
}

export interface Policy {
  id: string
  name: string
  type: PolicyType
  description?: string
  coverageAmount: number
  deductible: number
  copayPercentage: number
  oopMax: number
  oonDeductible: number
  oonCopayPercent: number
  filingDeadlineDays: number
  effectiveDate: string
  expiryDate: string
  isActive: boolean
  benefits: PolicyBenefits
  coverageLimit?: number
}

export interface Payout {
  id: string
  claimId: string
  processedBy: string
  amount: number
  paymentRef: string
  batchRef?: string
  notes?: string
  paidAt: string
  processor?: User
}

export interface Claim {
  id: string
  claimNumber: string
  patientId: string
  adjusterId?: string
  assignedAdjusterId?: string | null
  policyId: string
  providerId?: string
  networkStatus?: 'IN' | 'OUT'
  type: ClaimType
  status: ClaimStatus
  description: string
  incidentDate: string
  totalAmount: number
  totalBilled?: number | null
  totalAllowed?: number | null
  eligibleAmount?: number
  deductible?: number
  reimbursable?: number
  adjustedAmount?: number
  adjusterNotes?: string
  appealReason?: string
  originalAdjudicatorId?: string
  fraudScore?: number
  fraudFlags?: string
  planYearStart?: string
  filingDeadlineOverride?: boolean
  cobFlag?: boolean
  diagnosisCodes?: string[]
  daysOpen?: number
  submittedAt?: string | null
  ageDays?: number | null
  slaStatus?: SlaStatus | null
  ackDays?: number | null
  ackSlaBreached?: boolean | null
  createdAt: string
  updatedAt: string
  patient?: User
  adjuster?: User
  assignedAdjuster?: User | null
  policy?: Policy
  provider?: Provider
  documents?: Document[]
  lines?: ClaimLine[]
  events?: ClaimEvent[]
  infoRequests?: InfoRequest[]
  payout?: Payout
  cobDetail?: CobDetail | null
  secondaryClaim?: { id: string; claimNumber: string; status: string; reimbursable?: number | null; payout?: Payout | null } | null
  primaryClaim?: { id: string; claimNumber: string; status: string; reimbursable?: number | null; payout?: Payout | null } | null
}

export interface Document {
  id: string
  claimId: string
  filename: string
  originalName: string
  mimeType: string
  size: number
  type: string
  isSystemGenerated: boolean
  createdAt: string
}

export interface ClaimEvent {
  id: string
  claimId: string
  userId: string
  action: string
  fromStatus?: ClaimStatus
  toStatus?: ClaimStatus
  note?: string
  createdAt: string
  user?: User
}

export interface InfoRequest {
  id: string
  claimId: string
  fromId: string
  message: string
  response?: string
  respondedAt?: string
  createdAt: string
  from?: User
}

export interface Notification {
  id: string
  userId: string
  title: string
  message: string
  type?: string
  isRead: boolean
  link?: string
  createdAt: string
}

export interface AuthResponse {
  token: string
  user: User
}

export interface Analytics {
  totalClaims: number
  byStatus: Partial<Record<ClaimStatus, number>>
  byType: Partial<Record<ClaimType, number>>
  totalReimbursable: number
  paidAmount: number
  pendingAmount: number
  monthlyTrend: { month: string; count: number; amount: number }[]
  hasFilter?: boolean
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}



export interface NotificationPrefs {
  claimSubmitted: boolean
  claimApproved: boolean
  claimRejected: boolean
  claimPaid: boolean
  infoRequested: boolean
  claimUnderReview: boolean
  appealPending: boolean
}

export type PayerOrder = 'PRIMARY' | 'SECONDARY'

export interface UserPolicy {
  id: string
  userId: string
  policyId: string
  startDate: string
  planYearType: 'CALENDAR' | 'ANNIVERSARY'
  payerOrder: PayerOrder
  createdAt: string
  user: Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'isActive'>
  policy: Policy
}

export interface CobDetail {
  id: string
  claimId: string
  primaryInsurerName?: string | null
  primaryPaidAmount?: number | null
  primaryEOBDate?: string | null
  patientResponsibility?: number | null
  createdAt: string
  updatedAt: string
}

export interface CoverageSummary {
  policy: Policy
  usedAmount: number
  reimbursedAmount: number
  remainingCoverage: number
  deductiblePaid: number
  oopPaid: number
  inNetworkDeductiblePaid: number
  inNetworkOopPaid: number
  outOfNetworkDeductiblePaid: number
  outOfNetworkOopPaid: number
  isExpired: boolean
  expiresInDays: number
}

export interface FinanceReportMonth {
  month: string
  claimsCount: number
  totalPaid: number
  avgAmount: number
  byType: Record<string, number>
}

export interface FinanceReport {
  monthly: FinanceReportMonth[]
  summary: {
    pendingPayoutsCount: number
    pendingPayoutsAmount: number
    allTimePaidAmount: number
    allTimePaidCount: number
  }
}

export interface AdjusterWorkload {
  adjuster: User & { specialty?: string | null }
  openClaims: number
  closedLast30Days: number
  approvalRate: number
  avgProcessingHours: number | null
}

export interface ClaimTypeSummaryItem {
  type: ClaimType
  limit: number | null
  usedAmount: number
  remainingAmount: number | null
  isCurrentType: boolean
}

export interface ClaimTypeSummary {
  claimType: ClaimType
  claimAmount: number
  typeUsages: ClaimTypeSummaryItem[]
}

export interface TatReportItem {
  claimId: string
  claimNumber: string
  submittedAt: string
  ageDays: number
  slaStatus: SlaStatus
  daysUntilBreach: number
  currentStatus: ClaimStatus
  patient: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'>
  adjuster: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'> | null
}

export interface TatReportSummary {
  onTrack: number
  atRisk: number
  breached: number
  total: number
}

export interface TatReportThresholds {
  adjudicationDays: number
  ackDays: number
  warningWindowDays: number
}

export interface TatReport {
  items: TatReportItem[]
  total: number
  page: number
  totalPages: number
  summary: TatReportSummary
  thresholds: TatReportThresholds
}

export type OverpaymentReason = 'ADJUSTER_ERROR' | 'COB_UPDATE' | 'POLICY_CHANGE'
export type OverpaymentStatus = 'IDENTIFIED' | 'OFFSET' | 'WAIVED'

export interface Overpayment {
  id: string
  claimId: string
  originalPayoutId: string
  overpaidAmount: number
  reason: OverpaymentReason
  status: OverpaymentStatus
  waiverReason?: string
  createdAt: string
  updatedAt: string
  claim?: {
    id: string
    claimNumber: string
    patientId: string
    patient?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'>
  }
  originalPayout?: {
    id: string
    paymentRef: string
    amount: number
    paidAt: string
  }
}

export interface OverpaymentsResponse {
  data: Overpayment[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}
