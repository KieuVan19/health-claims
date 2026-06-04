import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  ClipboardList,
  Clock,
  CheckCircle,
  XCircle,
  ChevronRight,
  UserCheck,
  Scale,
} from 'lucide-react'
import { getClaims, executeClaimAction } from '../../api/claims'
import { useAuthStore } from '../../store/authStore'
import { Claim } from '../../types'
import StatCard from '../../components/StatCard'
import StatusBadge from '../../components/StatusBadge'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import toast from 'react-hot-toast'
import { formatCurrency } from '../../utils/formatting'

const AdjusterDashboard: React.FC = () => {
  const { user } = useAuthStore()
  const [myClaims, setMyClaims] = useState<Claim[]>([])
  const [unassignedClaims, setUnassignedClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)
  const [assigningId, setAssigningId] = useState<string | null>(null)

  const fetchClaims = async () => {
    setLoading(true)
    try {
      const [myRes, unassignedRes] = await Promise.all([
        getClaims({ limit: 20 }),
        getClaims({ limit: 20, unassigned: true }),
      ])
      setMyClaims(myRes.data ?? [])
      setUnassignedClaims(unassignedRes.data ?? [])
    } catch {
      setMyClaims([])
      setUnassignedClaims([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchClaims()
  }, [])

  const pendingReview = myClaims.filter((c) => ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED', 'INFO_RESPONDED', 'APPEAL_PENDING'].includes(c.status))
  const approvedToday = myClaims.filter((c) => {
    if (c.status !== 'APPROVED') return false
    const today = new Date().toDateString()
    return new Date(c.updatedAt).toDateString() === today
  })
  const rejectedToday = myClaims.filter((c) => {
    if (c.status !== 'REJECTED') return false
    const today = new Date().toDateString()
    return new Date(c.updatedAt).toDateString() === today
  })

  const handleAssign = async (claimId: string, status: string) => {
    if (!user) return
    setAssigningId(claimId)
    try {
      if (status === 'APPEAL_PENDING') {
        await executeClaimAction(claimId, 'ASSIGN_APPEAL', { adjusterId: user.id }) as any
      } else {
        await executeClaimAction(claimId, 'ASSIGN', { adjusterId: user.id }) as any
      }
      toast.success('Claim assigned to you')
      fetchClaims()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Failed to assign claim')
    } finally {
      setAssigningId(null)
    }
  }

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
        <h1 className="text-2xl font-bold text-gray-900">Welcome, {user?.firstName}!</h1>
        <p className="text-sm text-gray-500 mt-0.5">Claims Adjuster Dashboard</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Assigned Claims"
          value={myClaims.length}
          icon={ClipboardList}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
        />
        <StatCard
          title="Pending Review"
          value={pendingReview.length}
          icon={Clock}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
        />
        <StatCard
          title="Approved Today"
          value={approvedToday.length}
          icon={CheckCircle}
          iconColor="text-green-600"
          iconBg="bg-green-50"
        />
        <StatCard
          title="Rejected Today"
          value={rejectedToday.length}
          icon={XCircle}
          iconColor="text-red-600"
          iconBg="bg-red-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My assigned claims */}
        <div className="card" data-testid="my-queue-card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">My Queue</h2>
            <Link
              to="/adjuster/claims"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              data-testid="view-all-queue-link"
            >
              View all <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {pendingReview.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
              title="Queue is empty"
              description="No pending claims require your review"
            />
          ) : (
            <div className="divide-y divide-gray-50">
              {pendingReview.slice(0, 5).map((claim) => (
                <Link
                  key={claim.id}
                  to={`/adjuster/claims/${claim.id}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors group"
                  data-testid="claim-row"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{claim.claimNumber}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {claim.patient
                        ? `${claim.patient.firstName} ${claim.patient.lastName}`
                        : 'Patient'}{' '}
                      &bull; {format(new Date(claim.createdAt), 'MMM d')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={claim.status} />
                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Unassigned claims */}
        <div className="card" data-testid="unassigned-claims-card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">
              Unassigned Claims
              {unassignedClaims.length > 0 && (
                <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  {unassignedClaims.length}
                </span>
              )}
            </h2>
          </div>

          {unassignedClaims.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No unassigned claims"
              description="All submitted claims have been assigned"
            />
          ) : (
            <div className="divide-y divide-gray-50">
              {unassignedClaims.slice(0, 5).map((claim) => (
                <div
                  key={claim.id}
                  className="flex items-center justify-between px-5 py-3.5"
                  data-testid="unassigned-claim-row"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{claim.claimNumber}</p>
                      {claim.status === 'APPEAL_PENDING' && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                          <Scale className="h-3 w-3" />
                          Appeal
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {claim.patient
                        ? `${claim.patient.firstName} ${claim.patient.lastName}`
                        : 'Patient'}{' '}
                      &bull; {formatCurrency(claim.totalAmount)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleAssign(claim.id, claim.status)}
                    disabled={assigningId === claim.id}
                    className="btn-secondary text-xs px-2.5 py-1.5"
                    data-testid="assign-to-me-btn"
                  >
                    <UserCheck className="h-3 w-3" />
                    {assigningId === claim.id ? 'Assigning...' : 'Assign to Me'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AdjusterDashboard
