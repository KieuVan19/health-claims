import React from 'react'
import { ClaimStatus } from '../types'

interface StatusBadgeProps {
  status: ClaimStatus
  className?: string
  patientView?: boolean
}

const statusConfig: Record<ClaimStatus, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-gray-100 text-gray-700' },
  SUBMITTED: { label: 'Submitted', className: 'bg-blue-100 text-blue-700' },
  UNDER_REVIEW: { label: 'Under Review', className: 'bg-amber-100 text-amber-700' },
  INFO_REQUESTED: { label: 'Info Requested', className: 'bg-orange-100 text-orange-700' },
  INFO_RESPONDED: { label: 'Info Added', className: 'bg-teal-100 text-teal-700' },
  APPROVED: { label: 'Approved', className: 'bg-green-100 text-green-700' },
  PARTIALLY_APPROVED: { label: 'Partially Approved', className: 'bg-lime-100 text-lime-700' },
  REJECTED: { label: 'Rejected', className: 'bg-red-100 text-red-700' },
  PAID: { label: 'Paid', className: 'bg-emerald-100 text-emerald-700' },
  WITHDRAWN: { label: 'Withdrawn', className: 'bg-slate-100 text-slate-600' },
  APPEAL_PENDING: { label: 'Appeal', className: 'bg-purple-100 text-purple-700' },
  APPEAL_APPROVED: { label: 'Appeal Approved', className: 'bg-green-100 text-green-700' },
  APPEAL_DENIED: { label: 'Appeal Denied', className: 'bg-red-100 text-red-700' },
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '', patientView = false }) => {
  const displayStatus = patientView && status === 'INFO_RESPONDED' ? 'UNDER_REVIEW' : status
  const config = statusConfig[displayStatus]
  return (
    <span
      data-testid="status-badge"
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className} ${className}`}
    >
      {config.label}
    </span>
  )
}

export default StatusBadge
