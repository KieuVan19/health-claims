import React from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { Claim } from '../types'
import StatusBadge from './StatusBadge'
import { FileText, ChevronRight } from 'lucide-react'

interface ClaimCardProps {
  claim: Claim
  linkPrefix?: string
}

const claimTypeLabels: Record<string, string> = {
  HOSPITALIZATION: 'Hospitalization',
  OUTPATIENT: 'Outpatient',
  DENTAL: 'Dental',
  VISION: 'Vision',
  PHARMACY: 'Pharmacy',
}

const ClaimCard: React.FC<ClaimCardProps> = ({ claim, linkPrefix = '/patient/claims' }) => {
  return (
    <Link
      to={`${linkPrefix}/${claim.id}`}
      className="block bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-indigo-300 transition-all group"
      data-testid="claim-card"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 rounded-lg bg-indigo-50 p-2">
            <FileText className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">{claim.claimNumber}</span>
              <StatusBadge status={claim.status} />
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {claimTypeLabels[claim.type]} &middot; {format(new Date(claim.incidentDate), 'MMM d, yyyy')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-sm font-semibold text-gray-900">
              ${claim.totalAmount.toFixed(2)}
            </p>
            {claim.reimbursable !== undefined && (
              <p className="text-xs text-green-600">
                ${claim.reimbursable.toFixed(2)} reimbursable
              </p>
            )}
          </div>
          <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-indigo-500 transition-colors" />
        </div>
      </div>
      {claim.description && (
        <p className="mt-2 text-xs text-gray-500 line-clamp-2">{claim.description}</p>
      )}
    </Link>
  )
}

export default ClaimCard
