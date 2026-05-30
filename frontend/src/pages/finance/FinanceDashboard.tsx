import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  DollarSign,
  Clock,
  CheckCircle,
  TrendingUp,
  ChevronRight,
} from 'lucide-react'
import { getPendingPayouts } from '../../api/payouts'
import { useAuthStore } from '../../store/authStore'
import { Claim } from '../../types'
import StatCard from '../../components/StatCard'
import StatusBadge from '../../components/StatusBadge'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import { formatCurrency } from '../../utils/formatting'

const FinanceDashboard: React.FC = () => {
  const { user } = useAuthStore()
  const [pending, setPending] = useState<Claim[]>([])
  const [paid, setPaid] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [pendingRes, paidRes] = await Promise.all([
          getPendingPayouts({ status: 'APPROVED', limit: 10 }),
          getPendingPayouts({ status: 'PAID', limit: 10 }),
        ])
        setPending(pendingRes.data ?? [])
        setPaid(paidRes.data ?? [])
      } catch {
        setPending([])
        setPaid([])
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const totalPending = pending.reduce((sum, c) => sum + (c.adjustedAmount ?? c.reimbursable ?? 0), 0)

  const paidToday = paid.filter((c) => {
    const today = new Date().toDateString()
    return c.payout && new Date(c.payout.paidAt).toDateString() === today
  })

  const paidThisMonth = paid.filter((c) => {
    if (!c.payout) return false
    const paidDate = new Date(c.payout.paidAt)
    const now = new Date()
    return paidDate.getMonth() === now.getMonth() && paidDate.getFullYear() === now.getFullYear()
  })

  const totalPaidThisMonth = paidThisMonth.reduce(
    (sum, c) => sum + (c.payout?.amount ?? c.reimbursable ?? 0),
    0
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Finance Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Welcome back, {user?.firstName}!</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Pending Payouts"
          value={pending.length}
          icon={Clock}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
        />
        <StatCard
          title="Processed Today"
          value={paidToday.length}
          icon={CheckCircle}
          iconColor="text-green-600"
          iconBg="bg-green-50"
        />
        <StatCard
          title="Paid This Month"
          value={formatCurrency(totalPaidThisMonth)}
          icon={TrendingUp}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending payouts */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Pending Payouts</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Total: {formatCurrency(totalPending)}
              </p>
            </div>
            <Link
              to="/finance/payouts"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              View all <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {pending.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
              title="No pending payouts"
              description="All approved claims have been processed"
            />
          ) : (
            <div className="divide-y divide-gray-50">
              {pending.slice(0, 5).map((claim) => (
                <Link
                  key={claim.id}
                  to={`/finance/payouts/${claim.id}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
                  data-testid="pending-payout-row"
                >
                  <div>
                    <p className="text-sm font-medium text-blue-600 hover:underline">{claim.claimNumber}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {claim.patient
                        ? `${claim.patient.firstName} ${claim.patient.lastName}`
                        : 'Patient'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-600">
                      {formatCurrency(claim.adjustedAmount ?? claim.reimbursable ?? 0)}
                    </p>
                    <StatusBadge status={claim.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}

          {pending.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-100">
              <Link to="/finance/payouts" className="btn-primary w-full justify-center text-sm">
                <DollarSign className="h-4 w-4" />
                Process Payouts
              </Link>
            </div>
          )}
        </div>

        {/* Recent paid */}
        <div className="card">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Recent Payments</h2>
          </div>

          {paidThisMonth.length === 0 ? (
            <EmptyState
              icon={DollarSign}
              title="No payments this month"
              description="Processed payments will appear here"
            />
          ) : (
            <div className="divide-y divide-gray-50">
              {paidThisMonth.slice(0, 5).map((claim) => (
                <Link
                  key={claim.id}
                  to={`/finance/payouts/${claim.id}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
                  data-testid="recent-payment-row"
                >
                  <div>
                    <p className="text-sm font-medium text-blue-600 hover:underline">{claim.claimNumber}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {claim.payout
                        ? format(new Date(claim.payout.paidAt), 'MMM d, yyyy')
                        : '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-teal-600">
                      {formatCurrency(claim.payout?.amount ?? claim.reimbursable ?? 0)}
                    </p>
                    {claim.payout?.paymentRef && (
                      <p className="text-xs text-gray-400 font-mono">{claim.payout.paymentRef}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default FinanceDashboard
