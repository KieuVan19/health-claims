import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Shield } from 'lucide-react'
import { getPolicies } from '../../api/policies'
import { getCoverageSummary } from '../../api/users'
import { CoverageSummary } from '../../types'
import LoadingSpinner from '../../components/LoadingSpinner'
import { formatCurrency } from '../../utils/formatting'

interface YearSummary {
  year: number
  summaries: CoverageSummary[]
}

const PolicyHistory: React.FC = () => {
  const navigate = useNavigate()
  const [rows, setRows] = useState<YearSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPolicies()
      .then(async (policies) => {
        const currentYear = new Date().getFullYear()
        const earliestYear = policies.reduce((min, p) => {
          const y = new Date(p.effectiveDate).getFullYear()
          return y < min ? y : min
        }, currentYear)

        const pastYears: number[] = []
        for (let y = currentYear - 1; y >= earliestYear; y--) {
          pastYears.push(y)
        }

        if (pastYears.length === 0) {
          setRows([])
          return
        }

        const results = await Promise.all(
          pastYears.map(async (year) => ({
            year,
            summaries: await getCoverageSummary(year),
          }))
        )
        setRows(results)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/patient/policies')}
          className="btn-secondary"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Coverage History</h1>
          <p className="text-sm text-gray-500 mt-0.5">Past plan year accumulators by policy</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <LoadingSpinner size="lg" />
        </div>
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center text-gray-500">
          <Shield className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-700">No history yet</p>
          <p className="text-sm mt-1">Past plan year data will appear here once a full year has elapsed.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {rows.map(({ year, summaries }) => (
            <div key={year} className="card overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-5 py-3">
                <p className="text-base font-bold text-gray-800 tracking-tight">{year} Plan Year</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
                      <th className="px-5 py-3">Policy</th>
                      <th className="px-5 py-3">Coverage Used</th>
                      <th className="px-5 py-3">Reimbursed</th>
                      <th className="px-5 py-3">Deductible Paid</th>
                      <th className="px-5 py-3">OOP Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {summaries.map((s) => (
                      <tr key={s.policy.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3">
                          <p className="font-medium text-gray-900">{s.policy.name}</p>
                          <p className="text-xs text-gray-400">{s.policy.type}</p>
                        </td>
                        <td className="px-5 py-3 text-gray-700">
                          {formatCurrency(s.usedAmount)}
                          <span className="text-gray-400"> / {formatCurrency(s.policy.coverageAmount)}</span>
                        </td>
                        <td className="px-5 py-3 text-gray-700">{formatCurrency(s.reimbursedAmount)}</td>
                        <td className="px-5 py-3 text-gray-700">
                          {formatCurrency(s.deductiblePaid)}
                          <span className="text-gray-400"> / {formatCurrency(s.policy.deductible)}</span>
                        </td>
                        <td className="px-5 py-3 text-gray-700">
                          {formatCurrency(s.oopPaid)}
                          <span className="text-gray-400"> / {formatCurrency(s.policy.oopMax ?? 8000)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default PolicyHistory
