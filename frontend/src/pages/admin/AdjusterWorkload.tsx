import React, { useEffect, useState } from 'react'
import { Users, TrendingUp, Clock, CheckCircle } from 'lucide-react'
import { getAdjusterWorkload } from '../../api/admin'
import { AdjusterWorkload as AdjusterWorkloadType } from '../../types'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'

const AdjusterWorkload: React.FC = () => {
  const [data, setData] = useState<AdjusterWorkloadType[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAdjusterWorkload()
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No adjuster data"
        description="No adjusters found or no claims have been assigned yet."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Adjuster Workload</h1>
        <p className="text-sm text-gray-500 mt-0.5">Current claim distribution across adjusters</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4 text-center">
          <Users className="h-6 w-6 text-blue-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900">{data.length}</p>
          <p className="text-xs text-gray-500">Adjusters</p>
        </div>
        <div className="card p-4 text-center">
          <Clock className="h-6 w-6 text-amber-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900">
            {data.reduce((s, d) => s + d.openClaims, 0)}
          </p>
          <p className="text-xs text-gray-500">Open Claims</p>
        </div>
        <div className="card p-4 text-center">
          <CheckCircle className="h-6 w-6 text-green-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900">
            {data.reduce((s, d) => s + d.closedLast30Days, 0)}
          </p>
          <p className="text-xs text-gray-500">Closed (30d)</p>
        </div>
        <div className="card p-4 text-center">
          <TrendingUp className="h-6 w-6 text-purple-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900">
            {data.length > 0
              ? Math.round(data.reduce((s, d) => s + d.approvalRate, 0) / data.length)
              : 0}%
          </p>
          <p className="text-xs text-gray-500">Avg Approval Rate</p>
        </div>
      </div>

      {/* Workload table */}
      <div className="card overflow-hidden" data-testid="workload-table">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">Adjuster</th>
                <th className="table-header">Specialty</th>
                <th className="table-header">Open Claims</th>
                <th className="table-header">Closed (30d)</th>
                <th className="table-header">Approval Rate</th>
                <th className="table-header">AVG Process Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((row) => {
                const isOverloaded = row.openClaims >= 15
                const isHigh = row.openClaims >= 8

                return (
                  <tr
                    key={row.adjuster.id}
                    className="hover:bg-gray-50 transition-colors"
                    data-testid="workload-row"
                  >
                    <td className="table-cell">
                      <p className="font-medium text-gray-900">
                        {row.adjuster.firstName} {row.adjuster.lastName}
                      </p>
                      <p className="text-xs text-gray-500">{row.adjuster.email}</p>
                    </td>
                    <td className="table-cell text-gray-700 text-sm">
                      {row.adjuster.specialty ?? <span className="text-gray-400">General</span>}
                    </td>
                    <td className="table-cell">
                      <span
                        className={`font-bold ${
                          isOverloaded
                            ? 'text-red-600'
                            : isHigh
                            ? 'text-amber-600'
                            : 'text-gray-900'
                        }`}
                      >
                        {row.openClaims}
                      </span>
                    </td>
                    <td className="table-cell text-gray-700">{row.closedLast30Days}</td>
                    <td className="table-cell">
                      <span
                        className={`font-medium ${
                          row.approvalRate >= 70
                            ? 'text-green-600'
                            : row.approvalRate >= 50
                            ? 'text-amber-600'
                            : 'text-red-600'
                        }`}
                      >
                        {Math.round(row.approvalRate)}%
                      </span>
                    </td>
                    <td className="table-cell text-gray-700">
                      {row.avgProcessingHours != null ? `${row.avgProcessingHours}h` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default AdjusterWorkload
