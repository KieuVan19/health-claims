import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ClipboardList, Search, ChevronRight, ChevronUp, ChevronDown, AlertTriangle, Scale, Clock } from 'lucide-react'
import { getClaims } from '../../api/claims'
import { Claim, ClaimStatus, ClaimType, SlaStatus } from '../../types'
import StatusBadge from '../../components/StatusBadge'
import Pagination from '../../components/Pagination'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import { formatCurrency } from '../../utils/formatting'
import { CLAIM_TYPE_LABELS } from '../../constants/claimTypes'

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'INFO_REQUESTED', label: 'Info Requested' },
  { value: 'INFO_RESPONDED', label: 'Info Added' },
  { value: 'APPEAL_PENDING', label: 'Appeal' },
]

const typeOptions = [
  { value: '', label: 'All Types' },
  { value: 'HOSPITALIZATION', label: 'Hospitalization' },
  { value: 'OUTPATIENT', label: 'Outpatient' },
  { value: 'DENTAL', label: 'Dental' },
  { value: 'VISION', label: 'Vision' },
  { value: 'PHARMACY', label: 'Pharmacy' },
]

type Tab = 'mine' | 'unassigned' | 'myAppeals' | 'history'
type SortField = 'claimNumber' | 'totalAmount' | 'createdAt'
type SortDir = 'asc' | 'desc'

const SLA_ACTIVE_STATUSES: ClaimStatus[] = ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED', 'INFO_RESPONDED']

interface SlaBadgeProps {
  claim: Claim
}

const SlaBadge: React.FC<SlaBadgeProps> = ({ claim }) => {
  if (!SLA_ACTIVE_STATUSES.includes(claim.status as ClaimStatus)) return null
  if (claim.ageDays == null) return null
  const status: SlaStatus = claim.slaStatus ?? 'ON_TRACK'
  if (status === 'BREACHED') {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700"
        data-testid="sla-badge-breached"
        title={`Day ${claim.ageDays} — SLA Breached`}
      >
        <AlertTriangle className="h-3 w-3" />
        Day {claim.ageDays} · Breached
      </span>
    )
  }
  if (status === 'AT_RISK') {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700"
        data-testid="sla-badge-at-risk"
        title={`Day ${claim.ageDays} — At Risk`}
      >
        <AlertTriangle className="h-3 w-3" />
        Day {claim.ageDays} · At Risk
      </span>
    )
  }
  return (
    <span
      className="text-xs font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500"
      data-testid="sla-badge-on-track"
      title={`Day ${claim.ageDays} — On Track`}
    >
      Day {claim.ageDays}
    </span>
  )
}

