import React from 'react'
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  iconColor?: string
  iconBg?: string
  trend?: {
    value: number
    label?: string
  }
  className?: string
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon: Icon,
  trend,
  className = '',
}) => {
  return (
    <div className={`card p-5 ${className}`} data-testid="stat-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 truncate">{value}</p>
        </div>
        <div className="flex-shrink-0 bg-gray-800 rounded-xl p-3 shadow-lg">
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
      {trend && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-1.5 text-xs">
          <span className={`font-bold ${trend.value >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {trend.value >= 0 ? '+' : ''}{Math.abs(trend.value)}%
          </span>
          {trend.label && <span className="text-gray-400">{trend.label}</span>}
        </div>
      )}
    </div>
  )
}

export default StatCard
