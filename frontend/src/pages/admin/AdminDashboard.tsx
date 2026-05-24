import React, { useEffect, useState } from 'react'
import { format } from 'date-fns'
import {
  Users,
  DollarSign,
  TrendingUp,
  Activity,
  CalendarRange,
  Search,
  X,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from 'recharts'
import { getAnalytics, getDashboardStats, DashboardStats, DateRangeParams } from '../../api/admin'
import { Analytics } from '../../types'
import LoadingSpinner from '../../components/LoadingSpinner'

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#bfdbfe',
  SUBMITTED: '#60a5fa',
  UNDER_REVIEW: '#fbbf24',
  INFO_REQUESTED: '#fb923c',
  APPROVED: '#34d399',
  REJECTED: '#f87171',
  PAID: '#38bdf8',
}

const CHART_BLUE = '#3b82f6'
const CHART_BLUE_LIGHT = '#93c5fd'

interface StatMetricProps {
  label: string
  value: string | number
  trend?: number
}

const StatMetric: React.FC<StatMetricProps> = ({ label, value, trend }) => (
  <div>
    <p className="text-xs text-gray-400 font-medium whitespace-nowrap">{label}</p>
    <p className="mt-0.5 text-xl font-bold text-gray-900 truncate">{value}</p>
    {trend !== undefined && (
      <p className={`text-xs font-semibold mt-0.5 ${trend >= 0 ? 'text-green-500' : 'text-red-500'}`}>
        {trend >= 0 ? '+' : ''}{trend}%
      </p>
    )}
  </div>
)