const ClaimQueue: React.FC = () => {
  const [tab, setTab] = useState<Tab>('mine')
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [sortField, setSortField] = useState<SortField>('createdAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const fetchClaims = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getClaims({
        page,
        limit: 15,
        search: search || undefined,
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        unassigned: tab === 'unassigned' ? true : undefined,
        myAppeals: tab === 'myAppeals' ? true : undefined,
        history: tab === 'history' ? true : undefined,
      })
      let sorted = [...(res.data ?? [])]
      sorted.sort((a, b) => {
        let av: string | number = a[sortField] ?? ''
        let bv: string | number = b[sortField] ?? ''
        if (typeof av === 'string') av = av.toLowerCase()
        if (typeof bv === 'string') bv = bv.toLowerCase()
        if (av < bv) return sortDir === 'asc' ? -1 : 1
        if (av > bv) return sortDir === 'asc' ? 1 : -1
        return 0
      })
      setClaims(sorted)
      setTotal(res.pagination?.total ?? 0)
      setTotalPages(res.pagination?.totalPages ?? 1)
    } catch {
      setClaims([])
    } finally {
      setLoading(false)
    }
  }, [tab, page, search, statusFilter, typeFilter, sortField, sortDir])

  useEffect(() => {
    fetchClaims()
  }, [fetchClaims])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  const handleClear = () => {
    setSearchInput('')
    setSearch('')
    setStatusFilter('')
    setTypeFilter('')
    setPage(1)
  }

  const handleTabChange = (next: Tab) => {
    setTab(next)
    setPage(1)
    setSearch('')
    setSearchInput('')
    setStatusFilter('')
    setTypeFilter('')
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronUp className="h-3 w-3 text-gray-300" />
    return sortDir === 'asc' ? (
      <ChevronUp className="h-3 w-3 text-blue-600" />
    ) : (
      <ChevronDown className="h-3 w-3 text-blue-600" />
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Claims Queue</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} claim{total !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { key: 'mine', label: 'My Claims', icon: ClipboardList },
          { key: 'unassigned', label: 'Unassigned', icon: ClipboardList },
          { key: 'myAppeals', label: 'My Appeals', icon: Scale },
          { key: 'history', label: 'History', icon: Clock },
        ] as { key: Tab; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'mine' && (
        <p className="text-sm text-gray-500">
          Claims currently assigned to you that are actively being processed.
        </p>
      )}
      {tab === 'unassigned' && (
        <p className="text-sm text-gray-500">
          Submitted claims not yet assigned to any adjudicator. Assign one to yourself to start reviewing.
        </p>
      )}
      {tab === 'myAppeals' && (
        <p className="text-sm text-gray-500">
          All appeals filed against your decisions — including those already picked up and processed by another adjudicator.
        </p>
      )}
      {tab === 'history' && (
        <p className="text-sm text-gray-500">
          Claims you have previously approved, rejected, or otherwise closed.
        </p>
      )}

      {/* Filters */}
      <div className="card p-4">
        <form onSubmit={handleSearch} className="flex gap-3 items-center w-full">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search claims..."
              className="form-input pl-9"
              data-testid="queue-search-input"
            />
          </div>

          {tab !== 'myAppeals' && tab !== 'history' && (
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
              className="form-input text-sm w-auto"
              data-testid="queue-status-filter"
            >
              {statusOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}

          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
            className="form-input text-sm w-auto"
            data-testid="queue-type-filter"
          >
            {typeOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <button type="submit" className="btn-secondary px-3">
            <Search className="h-4 w-4" />
          </button>

          {(searchInput || search || statusFilter || typeFilter) && (
            <button type="button" onClick={handleClear} className="btn-secondary px-3 text-sm">
              Clear filters
            </button>
          )}
        </form>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <LoadingSpinner size="lg" />
          </div>
        ) : claims.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No claims found"
            description="No claims match your current filters"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th
                      className="table-header cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('claimNumber')}
                    >
                      <span className="flex items-center gap-1">
                        Claim # <SortIcon field="claimNumber" />
                      </span>
                    </th>
                    <th className="table-header">Patient</th>
                    <th className="table-header">Type</th>
                    <th className="table-header">Status</th>
                    <th
                      className="table-header cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('totalAmount')}
                    >
                      <span className="flex items-center gap-1">
                        Amount <SortIcon field="totalAmount" />
                      </span>
                    </th>
                    <th className="table-header">Reimbursable</th>
                    <th
                      className="table-header cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('createdAt')}
                    >
                      <span className="flex items-center gap-1">
                        Submitted <SortIcon field="createdAt" />
                      </span>
                    </th>
                    <th className="table-header"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {claims.map((claim) => (
                    <tr key={claim.id} className="hover:bg-gray-50 transition-colors" data-testid="queue-claim-row">
                      <td className="table-cell">
                        <Link
                          to={`/adjuster/claims/${claim.id}`}
                          className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {claim.claimNumber}
                        </Link>
                      </td>
                      <td className="table-cell">
                        {claim.patient
                          ? `${claim.patient.firstName} ${claim.patient.lastName}`
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="table-cell">{CLAIM_TYPE_LABELS[claim.type]}</td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusBadge status={claim.status as ClaimStatus} />
                          <SlaBadge claim={claim} />
                        </div>
                      </td>
                      <td className="table-cell font-medium">{formatCurrency(claim.totalAmount)}</td>
                      <td className="table-cell">
                        {claim.reimbursable !== undefined ? (
                          <span className="text-green-600 font-medium">{formatCurrency(claim.reimbursable)}</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="table-cell text-gray-600">
                        {format(new Date(claim.createdAt), 'MMM d, yyyy')}
                      </td>
                      <td className="table-cell">
                        <Link
                          to={`/adjuster/claims/${claim.id}`}
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm font-medium"
                          data-testid="review-claim-btn"
                        >
                          Review <ChevronRight className="h-3 w-3" />
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

export default ClaimQueue
