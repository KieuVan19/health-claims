import React from 'react'
import { format } from 'date-fns'
import { ClaimEvent } from '../types'
import {
  FileText,
  Send,
  Eye,
  HelpCircle,
  CheckCircle,
  XCircle,
  DollarSign,
  User,
  RefreshCw,
  Activity,
  AlertTriangle,
  MinusCircle,
  Scale,
} from 'lucide-react'

interface ClaimTimelineProps {
  events: ClaimEvent[]
  showStatusProgress?: boolean
  currentStatus?: string
  progressOnly?: boolean
  adjusterView?: boolean
}

const actionConfig: Record<string, { icon: React.ElementType; color: string; bgColor: string; borderColor: string }> = {
  CREATED: { icon: FileText, color: 'text-gray-600', bgColor: 'bg-gray-100', borderColor: 'border-gray-200' },
  SUBMITTED: { icon: Send, color: 'text-blue-600', bgColor: 'bg-blue-100', borderColor: 'border-blue-200' },
  ASSIGNED: { icon: User, color: 'text-purple-600', bgColor: 'bg-purple-100', borderColor: 'border-purple-200' },
  UNDER_REVIEW: { icon: Eye, color: 'text-amber-600', bgColor: 'bg-amber-100', borderColor: 'border-amber-200' },
  INFO_REQUESTED: { icon: HelpCircle, color: 'text-orange-600', bgColor: 'bg-orange-100', borderColor: 'border-orange-200' },
  INFO_RESPONDED: { icon: RefreshCw, color: 'text-blue-600', bgColor: 'bg-blue-100', borderColor: 'border-blue-200' },
  APPROVED: { icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-100', borderColor: 'border-green-200' },
  PARTIALLY_APPROVED: { icon: CheckCircle, color: 'text-lime-600', bgColor: 'bg-lime-100', borderColor: 'border-lime-200' },
  LINE_APPROVED: { icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-100', borderColor: 'border-green-200' },
  LINE_DENIED: { icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-100', borderColor: 'border-red-200' },
  LINE_REDUCED: { icon: CheckCircle, color: 'text-amber-600', bgColor: 'bg-amber-100', borderColor: 'border-amber-200' },
  REJECTED: { icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-100', borderColor: 'border-red-200' },
  PAID: { icon: DollarSign, color: 'text-teal-600', bgColor: 'bg-teal-100', borderColor: 'border-teal-200' },
  RESUBMITTED: { icon: RefreshCw, color: 'text-blue-600', bgColor: 'bg-blue-100', borderColor: 'border-blue-200' },
  WITHDRAWN: { icon: MinusCircle, color: 'text-slate-600', bgColor: 'bg-slate-100', borderColor: 'border-slate-200' },
  APPEAL_INITIATED: { icon: Scale, color: 'text-purple-600', bgColor: 'bg-purple-100', borderColor: 'border-purple-200' },
  APPEAL_RESOLVED: { icon: Scale, color: 'text-purple-600', bgColor: 'bg-purple-100', borderColor: 'border-purple-200' },
}

const actionLabel: Record<string, string> = {
  CREATED: 'Claim created as draft',
  SUBMITTED: 'Claim submitted for review',
  ASSIGNED: 'Adjuster assigned',
  UNDER_REVIEW: 'Review started',
  INFO_REQUESTED: 'Additional information requested',
  INFO_RESPONDED: 'Patient provided additional information',
  APPROVED: 'Claim approved',
  PARTIALLY_APPROVED: 'Claim partially approved',
  LINE_APPROVED: 'Line approved',
  LINE_DENIED: 'Line denied',
  LINE_REDUCED: 'Line reduced',
  REJECTED: 'Claim rejected',
  PAID: 'Payment processed',
  RESUBMITTED: 'Claim resubmitted',
  WITHDRAWN: 'Claim withdrawn by patient',
  APPEAL_INITIATED: 'Appeal initiated by patient',
  APPEAL_RESOLVED: 'Appeal resolved',
}

// Patient-facing progress steps
const progressSteps = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PAID']

const stepLabel: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  PAID: 'Paid',
}

// Adjuster-facing progress steps (includes info request cycle)
const adjusterProgressSteps = ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED', 'INFO_RESPONDED', 'APPROVED', 'PAID']

const adjusterStepLabel: Record<string, string> = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  INFO_REQUESTED: 'Info Requested',
  INFO_RESPONDED: 'Info Added',
  APPROVED: 'Approved',
  PAID: 'Paid',
}

function getProgressIndex(status: string, adjusterView = false): number {
  if (adjusterView) {
    if (status === 'PARTIALLY_APPROVED') return adjusterProgressSteps.indexOf('APPROVED')
    return adjusterProgressSteps.indexOf(status)
  }
  const idx = progressSteps.indexOf(status)
  if (status === 'INFO_REQUESTED') return 2
  if (status === 'INFO_RESPONDED') return 2
  if (status === 'PARTIALLY_APPROVED') return progressSteps.indexOf('APPROVED')
  return idx
}

const ClaimTimeline: React.FC<ClaimTimelineProps> = ({ events, showStatusProgress = false, currentStatus, progressOnly = false, adjusterView = false }) => {
  const activeSteps = adjusterView ? adjusterProgressSteps : progressSteps
  const activeLabels = adjusterView ? adjusterStepLabel : stepLabel
  const progressIdx = currentStatus ? getProgressIndex(currentStatus, adjusterView) : -1

  return (
    <div className="space-y-4">
      {/* Visual progress bar for active (non-terminal) claims */}
      {showStatusProgress && currentStatus && !['REJECTED', 'WITHDRAWN', 'APPEAL_PENDING', 'APPEAL_DENIED'].includes(currentStatus) && (
        <div className="mb-6">
          <div className="flex items-start">
            {activeSteps.map((step, i) => {
              const reached = i <= progressIdx
              const active = i === progressIdx
              return (
                <React.Fragment key={step}>
                  {i > 0 && (
                    <div className={`flex-1 h-0.5 mt-[19px] transition-colors duration-500 ${i <= progressIdx ? 'bg-blue-400' : 'bg-gray-200'}`} />
                  )}
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-300 ${
                        reached
                          ? `bg-blue-500 text-white ${active ? 'ring-[6px] ring-blue-200' : ''}`
                          : 'bg-white border-2 border-gray-300'
                      }`}
                    >
                      {reached && <span className="text-base font-bold">✓</span>}
                    </div>
                    <span className={`mt-2 text-xs font-medium whitespace-nowrap ${reached ? 'text-blue-600' : 'text-gray-400'}`}>
                      {activeLabels[step]}
                    </span>
                  </div>
                </React.Fragment>
              )
            })}
          </div>
          {currentStatus === 'INFO_REQUESTED' && (
            <div className="mt-3 flex items-center gap-2 text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
              {adjusterView ? 'Patient has been asked to provide additional information' : 'Action required — please respond to the information request below'}
            </div>
          )}
          {currentStatus === 'INFO_RESPONDED' && adjusterView && (
            <div className="mt-3 flex items-center gap-2 text-xs text-teal-600 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
              <CheckCircle className="h-3 w-3 flex-shrink-0" />
              Patient has responded — review the information and take action
            </div>
          )}
        </div>
      )}

      {/* Rejected / Withdrawn terminal banners */}
      {showStatusProgress && currentStatus === 'REJECTED' && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
          <XCircle className="h-4 w-4 flex-shrink-0" />
          This claim was rejected. You may resubmit a new claim.
        </div>
      )}
      {showStatusProgress && currentStatus === 'WITHDRAWN' && (
        <div className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 mb-4">
          <MinusCircle className="h-4 w-4 flex-shrink-0" />
          This claim was withdrawn.
        </div>
      )}
      {showStatusProgress && currentStatus === 'APPEAL_PENDING' && (
        <div className="flex items-center gap-2 text-sm text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-4 py-3 mb-4">
          <Scale className="h-4 w-4 flex-shrink-0" />
          This claim is under internal appeal review.
        </div>
      )}
      {showStatusProgress && currentStatus === 'APPEAL_DENIED' && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
          <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            Your internal appeal was denied. Under ACA §2719, you have the right to request an independent external review. Contact your state insurance commissioner within 4 months.
          </span>
        </div>
      )}

      {/* Event log */}
      {!progressOnly && (
        !events || events.length === 0 ? (
          <p className="text-sm text-gray-500 italic py-4">No activity recorded yet.</p>
        ) : (
          <div className={events.length > 5 ? 'max-h-[480px] overflow-y-auto pr-1' : undefined}>
          <ol className="relative border-l border-gray-200 ml-4 space-y-0">
            {events.map((event, index) => {
              const config = actionConfig[event.action] || { icon: Activity, color: 'text-gray-600', bgColor: 'bg-gray-100', borderColor: 'border-gray-200' }
              const Icon = config.icon
              const isLast = index === events.length - 1

              return (
                <li key={event.id} className={`ml-6 ${isLast ? 'pb-0' : 'pb-5'}`}>
                  <span className={`absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white ${config.bgColor}`}>
                    <Icon className={`h-3 w-3 ${config.color}`} />
                  </span>
                  <div className={`rounded-lg bg-gray-50 border ${config.borderColor} p-3`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {actionLabel[event.action] || event.action.replace(/_/g, ' ')}
                        </p>
                        {event.user && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            by {event.user.firstName} {event.user.lastName}
                            {event.user.role && (
                              <span className="ml-1 text-gray-400">({event.user.role.replace('_', ' ')})</span>
                            )}
                          </p>
                        )}
                      </div>
                      <time className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                        {format(new Date(event.createdAt), 'MMM d, yyyy HH:mm')}
                      </time>
                    </div>

                    {event.note && (
                      <div className="mt-2 pt-2 border-t border-gray-200">
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{event.note}</p>
                      </div>
                    )}

                    {event.fromStatus && event.toStatus && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-400">
                        <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{event.fromStatus}</span>
                        <span>→</span>
                        <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{event.toStatus}</span>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
          </div>
        )
      )}
    </div>
  )
}

export default ClaimTimeline
