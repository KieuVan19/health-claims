import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, isAfter } from 'date-fns'
import {
  Shield,
  Calendar,
  DollarSign,
  CheckCircle,
  XCircle,
  AlertCircle,
  History,
} from 'lucide-react'
import { getPolicies } from '../../api/policies'
import { getCoverageSummary } from '../../api/users'
import { Policy, CoverageSummary } from '../../types'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import { formatCurrency } from '../../utils/formatting'


const policyTypeColors: Record<string, string> = {
  BASIC: 'bg-gray-100 text-gray-700',
  STANDARD: 'bg-blue-100 text-blue-700',
  PREMIUM: 'bg-purple-100 text-purple-700',
}

const PolicyView: React.FC = () => {
  const navigate = useNavigate()
  const [policies, setPolicies] = useState<Policy[]>([])
  const [coverageSummaries, setCoverageSummaries] = useState<CoverageSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getPolicies(),
      getCoverageSummary().catch(() => [] as CoverageSummary[]),
    ])
      .then(([pols, summaries]) => {
        const now = new Date()
        setPolicies(
          [...pols].sort((a, b) => {
            const aActive = a.isActive && isAfter(new Date(a.expiryDate), now) ? 0 : 1
            const bActive = b.isActive && isAfter(new Date(b.expiryDate), now) ? 0 : 1
            return aActive - bActive
          })
        )
        setCoverageSummaries(summaries)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (policies.length === 0) {
    return (
      <EmptyState
        icon={Shield}
        title="No policies found"
        description="You don't have any insurance policies assigned to your account yet. Please contact your administrator."
      />
    )
  }

  const now = new Date()

  // Build a map from policyId -> CoverageSummary for quick lookup
  const summaryMap = new Map<string, CoverageSummary>(
    coverageSummaries.map((s) => [s.policy.id, s])
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Policies</h1>
        <p className="text-sm text-gray-500 mt-0.5">Your insurance coverage details</p>
      </div>

      <div className="space-y-6">
        {policies.map((policy) => {
          const isActive = policy.isActive && isAfter(new Date(policy.expiryDate), now)
          const expiryDate = new Date(policy.expiryDate)
          const isExpiringSoon = isActive && (expiryDate.getTime() - now.getTime()) < 30 * 24 * 60 * 60 * 1000

          // Per-policy summary from the map (for inline coverage bar inside policy card)
          const summary = summaryMap.get(policy.id)
          const coverageLimit = policy.coverageAmount ?? policy.coverageLimit ?? 0
          const usedPct = summary && coverageLimit > 0
            ? Math.min(100, (summary.usedAmount / coverageLimit) * 100)
            : 0

          return (
            <div key={policy.id} className="card overflow-hidden" data-testid={`policy-card-${policy.id}`}>
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-5 text-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Shield className="h-5 w-5" />
                      <h2 className="text-lg font-bold" data-testid={`policy-name-value-${policy.id}`}>{policy.name}</h2>
                    </div>
                    {policy.description && (
                      <p className="text-blue-100 text-sm" data-testid={`policy-description-value-${policy.id}`}>{policy.description}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${policyTypeColors[policy.type]}`} data-testid={`policy-type-value-${policy.id}`}>
                      {policy.type}
                    </span>
                    <span className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${
                      isActive ? 'bg-green-400/20 text-green-100' : 'bg-red-400/20 text-red-100'
                    }`} data-testid={`policy-status-value-${policy.id}`}>
                      {isActive ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {isActive ? 'In Use' : 'Expired'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-5">
                {/* Expired banner inside card */}
                {summary?.isExpired && (
                  <div
                    className="mb-4 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium"
                    data-testid="expired-banner"
                  >
                    <XCircle className="h-4 w-4 flex-shrink-0" />
                    This policy has expired. Please contact your insurer to renew.
                  </div>
                )}

                {/* Expiry warning inside card */}
                {!summary?.isExpired && summary && summary.expiresInDays <= 30 && summary.expiresInDays > 0 && (
                  <div
                    className="mb-4 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700"
                    data-testid="expiry-warning"
                  >
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    Expires in {summary.expiresInDays} day{summary.expiresInDays !== 1 ? 's' : ''}. Please contact your insurer to renew.
                  </div>
                )}

                {/* Expiring-soon from local date calc (fallback when no summary) */}
                {!summary && isExpiringSoon && (
                  <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    Your policy expires soon. Please contact your insurer to renew.
                  </div>
                )}


                {/* Plan Year Accumulators — coverage bar + 3 metric cards */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <p className="text-base font-bold text-gray-800 tracking-tight">{new Date().getFullYear()} Plan Year Accumulators</p>
                  <span className="text-xs font-medium text-blue-500 bg-blue-50 border border-blue-100 rounded-full px-2.5 py-0.5">Resets annually</span>
                </div>

                {/* Coverage Limit — full-width progress bar */}
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl mb-4" data-testid={`coverage-progress-section-${policy.id}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-blue-600" />
                      <span className="text-sm font-semibold text-gray-700">Coverage Limit</span>
                    </div>
                    <span className="text-base font-bold text-gray-900" data-testid={`coverage-used-value-${policy.id}`}>
                      {summary ? (
                        <>
                          {formatCurrency(summary.usedAmount)}
                          <span className="text-sm font-normal text-gray-500"> / {formatCurrency(coverageLimit)}</span>
                        </>
                      ) : (
                        formatCurrency(coverageLimit)
                      )}
                    </span>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-3" data-testid={`coverage-progress-bar-${policy.id}`}>
                    <div
                      className={`h-3 rounded-full transition-all ${
                        usedPct >= 80 ? 'bg-red-500' : usedPct >= 50 ? 'bg-amber-500' : 'bg-blue-600'
                      }`}
                      style={{ width: `${usedPct}%` }}
                    />
                  </div>
                  <p className={`text-sm font-semibold mt-1.5 text-right ${
                    usedPct >= 80 ? 'text-red-600' : usedPct >= 50 ? 'text-amber-600' : 'text-blue-600'
                  }`} data-testid={`coverage-used-pct-${policy.id}`}>{usedPct.toFixed(1)}% used</p>
                </div>
                <div className="grid grid-cols-3 gap-4 mb-5">
                  <div className="text-center p-4 bg-gray-50 rounded-xl" data-testid={`deductible-card-${policy.id}`}>
                    <DollarSign className="h-6 w-6 text-amber-600 mx-auto mb-1" />
                    <p className="text-sm text-gray-500">Deductible</p>
                    {summary ? (
                      <p className="text-base font-bold text-gray-900" data-testid={`deductible-value-${policy.id}`}>
                        {formatCurrency(summary.deductiblePaid)}
                        <span className="text-sm font-normal text-gray-400"> / {formatCurrency(policy.deductible)}</span>
                      </p>
                    ) : (
                      <p className="text-base font-bold text-gray-900" data-testid={`deductible-value-${policy.id}`}>{formatCurrency(policy.deductible)}</p>
                    )}
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-xl" data-testid={`copay-card-${policy.id}`}>
                    <DollarSign className="h-6 w-6 text-green-600 mx-auto mb-1" />
                    <p className="text-sm text-gray-500">Copay</p>
                    <p className="text-base font-bold text-gray-900" data-testid={`copay-value-${policy.id}`}>{policy.copayPercentage ?? 0}%</p>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-xl" data-testid={`oop-card-${policy.id}`}>
                    <DollarSign className="h-6 w-6 text-purple-600 mx-auto mb-1" />
                    <p className="text-sm text-gray-500">OOP Maximum</p>
                    {summary ? (
                      <p className="text-base font-bold text-gray-900" data-testid={`oop-value-${policy.id}`}>
                        {formatCurrency(summary.oopPaid)}
                        <span className="text-sm font-normal text-gray-400"> / {formatCurrency(policy.oopMax ?? 8000)}</span>
                      </p>
                    ) : (
                      <p className="text-base font-bold text-gray-900" data-testid={`oop-value-${policy.id}`}>{formatCurrency(policy.oopMax ?? 8000)}</p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end mb-4">
                  <button
                    type="button"
                    onClick={() => navigate('/patient/policies/history')}
                    className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
                    data-testid="view-history-btn"
                  >
                    <History className="h-4 w-4" />
                    View history
                  </button>
                </div>

                {/* Dates */}
                <div className="flex flex-wrap gap-4 mb-5 pb-5 border-b border-gray-100">
                  <div className="flex items-center gap-2 text-base text-gray-600">
                    <Calendar className="h-5 w-5 text-blue-500" />
                    <span>Effective: <strong data-testid={`effective-date-value-${policy.id}`}>{format(new Date(policy.effectiveDate), 'MMM d, yyyy')}</strong></span>
                  </div>
                  <div className="flex items-center gap-2 text-base text-gray-600">
                    <Calendar className="h-5 w-5 text-red-400" />
                    <span>Expires: <strong className={isExpiringSoon ? 'text-amber-600' : ''} data-testid={`expiry-date-value-${policy.id}`}>{format(expiryDate, 'MMM d, yyyy')}</strong></span>
                  </div>
                </div>

              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default PolicyView
