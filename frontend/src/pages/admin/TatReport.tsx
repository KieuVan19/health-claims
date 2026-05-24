import React, { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import { AlertTriangle, CheckCircle, Clock, Search } from 'lucide-react'
import { getTatReport, TatReportParams } from '../../api/admin'
import { TatReport as TatReportData, TatReportItem, SlaStatus } from '../../types'
import StatusBadge from '../../components/StatusBadge'
import Pagination from '../../components/Pagination'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'

const SLA_STATUS_LABELS: Record<SlaStatus, string> = {
  ON_TRACK: 'On Track',
  AT_RISK: 'At Risk',
  BREACHED: 'Breached',
}

const SLA_STATUS_CLASSES: Record<SlaStatus, string> = {
  ON_TRACK: 'bg-green-100 text-green-700',
  AT_RISK: 'bg-amber-100 text-amber-700',
  BREACHED: 'bg-red-100 text-red-700',
}

const SlaBadge: React.FC<{ status: SlaStatus }> = ({ status }) => (
  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded ${SLA_STATUS_CLASSES[status]}`}>
    {status === 'BREACHED' || status === 'AT_RISK' ? (
      <AlertTriangle className="h-3 w-3" />
    ) : (
      <CheckCircle className="h-3 w-3" />
    )}
    {SLA_STATUS_LABELS[status]}
  </span>
)

const SummaryCard: React.FC<{ label: string; count: number; className?: string; icon: React.ElementType }> = ({
  label,
  count,
  className = '',
  icon: Icon,
}) => (
  <div className={`card p-4 flex items-center gap-3 ${className}`}>
    <div className="flex-shrink-0">
      <Icon className="h-6 w-6" />
    </div>
    <div>
      <p className="text-2xl font-bold">{count}</p>
      <p className="text-sm opacity-80">{label}</p>
    </div>
  </div>
)

const TatReport: React.FC = () => {
  const [report, setReport] = useState<TatReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [slaFilter, setSlaFilter] = useState<SlaStatus | ''>('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [pendingStart, setPendingStart] = useState('')
  const [pendingEnd, setPendingEnd] = useState('')

  const fetchReport = useCallback(async () => {
    setLoading(true)
    try {
      const params: TatReportParams = {
        page,
        limit: 20,
        ...(slaFilter ? { slaStatus: slaFilter } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
      }
      const data = await getTatReport(params)
      setReport(data)
    } catch {
      setReport(null)
    } finally {
      setLoading(false)
    }
  }, [page, slaFilter, startDate, endDate])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  const handleApplyDates = (e: React.FormEvent) => {
    e.preventDefault()
    setStartDate(pendingStart)
    setEndDate(pendingEnd)
    setPage(1)
  }

  const handleClear = () => {
    setSlaFilter('')
    setStartDate('')
    setEndDate('')
    setPendingStart('')
    setPendingEnd('')
    setPage(1)
  }

  const hasFilters = slaFilter || startDate || endDate

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">TAT Compliance Report</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Turnaround time tracking for open claims against state-mandated thresholds
          {report?.thresholds && (
            <> — {report.thresholds.adjudicationDays}-day adjudication / {report.thresholds.ackDays}-day acknowledgement SLA</>
          )}
        </p>
      </div>

      {/* Summary cards */}
      {report?.summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            label="Total Open Claims"
            count={report.summary.total}
            icon={Clock}
            className="text-gray-700"
          />
          <SummaryCard
            label="On Track"
            count={report.summary.onTrack}
            icon={CheckCircle}
            className="text-green-700 border-green-200 bg-green-50"
          />
          <SummaryCard
            label="At Risk"
            count={report.summary.atRisk}
            icon={AlertTriangle}
            className="text-amber-700 border-amber-200 bg-amber-50"
          />
          <SummaryCard
            label="Breached"
            count={report.summary.breached}
            icon={AlertTriangle}
            className="text-red-700 border-red-200 bg-red-50"
          />
        </div>
      )}

      {/* Filters */}
      <div className="card p-4">
        <form onSubmit={handleApplyDates} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">SLA Status</label>
            <select
              value={slaFilter}
              onChange={(e) => { setSlaFilter(e.target.value as SlaStatus | ''); setPage(1) }}
              className="form-input text-sm w-auto"
              data-testid="tat-sla-filter"
            >
              <option value="">All Statuses</option>
              <option value="ON_TRACK">On Track</option>
              <option value="AT_RISK">At Risk</option>
              <option value="BREACHED">Breached</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Submitted From</label>
            <input
              type="date"
              value={pendingStart}
              onChange={(e) => setPendingStart(e.target.value)}
              className="form-input text-sm"
              data-testid="tat-start-date"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Submitted To</label>
            <input
              type="date"
              value={pendingEnd}
              onChange={(e) => setPendingEnd(e.target.value)}
              className="form-input text-sm"
              data-testid="tat-end-date"
            />
          </div>

          <button type="submit" className="btn-secondary px-3">
            <Search className="h-4 w-4" />
          </button>

          {hasFilters && (
            <button type="button" onClick={handleClear} className="btn-secondary px-3 text-sm">
              Clear
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
        ) : !report || report.items.length === 0 ? (
          <EmptyState
            icon={CheckCircle}
            title="No open claims"
            description={hasFilters ? 'No claims match your current filters' : 'All claims are resolved or no claims are in-flight'}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="table-header">Claim #</th>
                    <th className="table-header">Patient</th>
                    <th className="table-header">Adjuster</th>
                    <th className="table-header">Submitted</th>
                    <th className="table-header">Age</th>
                    <th className="table-header">Current Status</th>
                    <th className="table-header">SLA Status</th>
                    <th className="table-header">Days Until Breach</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {report.items.map((item: TatReportItem) => (
                    <tr
                      key={item.claimId}
                      className={`transition-colors ${
                        item.slaStatus === 'BREACHED' ? 'bg-red-50 hover:bg-red-100' :
                        item.slaStatus === 'AT_RISK' ? 'bg-amber-50 hover:bg-amber-100' :
                        'hover:bg-gray-50'
                      }`}
                      data-testid="tat-report-row"
                    >
                      <td className="table-cell font-medium text-blue-600">{item.claimNumber}</td>
                      <td className="table-cell">
                        {item.patient.firstName} {item.patient.lastName}
                      </td>
                      <td className="table-cell">
                        {item.adjuster
                          ? `${item.adjuster.firstName} ${item.adjuster.lastName}`
                          : <span className="text-gray-400">Unassigned</span>}
                      </td>
                      <td className="table-cell text-gray-600">
                        {format(new Date(item.submittedAt), 'MMM d, yyyy')}
                      </td>
                      <td className="table-cell">
                        <span className={`font-semibold ${
                          item.slaStatus === 'BREACHED' ? 'text-red-700' :
                          item.slaStatus === 'AT_RISK' ? 'text-amber-700' :
                          'text-gray-800'
                        }`}>
                          Day {item.ageDays}
                        </span>
                      </td>
                      <td className="table-cell">
                        <StatusBadge status={item.currentStatus} />
                      </td>
                      <td className="table-cell">
                        <SlaBadge status={item.slaStatus} />
                      </td>
                      <td className="table-cell">
                        {item.slaStatus === 'BREACHED' ? (
                          <span className="text-red-700 font-semibold text-xs">Overdue by {item.ageDays - (report.thresholds?.adjudicationDays ?? 30)}d</span>
                        ) : (
                          <span className="text-gray-600 text-xs">{item.daysUntilBreach}d</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-100">
              <Pagination
                page={page}
                totalPages={report.totalPages}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default TatReport
