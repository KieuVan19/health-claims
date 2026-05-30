import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { AlertTriangle, CheckCircle, X, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { listOverpayments, waiveOverpayment, flagOverpayment } from '../../api/overpayments'
import { Overpayment, OverpaymentStatus, OverpaymentReason } from '../../types'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import Pagination from '../../components/Pagination'
import { formatCurrency } from '../../utils/formatting'

const STATUS_LABELS: Record<OverpaymentStatus, string> = {
  IDENTIFIED: 'Identified',
  OFFSET: 'Offset',
  WAIVED: 'Waived',
}

const STATUS_COLORS: Record<OverpaymentStatus, string> = {
  IDENTIFIED: 'bg-amber-100 text-amber-800',
  OFFSET: 'bg-green-100 text-green-800',
  WAIVED: 'bg-gray-100 text-gray-600',
}

const REASON_LABELS: Record<OverpaymentReason, string> = {
  ADJUSTER_ERROR: 'Adjuster Error',
  COB_UPDATE: 'COB Update',
  POLICY_CHANGE: 'Policy Change',
}

type StatusFilter = '' | OverpaymentStatus

const Overpayments: React.FC = () => {
  const [overpayments, setOverpayments] = useState<Overpayment[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')

  // Waive modal state
  const [waiveTarget, setWaiveTarget] = useState<Overpayment | null>(null)
  const [waiverReason, setWaiverReason] = useState('')
  const [waiving, setWaiving] = useState(false)

  // Flag modal state
  const [flagModal, setFlagModal] = useState(false)
  const [flagClaimId, setFlagClaimId] = useState('')
  const [flagAmount, setFlagAmount] = useState('')
  const [flagReason, setFlagReason] = useState<OverpaymentReason>('ADJUSTER_ERROR')
  const [flagging, setFlagging] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listOverpayments({
        page,
        limit: 15,
        status: statusFilter || undefined,
      })
      setOverpayments(res.data ?? [])
      setTotalPages(res.pagination?.totalPages ?? 1)
    } catch {
      setOverpayments([])
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const openWaiveModal = (op: Overpayment) => {
    setWaiveTarget(op)
    setWaiverReason('')
  }

  const handleWaive = async () => {
    if (!waiveTarget || !waiverReason.trim()) return
    setWaiving(true)
    try {
      await waiveOverpayment(waiveTarget.id, { waiverReason: waiverReason.trim() })
      toast.success('Overpayment waived')
      setWaiveTarget(null)
      setWaiverReason('')
      fetchData()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error ?? 'Failed to waive overpayment')
    } finally {
      setWaiving(false)
    }
  }

  const handleFlag = async () => {
    const amount = parseFloat(flagAmount)
    if (!flagClaimId.trim() || isNaN(amount) || amount <= 0) {
      toast.error('Enter a valid claim ID and overpaid amount')
      return
    }
    setFlagging(true)
    try {
      await flagOverpayment(flagClaimId.trim(), { overpaidAmount: amount, reason: flagReason })
      toast.success('Overpayment flagged')
      setFlagModal(false)
      setFlagClaimId('')
      setFlagAmount('')
      setFlagReason('ADJUSTER_ERROR')
      fetchData()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error ?? 'Failed to flag overpayment')
    } finally {
      setFlagging(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Overpayments</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track and recover overpaid claims</p>
        </div>
        <button
          onClick={() => setFlagModal(true)}
          className="btn-primary"
          data-testid="flag-overpayment-btn"
        >
          <AlertTriangle className="h-4 w-4" />
          Flag Overpayment
        </button>
      </div>

      {/* Filter bar */}
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-600 whitespace-nowrap">Status</label>
          <select
            className="form-input w-44"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as StatusFilter); setPage(1) }}
            data-testid="status-filter"
          >
            <option value="">All</option>
            <option value="IDENTIFIED">Identified</option>
            <option value="OFFSET">Offset</option>
            <option value="WAIVED">Waived</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <LoadingSpinner size="lg" />
          </div>
        ) : overpayments.length === 0 ? (
          <EmptyState
            icon={CheckCircle}
            title="No overpayments"
            description="No overpayment records match the selected filter"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="table-header">Claim #</th>
                    <th className="table-header">Patient</th>
                    <th className="table-header">Reason</th>
                    <th className="table-header">Status</th>
                    <th className="table-header text-right">Overpaid Amount</th>
                    <th className="table-header">Original Payout</th>
                    <th className="table-header">Flagged On</th>
                    <th className="table-header"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {overpayments.map((op) => (
                    <tr key={op.id} className="hover:bg-gray-50 transition-colors" data-testid="overpayment-row">
                      <td className="table-cell">
                        {op.claim ? (
                          <Link
                            to={`/finance/payouts/${op.claimId}`}
                            className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {op.claim.claimNumber}
                          </Link>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="table-cell text-gray-700">
                        {op.claim?.patient
                          ? `${op.claim.patient.firstName} ${op.claim.patient.lastName}`
                          : '—'}
                      </td>
                      <td className="table-cell text-gray-600">
                        {REASON_LABELS[op.reason]}
                      </td>
                      <td className="table-cell">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[op.status]}`}>
                          {STATUS_LABELS[op.status]}
                        </span>
                      </td>
                      <td className="table-cell text-right font-semibold text-red-600">
                        {formatCurrency(op.overpaidAmount)}
                      </td>
                      <td className="table-cell font-mono text-xs text-gray-500">
                        {op.originalPayout?.paymentRef ?? '—'}
                      </td>
                      <td className="table-cell text-gray-500 text-sm">
                        {format(new Date(op.createdAt), 'MMM d, yyyy')}
                      </td>
                      <td className="table-cell">
                        {op.status === 'IDENTIFIED' && (
                          <button
                            onClick={() => openWaiveModal(op)}
                            className="text-sm text-gray-500 hover:text-red-600 transition-colors font-medium"
                            data-testid={`waive-btn-${op.id}`}
                          >
                            Waive
                          </button>
                        )}
                        {op.status === 'WAIVED' && op.waiverReason && (
                          <span className="text-xs text-gray-400 italic" title={op.waiverReason}>
                            {op.waiverReason.length > 30
                              ? `${op.waiverReason.slice(0, 30)}…`
                              : op.waiverReason}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-100">
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </>
        )}
      </div>

      {/* Waive modal */}
      {waiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setWaiveTarget(null)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <button
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              onClick={() => setWaiveTarget(null)}
            >
              <X className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                <XCircle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Waive Overpayment</h3>
                <p className="text-sm text-gray-500">
                  {waiveTarget.claim?.claimNumber} &mdash; {formatCurrency(waiveTarget.overpaidAmount)}
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              This will permanently waive the overpayment. It will no longer be recovered from
              future payouts. This action cannot be undone.
            </p>
            <div>
              <label className="form-label">
                Waiver Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={waiverReason}
                onChange={(e) => setWaiverReason(e.target.value)}
                rows={3}
                className="form-input resize-none"
                placeholder="Explain why this overpayment is being waived..."
                data-testid="waiver-reason-input"
              />
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setWaiveTarget(null)} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleWaive}
                disabled={waiving || !waiverReason.trim()}
                className="btn-primary bg-red-600 hover:bg-red-700 border-red-600 hover:border-red-700"
                data-testid="confirm-waive-btn"
              >
                {waiving ? 'Waiving…' : 'Confirm Waiver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flag overpayment modal */}
      {flagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFlagModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <button
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              onClick={() => setFlagModal(false)}
            >
              <X className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Flag Overpayment</h3>
                <p className="text-sm text-gray-500">Mark a paid claim as overpaid</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="form-label">
                  Claim ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={flagClaimId}
                  onChange={(e) => setFlagClaimId(e.target.value)}
                  className="form-input"
                  placeholder="Paste the claim ID from PayoutDetail"
                  data-testid="flag-claim-id-input"
                />
              </div>
              <div>
                <label className="form-label">
                  Overpaid Amount ($) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={flagAmount}
                  onChange={(e) => setFlagAmount(e.target.value)}
                  className="form-input"
                  placeholder="0.00"
                  data-testid="flag-amount-input"
                />
              </div>
              <div>
                <label className="form-label">Reason <span className="text-red-500">*</span></label>
                <select
                  className="form-input"
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value as OverpaymentReason)}
                  data-testid="flag-reason-select"
                >
                  <option value="ADJUSTER_ERROR">Adjuster Error</option>
                  <option value="COB_UPDATE">COB Update</option>
                  <option value="POLICY_CHANGE">Policy Change</option>
                </select>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setFlagModal(false)} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleFlag}
                disabled={flagging || !flagClaimId.trim() || !flagAmount}
                className="btn-primary"
                data-testid="confirm-flag-btn"
              >
                <AlertTriangle className="h-4 w-4" />
                {flagging ? 'Flagging…' : 'Flag Overpayment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Overpayments
