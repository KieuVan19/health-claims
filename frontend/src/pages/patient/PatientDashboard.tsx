import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  FileText,
  PlusCircle,
  Clock,
  CheckCircle,
  DollarSign,
  TrendingUp,
  Shield,
  ChevronRight,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { getClaims } from '../../api/claims'
import { getPolicies } from '../../api/policies'
import { Claim, Policy } from '../../types'
import StatCard from '../../components/StatCard'
import StatusBadge from '../../components/StatusBadge'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import { formatCurrency } from '../../utils/formatting'
import { CLAIM_TYPE_LABELS } from '../../constants/claimTypes'

const PatientDashboard: React.FC = () => {
  const { user } = useAuthStore()
  const [claims, setClaims] = useState<Claim[]>([])
  const [policies, setPolicies] = useState<Policy[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [claimsRes, policiesRes] = await Promise.all([
          getClaims({ limit: 10 }),
          getPolicies(),
        ])
        setClaims(claimsRes.data ?? [])
        setPolicies(policiesRes ?? [])
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const totalClaims = claims.length
  const pendingClaims = claims.filter((c) =>
    ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED'].includes(c.status)
  ).length
  const approvedClaims = claims.filter((c) =>
    ['APPROVED', 'PAID'].includes(c.status)
  ).length
  const totalPaid = claims
    .filter((c) => c.status === 'PAID')
    .reduce((sum, c) => sum + (c.reimbursable ?? 0), 0)

  const recentClaims = claims.slice(0, 5)
  const today = new Date()
  const inUsePolicy = policies.find(
    (p) =>
      p.isActive &&
      new Date(p.effectiveDate) <= today &&
      new Date(p.expiryDate) >= today
  )
  const expiredFallback = inUsePolicy
    ? undefined
    : policies
        .filter((p) => new Date(p.expiryDate) < today)
        .sort((a, b) => new Date(b.expiryDate).getTime() - new Date(a.expiryDate).getTime())[0]
  const displayPolicy = inUsePolicy ?? expiredFallback
  const isPolicyExpired = !inUsePolicy && !!expiredFallback

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.firstName}!
        </h1>
        <p className="text-gray-500 mt-0.5">Here's an overview of your health claims.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Claims"
          value={totalClaims}
          icon={FileText}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
        />
        <StatCard
          title="In Progress"
          value={pendingClaims}
          icon={Clock}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
        />
        <StatCard
          title="Approved"
          value={approvedClaims}
          icon={CheckCircle}
          iconColor="text-green-600"
          iconBg="bg-green-50"
        />
        <StatCard
          title="Total Paid"
          value={formatCurrency(totalPaid)}
          icon={DollarSign}
          iconColor="text-teal-600"
          iconBg="bg-teal-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Claims */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Recent Claims</h2>
            <Link
              to="/patient/claims"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              data-testid="view-all-claims-link"
            >
              View all <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {recentClaims.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No claims yet"
              description="Submit your first claim to get started"
              action={
                <Link to="/patient/claims/new" className="btn-primary text-sm">
                  <PlusCircle className="h-4 w-4" />
                  Submit a Claim
                </Link>
              }
            />
          ) : (
            <div className="divide-y divide-gray-50">
              {recentClaims.map((claim) => (
                <Link
                  key={claim.id}
                  to={`/patient/claims/${claim.id}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors group"
                  data-testid="recent-claim-row"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
                      <FileText className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{claim.claimNumber}</span>
                        <StatusBadge status={claim.status} patientView />
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {CLAIM_TYPE_LABELS[claim.type]} &bull; {format(new Date(claim.incidentDate), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {formatCurrency(claim.totalAmount)}
                      </p>
                      {claim.reimbursable !== undefined && (
                        <p className="text-xs text-green-600">
                          {formatCurrency(claim.reimbursable)} reimbursable
                        </p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Quick action */}
          <div className="card p-5 bg-gradient-to-br from-blue-600 to-blue-700 text-white">
            <TrendingUp className="h-8 w-8 mb-3 opacity-80" />
            <h3 className="font-semibold mb-1">Submit a Claim</h3>
            <p className="text-blue-100 text-sm mb-4">Start a new reimbursement request</p>
            <Link
              to="/patient/claims/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white text-blue-600 text-sm font-semibold rounded-lg hover:bg-blue-50 transition-colors"
              data-testid="quick-new-claim-btn"
            >
              <PlusCircle className="h-4 w-4" />
              New Claim
            </Link>
          </div>

          {/* Policy */}
          <div className="card p-5" data-testid="policy-card">
            <div className="flex items-center gap-2 mb-3">
              <Shield className={`h-5 w-5 ${isPolicyExpired ? 'text-gray-400' : 'text-blue-600'}`} />
              <h3 className="text-sm font-semibold text-gray-900">
                {isPolicyExpired ? 'Expired Policy' : 'In Use Policy'}
              </h3>
              {isPolicyExpired && (
                <span className="ml-auto text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                  Expired
                </span>
              )}
            </div>
            {displayPolicy ? (
              <div>
                <p className="font-medium text-gray-900">{displayPolicy.name}</p>
                <div className="mt-2 space-y-1 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span>Coverage</span>
                    <span className="font-medium">{formatCurrency(displayPolicy.coverageAmount ?? displayPolicy.coverageLimit ?? 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Deductible</span>
                    <span className="font-medium">{formatCurrency(displayPolicy.deductible)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Copay Rate</span>
                    <span className="font-medium">{displayPolicy.copayPercentage ?? 0}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Effective Date</span>
                    <span className="font-medium">{format(new Date(displayPolicy.effectiveDate), 'MMM d, yyyy')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Expiry Date</span>
                    <span className={`font-medium ${isPolicyExpired ? 'text-red-600' : ''}`}>
                      {format(new Date(displayPolicy.expiryDate), 'MMM d, yyyy')}
                    </span>
                  </div>
                </div>
                <Link
                  to="/patient/policies"
                  className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                  data-testid="view-policy-details-link"
                >
                  View details <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No policy found.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default PatientDashboard
