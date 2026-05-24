import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { FileText, PlusCircle, Search, ChevronRight, X } from 'lucide-react'
import { getClaims } from '../../api/claims'
import { Claim, ClaimStatus, ClaimType } from '../../types'
import StatusBadge from '../../components/StatusBadge'
import Pagination from '../../components/Pagination'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

const claimTypeLabels: Record<ClaimType, string> = {
  HOSPITALIZATION: 'Hospitalization',
  OUTPATIENT: 'Outpatient',
  DENTAL: 'Dental',
  VISION: 'Vision',
  PHARMACY: 'Pharmacy',
}

const statusOptions: { value: string; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'INFO_REQUESTED', label: 'Info Requested' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'PAID', label: 'Paid' },
]

const typeOptions: { value: string; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'HOSPITALIZATION', label: 'Hospitalization' },
  { value: 'OUTPATIENT', label: 'Outpatient' },
  { value: 'DENTAL', label: 'Dental' },
  { value: 'VISION', label: 'Vision' },
  { value: 'PHARMACY', label: 'Pharmacy' },
]

const ClaimList: React.FC = () => {
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const fetchClaims = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getClaims({
        page,
        limit: 10,
        search: search || undefined,
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      })
      setClaims(res.claims ?? [])
      setTotal(res.total ?? 0)
      setTotalPages(res.totalPages ?? 1)
    } catch {
      setClaims([])
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter, typeFilter, dateFrom, dateTo])

  useEffect(() => {
    fetchClaims()
  }, [fetchClaims])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  const handleStatusChange = (v: string) => {
    setStatusFilter(v)
    setPage(1)
  }

  const handleTypeChange = (v: string) => {
    setTypeFilter(v)
    setPage(1)
  }

  const hasActiveFilters = !!(searchInput || search || statusFilter || typeFilter || dateFrom || dateTo)

  const handleClearFilters = () => {
    setSearchInput('')
    setSearch('')
    setStatusFilter('')
    setTypeFilter('')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Claims</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} claim{total !== 1 ? 's' : ''} total</p>
        </div>
        <Link to="/claims/new" className="btn-primary" data-testid="new-claim-btn">
          <PlusCircle className="h-4 w-4" />
          New Claim
        </Link>
      </div>

      {/* Filters */}
      <form onSubmit={handleSearch} className="card p-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search claims..."
              className="form-input pl-9"
              data-testid="claims-search-input"
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
              className="form-input text-sm w-auto"
              data-testid="date-from"
            />
            <span className="text-xs text-gray-400">–</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
              className="form-input text-sm w-auto"
              data-testid="date-to"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="form-input text-sm w-auto shrink-0"
            data-testid="status-filter"
          >
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="form-input text-sm w-auto shrink-0"
            data-testid="type-filter"
          >
            {typeOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <button type="submit" className="btn-secondary px-3 shrink-0">
            <Search className="h-4 w-4" />
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="btn-secondary px-3 shrink-0 text-gray-500 hover:text-red-500"
              title="Clear filters"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <LoadingSpinner size="lg" />
          </div>
        ) : claims.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No claims found"
            description={search || statusFilter || typeFilter ? 'Try adjusting your filters' : 'Submit your first claim to get started'}
            action={
              !search && !statusFilter && !typeFilter ? (
                <Link to="/claims/new" className="btn-primary text-sm">
                  <PlusCircle className="h-4 w-4" />
                  Submit a Claim
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="table-header">Claim #</th>
                    <th className="table-header">Type</th>
                    <th className="table-header">Status</th>
                    <th className="table-header">Incident Date</th>
                    <th className="table-header text-right">Amount</th>
                    <th className="table-header text-right">Reimbursable</th>
                    <th className="table-header"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {claims.map((claim) => (
                    <tr
                      key={claim.id}
                      className="hover:bg-gray-50 transition-colors"
                      data-testid="claim-row"
                    >
                      <td className="table-cell">
                        <Link
                          to={`/claims/${claim.id}`}
                          className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {claim.claimNumber}
                        </Link>
                      </td>
                      <td className="table-cell">{claimTypeLabels[claim.type]}</td>
                      <td className="table-cell">
                        <StatusBadge status={claim.status as ClaimStatus} patientView />
                      </td>
                      <td className="table-cell text-gray-600">
                        {format(new Date(claim.incidentDate), 'MMM d, yyyy')}
                      </td>
                      <td className="table-cell text-right font-medium">
                        {formatCurrency(claim.totalAmount)}
                      </td>
                      <td className="table-cell text-right">
                        {claim.reimbursable !== undefined ? (
                          <span className="text-green-600 font-medium">
                            {formatCurrency(claim.reimbursable)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="table-cell">
                        <Link
                          to={`/claims/${claim.id}`}
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm font-medium"
                          data-testid="view-claim-btn"
                        >
                          View <ChevronRight className="h-3 w-3" />
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
    </div>
  )
}

export default ClaimList