const AdminDashboard: React.FC = () => {
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  // input state — what the user has typed but not yet applied
  const [inputStart, setInputStart] = useState('')
  const [inputEnd, setInputEnd] = useState('')
  // applied state — drives the actual data fetch
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [duration, setDuration] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly')

  const applyFilter = () => {
    setStartDate(inputStart)
    setEndDate(inputEnd)
  }

  const clearFilter = () => {
    setInputStart('')
    setInputEnd('')
    setStartDate('')
    setEndDate('')
  }

  const hasActiveFilter = !!(startDate || endDate)
  const hasPendingChange = inputStart !== startDate || inputEnd !== endDate

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const params: DateRangeParams = { groupBy: duration }
        if (startDate) params.startDate = startDate
        if (endDate) params.endDate = endDate
        const [analyticsData, statsData] = await Promise.all([
          getAnalytics(params),
          getDashboardStats(params),
        ])
        setAnalytics(analyticsData)
        setStats(statsData)
      } catch {
        // use empty state
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [startDate, endDate, duration])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  const byTypeData = analytics?.byType
    ? Object.entries(analytics.byType).map(([key, value]) => ({
        name: key.charAt(0) + key.slice(1).toLowerCase().replace('_', ' '),
        value: value ?? 0,
      }))
    : []

  const byStatusData = analytics?.byStatus
    ? Object.entries(analytics.byStatus).map(([key, value]) => ({
        name: key.charAt(0) + key.slice(1).toLowerCase().replace('_', ' '),
        value: value ?? 0,
        fill: STATUS_COLORS[key] ?? '#94a3b8',
      }))
    : []

  const trendData = analytics?.monthlyTrend ?? []
  const totalReimbursed = stats?.totalReimbursed !== undefined
    ? formatCurrency(stats.totalReimbursed)
    : formatCurrency(analytics?.paidAmount ?? 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">System overview and analytics</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CalendarRange className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500 font-medium">From</label>
            <input
              type="date"
              value={inputStart}
              onChange={(e) => setInputStart(e.target.value)}
              max={inputEnd || undefined}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500 font-medium">To</label>
            <input
              type="date"
              value={inputEnd}
              onChange={(e) => setInputEnd(e.target.value)}
              min={inputStart || undefined}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={applyFilter}
            title="Apply filter"
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-blue-300 bg-blue-50 text-blue-500 hover:bg-blue-100 hover:text-blue-700 hover:border-blue-400 transition-colors"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            onClick={clearFilter}
            title="Clear filter"
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-700 hover:border-red-300 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>
      </div>

      {/* Stats banner */}
      <div className="card px-6 py-5">
        <div className="flex flex-col lg:flex-row lg:items-stretch lg:divide-x lg:divide-gray-100 gap-6 lg:gap-0">

          {/* Group 1: People */}
          <div className="flex items-center gap-5 lg:pr-8">
            <div className="flex-shrink-0 w-14 h-14 bg-blue-500 rounded-2xl flex items-center justify-center shadow-lg">
              <Users className="h-7 w-7 text-white" />
            </div>
            <div className="flex gap-8">
              <StatMetric label="Total Users" value={stats?.totalUsers ?? '—'} />
              <StatMetric
                label="Active Claims"
                value={stats?.activeClaims ?? analytics?.totalClaims ?? '—'}
              />
            </div>
          </div>

          {/* Group 2: Finance */}
          <div className="flex items-center gap-5 lg:px-8">
            <div className="flex-shrink-0 w-14 h-14 bg-blue-400 rounded-2xl flex items-center justify-center shadow-lg">
              <DollarSign className="h-7 w-7 text-white" />
            </div>
            <div className="flex gap-8">
              <StatMetric label="Pending Payouts" value={stats?.pendingPayouts ?? '—'} />
              <StatMetric label="Total Reimbursed" value={totalReimbursed} />
            </div>
          </div>

          {/* Group 3: Trend summary */}
          <div className="flex items-center gap-5 lg:pl-8">
            <div className="flex-shrink-0 w-14 h-14 bg-sky-400 rounded-2xl flex items-center justify-center shadow-lg">
              <TrendingUp className="h-7 w-7 text-white" />
            </div>
            <div className="flex gap-8">
              <StatMetric label="Total Claims" value={analytics?.totalClaims ?? '—'} />
              <StatMetric label="Paid Amount" value={formatCurrency(analytics?.paidAmount ?? 0)} />
            </div>
          </div>

        </div>
      </div>

      {/* Performance Over Time */}
      <div className="card p-5">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-base font-semibold text-gray-900">Performance Over Time</h2>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className={`px-2.5 py-1 font-medium transition-colors ${
                  duration === d
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          {startDate || endDate
            ? `Claims submitted${startDate ? ` from ${startDate}` : ''}${endDate ? ` to ${endDate}` : ''}`
            : `Claims submitted — all time (${duration})`}
        </p>
        {trendData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No trend data available</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }}
                formatter={(value: number) => [value, 'Submitted Claims']}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke={CHART_BLUE}
                strokeWidth={2}
                dot={{ r: 3, fill: CHART_BLUE, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                name="Submitted Claims"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Claims by type */}
        <div className="card p-5">
          <h2 className="text-base font-semibold text-gray-900">Claims by Type</h2>
          <p className="text-xs text-gray-400 mb-4">Submissions by claim category</p>
          {byTypeData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byTypeData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }}
                />
                <Bar dataKey="value" name="Claims" radius={[6, 6, 0, 0]} fill={CHART_BLUE} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Claims by status */}
        <div className="card p-5">
          <h2 className="text-base font-semibold text-gray-900">Claims by Status</h2>
          <p className="text-xs text-gray-400 mb-4">Current claim lifecycle distribution</p>
          {byStatusData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={byStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {byStatusData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }}
                  formatter={(value: number) => [value, 'Claims']}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => <span style={{ fontSize: 11, color: '#64748b' }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recent activity */}
      {stats?.recentActivity && stats.recentActivity.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
              <Activity className="h-4 w-4 text-blue-500" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">Recent Activity</h2>
          </div>
          <div className="space-y-1">
            {stats.recentActivity.slice(0, 8).map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0"
                data-testid="audit-log-row"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 h-7 w-7 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Activity className="h-3 w-3 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-900">
                      <span className="font-medium">
                        {log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System'}
                      </span>{' '}
                      <span className="text-gray-500">{log.action.toLowerCase().replace('_', ' ')} {log.resource.toLowerCase()}</span>
                    </p>
                    {log.details && (
                      <p className="text-xs text-gray-400 truncate max-w-sm">{log.details}</p>
                    )}
                  </div>
                </div>
                <time className="text-xs text-gray-400 flex-shrink-0">
                  {format(new Date(log.createdAt), 'MMM d, HH:mm')}
                </time>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminDashboard
