import React, { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import { ScrollText, Search, X } from 'lucide-react'
import { getAuditLogs, AuditLog } from '../../api/admin'
import Pagination from '../../components/Pagination'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'

const resourceColors: Record<string, string> = {
  CLAIM: 'bg-blue-100 text-blue-700',
  USER: 'bg-purple-100 text-purple-700',
  POLICY: 'bg-green-100 text-green-700',
  PAYMENT: 'bg-teal-100 text-teal-700',
  AUTH: 'bg-gray-100 text-gray-700',
}

const actionColors: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  LOGIN: 'bg-gray-100 text-gray-700',
  LOGOUT: 'bg-gray-100 text-gray-600',
  APPROVE: 'bg-green-100 text-green-700',
  REJECT: 'bg-red-100 text-red-700',
  SUBMIT: 'bg-blue-100 text-blue-700',
  PAY: 'bg-teal-100 text-teal-700',
}

const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [resourceFilter, setResourceFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getAuditLogs({
        page,
        limit: 20,
        search: search || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        resource: resourceFilter || undefined,
      })
      setLogs(res.logs ?? [])
      setTotal(res.total ?? 0)
      setTotalPages(res.totalPages ?? 1)
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [page, search, startDate, endDate, resourceFilter])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const getActionLabel = (action: string) => {
    return action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
  }

  const getActionColor = (action: string) => {
    const key = Object.keys(actionColors).find((k) => action.toUpperCase().includes(k))
    return key ? actionColors[key] : 'bg-gray-100 text-gray-600'
  }

  const getResourceColor = (resource: string) => {
    return resourceColors[resource.toUpperCase()] ?? 'bg-gray-100 text-gray-600'
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
        <p className="text-sm text-gray-500 mt-0.5">{total} log entr{total !== 1 ? 'ies' : 'y'}</p>
      </div>

      {/* Filters */}
      <div className="card p-3">
        <form
          onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); setPage(1) }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by user, action, resource..."
              className="form-input pl-9"
              data-testid="audit-search-input"
            />
          </div>
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
            className="form-input w-40 text-sm shrink-0"
            data-testid="start-date-filter"
            title="From date"
          />
          <span className="text-gray-400 text-sm shrink-0">–</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
            className="form-input w-40 text-sm shrink-0"
            data-testid="end-date-filter"
            title="To date"
          />
          <select
            value={resourceFilter}
            onChange={(e) => { setResourceFilter(e.target.value); setPage(1) }}
            className="form-input w-36 text-sm shrink-0"
            data-testid="resource-filter"
          >
            <option value="">All Resources</option>
            <option value="CLAIM">Claim</option>
            <option value="USER">User</option>
            <option value="POLICY">Policy</option>
            <option value="PAYMENT">Payment</option>
            <option value="AUTH">Auth</option>
          </select>
          <button
            type="submit"
            title="Apply search"
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-blue-300 bg-blue-50 text-blue-500 hover:bg-blue-100 hover:text-blue-700 hover:border-blue-400 transition-colors shrink-0"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => { setSearchInput(''); setSearch(''); setStartDate(''); setEndDate(''); setResourceFilter(''); setPage(1) }}
            title="Clear filters"
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-700 hover:border-red-300 transition-colors shrink-0"
            data-testid="clear-audit-filters-btn"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48"><LoadingSpinner size="lg" /></div>
        ) : logs.length === 0 ? (
          <EmptyState icon={ScrollText} title="No audit logs found" description="No activity matches your filters" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="table-header">Timestamp</th>
                    <th className="table-header">User</th>
                    <th className="table-header">Action</th>
                    <th className="table-header">Resource</th>
                    <th className="table-header">Resource ID</th>
                    <th className="table-header">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => (
                    <React.Fragment key={log.id}>
                      <tr
                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                        data-testid={`audit-log-row-${log.id}`}
                      >
                        <td className="table-cell whitespace-nowrap text-gray-600 text-xs" data-testid={`log-timestamp-${log.id}`}>
                          {format(new Date(log.createdAt), 'MMM d, yyyy HH:mm:ss')}
                        </td>
                        <td className="table-cell">
                          {log.user ? (
                            <div>
                              <p className="text-sm font-medium text-gray-900" data-testid={`log-user-${log.id}`}>
                                {log.user.firstName} {log.user.lastName}
                              </p>
                              <p className="text-xs text-gray-500" data-testid={`log-email-${log.id}`}>{log.user.email}</p>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-sm">System</span>
                          )}
                        </td>
                        <td className="table-cell">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getActionColor(log.action)}`} data-testid={`log-action-${log.id}`}>
                            {getActionLabel(log.action)}
                          </span>
                        </td>
                        <td className="table-cell">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getResourceColor(log.resource)}`} data-testid={`log-resource-${log.id}`}>
                            {log.resource}
                          </span>
                        </td>
                        <td className="table-cell">
                          {log.resourceId ? (
                            <span className="text-xs font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded" data-testid={`log-resource-id-${log.id}`}>
                              {log.resourceId.slice(0, 8)}...
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="table-cell max-w-xs">
                          {log.details ? (
                            <p className="text-xs text-gray-600 truncate" data-testid={`log-details-${log.id}`}>{log.details}</p>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                      {expandedId === log.id && log.details && (
                        <tr>
                          <td colSpan={6} className="bg-gray-50 px-4 py-3 border-b border-gray-100">
                            <p className="text-xs font-medium text-gray-500 mb-1">Full Details:</p>
                            <pre className="text-xs text-gray-700 whitespace-pre-wrap break-all bg-white p-3 rounded border border-gray-200">
                              {log.details}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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

export default AuditLogs
