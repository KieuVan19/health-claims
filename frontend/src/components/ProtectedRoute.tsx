import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { Role } from '../types'

interface ProtectedRouteProps {
  allowedRoles?: Role[]
  children?: React.ReactNode
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles, children }) => {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    const dashboardMap: Record<string, string> = {
      PATIENT: '/patient/dashboard',
      ADJUSTER: '/adjuster/dashboard',
      FINANCE_OFFICER: '/finance/dashboard',
      ADMIN: '/admin/dashboard',
    }
    return <Navigate to={dashboardMap[user.role] || '/patient/dashboard'} replace />
  }

  if (children) {
    return <>{children}</>
  }

  return <Outlet />
}

export default ProtectedRoute
