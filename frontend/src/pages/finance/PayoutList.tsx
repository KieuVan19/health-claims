import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  DollarSign,
  Download,
  CheckCircle,
  Clock,
  X,
  Search,
  ChevronRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { getPendingPayouts, payClaim, batchPay, exportPayouts, BatchPayResult } from '../../api/payouts'
import { Claim } from '../../types'
import StatusBadge from '../../components/StatusBadge'
import Pagination from '../../components/Pagination'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import { formatCurrency } from '../../utils/formatting'
import { CLAIM_TYPE_LABELS } from '../../constants/claimTypes'

type Tab = 'pending' | 'paid'

const PayoutList: React.FC = () => {
  const [tab, setTab] = useState<Tab>('pending')
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [paidFrom, setPaidFrom] = useState('')
  const [paidTo, setPaidTo] = useState('')
  const [pendingPaidFrom, setPendingPaidFrom] = useState('')
  const [pendingPaidTo, setPendingPaidTo] = useState('')

  const [singleModal, setSingleModal] = useState(false)
  const [singlePaymentRef, setSinglePaymentRef] = useState('')
  const [singleNote, setSingleNote] = useState('')

  const [batchModal, setBatchModal] = useState(false)
  const [paymentRef, setPaymentRef] = useState('')
  const [batchNote, setBatchNote] = useState('')
  const [paying, setPaying] = useState(false)
  const [exporting, setExporting] = useState(false)

  const fetchClaims = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getPendingPayouts({
        page,
        limit: 10,
        status: tab === 'pending' ? 'APPROVED' : 'PAID',
        search: search || undefined,
        from: tab === 'paid' && paidFrom ? paidFrom : undefined,
        to: tab === 'paid' && paidTo ? paidTo : undefined,
      })
      setClaims(res.data ?? [])
      setTotalPages(res.pagination?.totalPages ?? 1)
      setSelectedIds(new Set())
    } catch {
      setClaims([])
    } finally {
      setLoading(false)
    }
  }, [tab, page, search, paidFrom, paidTo])

  useEffect(() => {
    fetchClaims()
  }, [fetchClaims])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSearch = () => {
    setSearch(searchInput)
    if (tab === 'paid') {
      setPaidFrom(pendingPaidFrom)
      setPaidTo(pendingPaidTo)
    }
    setPage(1)
  }

  const handleClear = () => {
    setSearchInput('')
    setSearch('')
    setPendingPaidFrom('')
    setPendingPaidTo('')
    setPaidFrom('')
    setPaidTo('')
    setPage(1)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === claims.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(claims.map((c) => c.id)))
    }
  }

  const openSinglePay = () => {
    const [id] = [...selectedIds]
    const claim = claims.find((c) => c.id === id)
    if (!claim) return
    setSinglePaymentRef(claim.claimNumber)
    setSingleNote('')
    setSingleModal(true)
  }

  const confirmSinglePay = async () => {
    const [id] = [...selectedIds]
    if (!id || !singlePaymentRef.trim()) return
    setPaying(true)
    try {
      await payClaim(id, { paymentRef: singlePaymentRef.trim(), notes: singleNote.trim() || undefined })
      toast.success('Payment processed!')
      setSingleModal(false)
      setSinglePaymentRef('')
      setSingleNote('')
      setSelectedIds(new Set())
      fetchClaims()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Failed to process payment')
    } finally {
      setPaying(false)
    }
  }

  const handleBatchPay = async () => {
    if (!paymentRef.trim() || selectedIds.size === 0) return
    setPaying(true)
    try {
      const result: BatchPayResult = await batchPay({ claimIds: [...selectedIds], paymentRef: paymentRef.trim(), notes: batchNote.trim() || undefined })
      const { processed, errors } = result
      if (errors.length === 0) {
        toast.success(`${processed.length} payment${processed.length > 1 ? 's' : ''} processed!`)
      } else if (processed.length === 0) {
        toast.error('All payments failed — no claims were paid.')
      } else {
        toast.success(`${processed.length} paid, ${errors.length} failed`)
      }
      setBatchModal(false)
      setPaymentRef('')
      setBatchNote('')
      setSelectedIds(new Set())
      fetchClaims()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Failed to process batch payment')
    } finally {
      setPaying(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await exportPayouts()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `payouts-${format(new Date(), 'yyyy-MM-dd')}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Export downloaded')
    } catch {
      toast.error('Failed to export')
    } finally {
      setExporting(false)
    }
  }

  const selectedAmount = claims
    .filter((c) => selectedIds.has(c.id))
    .reduce((sum, c) => sum + (c.adjustedAmount ?? c.reimbursable ?? 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payouts</h1>
          <p className="text-sm text-gray-500 mt-0.5">Process approved claims for payment</p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="btn-secondary"
          data-testid="export-btn"
        >
          <Download className="h-4 w-4" />
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => { setTab('pending'); setPage(1) }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'pending'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          data-testid="pending-tab"
        >
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Pending
          </span>
        </button>
        <button
          onClick={() => { setTab('paid'); setPage(1) }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'paid'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          data-testid="paid-tab"
        >
          <span className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Paid History
          </span>
        </button>
      </div>

      {/* Search + filter bar */}
      <div className="card p-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search claims..."
              className="form-input w-full pl-9"
              data-testid="payouts-search-input"
            />
          </div>

          {tab === 'paid' && (
            <>
              <label className="text-sm text-gray-600 whitespace-nowrap" htmlFor="paid-from">From</label>
              <input
                id="paid-from"
                type="date"
                className="form-input py-1.5 text-sm w-36"
                value={pendingPaidFrom}
                max={pendingPaidTo || undefined}
                onChange={e => setPendingPaidFrom(e.target.value)}
                data-testid="paid-from-input"
              />
              <label className="text-sm text-gray-600 whitespace-nowrap" htmlFor="paid-to">To</label>
              <input
                id="paid-to"
                type="date"
                className="form-input py-1.5 text-sm w-36"
                value={pendingPaidTo}
                min={pendingPaidFrom || undefined}
                onChange={e => setPendingPaidTo(e.target.value)}
                data-testid="paid-to-input"
              />
            </>
          )}

          <button className="btn-secondary px-3 flex-shrink-0" title="Search" onClick={handleSearch}>
            <Search className="h-4 w-4" />
          </button>
          <button className="btn-secondary px-3 flex-shrink-0" title="Clear" onClick={handleClear}>
            <X className="h-4 w-4" />
          </button>

          {tab === 'pending' && selectedIds.size > 0 && (
            <button
              onClick={() => selectedIds.size === 1 ? openSinglePay() : setBatchModal(true)}
              disabled={paying}
              className="btn-primary flex-shrink-0"
              data-testid="batch-pay-btn"
            >
              <DollarSign className="h-4 w-4" />
              Pay {selectedIds.size} Selected ({formatCurrency(selectedAmount)})
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <LoadingSpinner size="lg" />
          </div>
        ) : claims.length === 0 ? (
          <EmptyState
            icon={DollarSign}
            title={tab === 'pending' ? 'No pending payouts' : 'No payment history'}
            description={tab === 'pending' ? 'No approved claims awaiting payment' : 'Processed payments will appear here'}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {tab === 'pending' && (
                      <th className="table-header w-10">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === claims.length && claims.length > 0}
                          onChange={toggleSelectAll}
                          className="rounded border-gray-300 text-blue-600"
                          data-testid="select-all-checkbox"
                        />
                      </th>
                    )}
                    <th className="table-header">Claim #</th>
                    <th className="table-header">Patient</th>
                    <th className="table-header">Type</th>
                    <th className="table-header">Status</th>
                    <th className="table-header">
                      {tab === 'pending' ? 'Approved Date' : 'Payment Date'}
                    </th>
                    <th className="table-header text-right">Amount</th>
                    {tab === 'paid' && <th className="table-header">Payment Ref</th>}
                    <th className="table-header"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {claims.map((claim) => (
                    <tr
                      key={claim.id}
                      className={`hover:bg-gray-50 transition-colors ${selectedIds.has(claim.id) ? 'bg-blue-50/50' : ''}`}
                      data-testid="payout-row"
                    >
                      {tab === 'pending' && (
                        <td className="table-cell">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(claim.id)}
                            onChange={() => toggleSelect(claim.id)}
                            className="rounded border-gray-300 text-blue-600"
                            data-testid={`select-claim-${claim.id}`}
                          />
                        </td>
                      )}
                      <td className="table-cell">
                        <Link
                          to={`/finance/payouts/${claim.id}`}
                          className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                          data-testid="claim-number-link"
                        >
                          {claim.claimNumber}
                        </Link>
                      </td>
                      <td className="table-cell">
                        {claim.patient
                          ? `${claim.patient.firstName} ${claim.patient.lastName}`
                          : '—'}
                      </td>
                      <td className="table-cell">{CLAIM_TYPE_LABELS[claim.type] ?? claim.type}</td>
                      <td className="table-cell">
                        <StatusBadge status={claim.status} />
                      </td>
                      <td className="table-cell text-gray-600">
                        {tab === 'paid' && claim.payout
                          ? format(new Date(claim.payout.paidAt), 'MMM d, yyyy')
                          : format(new Date(claim.updatedAt), 'MMM d, yyyy')}
                      </td>
                      <td className="table-cell text-right font-bold text-green-600">
                        {formatCurrency(tab === 'paid' ? (claim.payout?.amount ?? 0) : (claim.adjustedAmount ?? claim.reimbursable ?? 0))}
                      </td>
                      {tab === 'paid' && (
                        <td className="table-cell text-gray-500 font-mono text-xs">
                          {claim.payout?.paymentRef ?? '—'}
                        </td>
                      )}
                      <td className="table-cell">
                        <Link
                          to={`/finance/payouts/${claim.id}`}
                          className="inline-flex items-center gap-0.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors whitespace-nowrap"
                          data-testid="view-btn"
                        >
                          View
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
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

      {/* Single-claim pay confirmation modal */}
      {singleModal && (() => {
        const [id] = [...selectedIds]
        const claim = claims.find((c) => c.id === id)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setSingleModal(false)} />
            <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
              <button
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                onClick={() => setSingleModal(false)}
              >
                <X className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
                  <DollarSign className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Confirm Payment</h3>
                  <p className="text-sm text-gray-500">
                    {claim?.claimNumber} &mdash; {formatCurrency(claim?.adjustedAmount ?? claim?.reimbursable ?? 0)}
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4 text-sm text-gray-700">
                You are about to process a payment of{' '}
                <span className="font-semibold text-green-600">
                  {formatCurrency(claim?.adjustedAmount ?? claim?.reimbursable ?? 0)}
                </span>{' '}
                to{' '}
                <span className="font-semibold">
                  {claim?.patient ? `${claim.patient.firstName} ${claim.patient.lastName}` : '—'}
                </span>
                . This action cannot be undone.
              </div>

              <div className="space-y-3">
                <div>
                  <label className="form-label">Payment Reference <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={singlePaymentRef}
                    onChange={(e) => setSinglePaymentRef(e.target.value)}
                    className="form-input"
                    placeholder="e.g. CLM-2024-001"
                    data-testid="single-payment-ref-input"
                  />
                </div>
                <div>
                  <label className="form-label">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                  <textarea
                    value={singleNote}
                    onChange={(e) => setSingleNote(e.target.value)}
                    rows={3}
                    className="form-input resize-none"
                    placeholder="Add any payment notes..."
                    data-testid="single-payment-note-input"
                  />
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-3">
                <button onClick={() => setSingleModal(false)} className="btn-secondary">Cancel</button>
                <button
                  onClick={confirmSinglePay}
                  disabled={paying || !singlePaymentRef.trim()}
                  className="btn-primary"
                  data-testid="confirm-single-pay-btn"
                >
                  <DollarSign className="h-4 w-4" />
                  {paying ? 'Processing...' : 'Confirm Payment'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Batch pay modal */}
      {batchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setBatchModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <button
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              onClick={() => setBatchModal(false)}
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Batch Payment</h3>
            <p className="text-sm text-gray-500 mb-3">
              {selectedIds.size} claim{selectedIds.size > 1 ? 's' : ''} &mdash; total {formatCurrency(selectedAmount)}
            </p>

            {/* Claim breakdown */}
            <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Claim #</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Patient</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {claims.filter((c) => selectedIds.has(c.id)).map((c) => (
                      <tr key={c.id}>
                        <td className="px-3 py-2 font-medium text-blue-600">{c.claimNumber}</td>
                        <td className="px-3 py-2 text-gray-700">
                          {c.patient ? `${c.patient.firstName} ${c.patient.lastName}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-green-600">
                          {formatCurrency(c.adjustedAmount ?? c.reimbursable ?? 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="form-label">Batch Reference <span className="text-red-500">*</span></label>
                <p className="text-xs text-gray-400 mb-1">An individual payment reference will be generated per claim.</p>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  className="form-input"
                  placeholder="e.g. BATCH-2024-001"
                  data-testid="batch-payment-ref-input"
                />
              </div>
              <div>
                <label className="form-label">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea
                  value={batchNote}
                  onChange={(e) => setBatchNote(e.target.value)}
                  rows={3}
                  className="form-input resize-none"
                  placeholder="Add any payment notes..."
                  data-testid="batch-payment-note-input"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => setBatchModal(false)} className="btn-secondary">Cancel</button>
              <button
                onClick={handleBatchPay}
                disabled={paying || !paymentRef.trim()}
                className="btn-primary"
                data-testid="confirm-batch-pay-btn"
              >
                <DollarSign className="h-4 w-4" />
                {paying ? 'Processing...' : `Pay ${selectedIds.size} Claims`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PayoutList
