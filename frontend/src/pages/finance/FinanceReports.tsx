import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import { getPendingPayouts } from '../../api/payouts'
import { Claim } from '../../types'
import LoadingSpinner from '../../components/LoadingSpinner'
import StatusBadge from '../../components/StatusBadge'
import Pagination from '../../components/Pagination'
import { formatCurrency } from '../../utils/formatting'

const formatDate = (dateStr: string | undefined) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const TYPE_LABELS: Record<string, string> = {
  HOSPITALIZATION: 'Hospitalization',
  OUTPATIENT: 'Outpatient',
  DENTAL: 'Dental',
  VISION: 'Vision',
  PHARMACY: 'Pharmacy',
}

const toDateStr = (d: Date): string => d.toISOString().split('T')[0]

const getDateRange = (monthsBack: number): { from: string; to: string } => {
  const to = new Date()
  const from = new Date(to.getFullYear(), to.getMonth() - (monthsBack - 1), 1)
  return { from: toDateStr(from), to: toDateStr(to) }
}

type StatusFilter = 'PAID' | 'APPROVED'

const FinanceReports: React.FC = () => {
  const defaultRange = getDateRange(6)
  const [fromDate, setFromDate] = useState(defaultRange.from)
  const [toDate, setToDate] = useState(defaultRange.to)
  const [pendingFrom, setPendingFrom] = useState(defaultRange.from)
  const [pendingTo, setPendingTo] = useState(defaultRange.to)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('APPROVED')
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  const fetchPayouts = async (from: string, to: string, status: StatusFilter, p: number) => {
    setLoading(true)
    try {
      const dateParams = status === 'PAID' ? { from, to } : {}
      const data = await getPendingPayouts({ status, ...dateParams, page: p, limit: 20 })
      setClaims(data.data)
      setTotalPages(data.pagination.totalPages)
      setTotal(data.pagination.total)
    } catch {
      toast.error('Failed to load payouts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchPayouts(fromDate, toDate, statusFilter, page)
  }, [fromDate, toDate, statusFilter, page])

  const handleApply = () => {
    if (pendingFrom > pendingTo) {
      toast.error('"From" date must be before "To" date')
      return
    }
    setPage(1)
    setFromDate(pendingFrom)
    setToDate(pendingTo)
  }

  const handleReset = () => {
    const range = getDateRange(6)
    setPendingFrom(range.from)
    setPendingTo(range.to)
    setPage(1)
    setFromDate(range.from)
    setToDate(range.to)
  }

  const handleStatusChange = (s: StatusFilter) => {
    setStatusFilter(s)
    setPage(1)
  }

  const today = toDateStr(new Date())
  const isPaid = statusFilter === 'PAID'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Finance Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5">Search payouts by date range and status</p>
      </div>

      {/* Filter bar */}
      <div className="card p-4">
        <div className="flex items-center gap-2">
          <label className={`text-sm ${isPaid ? 'text-gray-600' : 'text-gray-300'}`} htmlFor="from-date">From</label>
          <input
            id="from-date"
            type="date"
            className="form-input py-1.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            value={pendingFrom}
            max={pendingTo}
            disabled={!isPaid}
            onChange={e => setPendingFrom(e.target.value)}
            data-testid="report-from-date"
          />
          <label className={`text-sm ${isPaid ? 'text-gray-600' : 'text-gray-300'}`} htmlFor="to-date">To</label>
          <input
            id="to-date"
            type="date"
            className="form-input py-1.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            value={pendingTo}
            min={pendingFrom}
            max={today}
            disabled={!isPaid}
            onChange={e => setPendingTo(e.target.value)}
            data-testid="report-to-date"
          />
          <label className="text-sm text-gray-600 ml-2" htmlFor="status-filter">Status</label>
          <select
            id="status-filter"
            className="form-input py-1.5 text-sm w-auto"
            value={statusFilter}
            onChange={e => handleStatusChange(e.target.value as StatusFilter)}
            data-testid="report-status-filter"
          >
            <option value="APPROVED">Pending</option>
            <option value="PAID">Paid</option>
          </select>

          <button
            className="btn-primary py-1.5 px-4 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleApply}
            disabled={!isPaid}
            data-testid="report-apply-btn"
          >
            Apply
          </button>
          <button
            className="btn-secondary py-1.5 px-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleReset}
            disabled={!isPaid}
            title="Clear filter"
            data-testid="report-reset-btn"
            aria-label="reset-filter"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">
            {statusFilter === 'PAID' ? 'Paid Payouts' : 'Pending Payouts'}
          </h2>
          {!loading && (
            <span className="text-sm text-gray-500">{total} result{total !== 1 ? 's' : ''}</span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <LoadingSpinner size="lg" />
          </div>
        ) : claims.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-10">No payouts found for this period.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider pb-3 pr-4">Claim #</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider pb-3 px-4">Patient</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider pb-3 px-4">Type</th>
                    <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider pb-3 px-4">Amount</th>
                    <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider pb-3 px-4">Reimbursable</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider pb-3 px-4">Status</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider pb-3 pl-4">
                      {statusFilter === 'PAID' ? 'Paid Date' : 'Last Updated'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {claims.map((claim) => (
                    <tr key={claim.id} className="hover:bg-gray-50 transition-colors" data-testid={`finance-report-row-${claim.id}`}>
                      <td className="py-3 pr-4 font-mono text-xs text-gray-700 whitespace-nowrap" data-testid={`report-claim-number-${claim.id}`}>
                        {claim.claimNumber}
                      </td>
                      <td className="py-3 px-4 text-gray-900 whitespace-nowrap" data-testid={`report-patient-${claim.id}`}>
                        {claim.patient
                          ? `${claim.patient.firstName} ${claim.patient.lastName}`
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-gray-600 whitespace-nowrap" data-testid={`report-type-${claim.id}`}>
                        {TYPE_LABELS[claim.type] ?? claim.type}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-700" data-testid={`report-amount-${claim.id}`}>
                        {formatCurrency(claim.totalAmount)}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-gray-900" data-testid={`report-reimbursable-${claim.id}`}>
                        {claim.reimbursable != null ? formatCurrency(claim.reimbursable) : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={claim.status} />
                      </td>
                      <td className="py-3 pl-4 text-gray-500 whitespace-nowrap" data-testid={`report-date-${claim.id}`}>
                        {statusFilter === 'PAID'
                          ? formatDate(claim.payout?.paidAt)
                          : formatDate(claim.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="mt-4">
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default FinanceReports
