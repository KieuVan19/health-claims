import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const Dashboard: React.FC = () => {
  const { user } = useAuthStore()

  if (!user) return <Navigate to="/login" replace />

  switch (user.role) {
    case 'PATIENT':
      return <Navigate to="/patient/dashboard" replace />
    case 'ADJUSTER':
      return <Navigate to="/adjuster/dashboard" replace />
    case 'FINANCE_OFFICER':
      return <Navigate to="/finance/dashboard" replace />
    case 'ADMIN':
      return <Navigate to="/admin/dashboard" replace />
    default:
      return <Navigate to="/login" replace />
  }
}

export default Dashboard
