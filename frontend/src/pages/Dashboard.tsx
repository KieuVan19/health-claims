import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

import PatientDashboard from './patient/PatientDashboard'
import AdjusterDashboard from './adjuster/AdjusterDashboard'
import FinanceDashboard from './finance/FinanceDashboard'
import AdminDashboard from './admin/AdminDashboard'

const Dashboard: React.FC = () => {
  const { user } = useAuthStore()

  if (!user) return <Navigate to="/login" replace />

  switch (user.role) {
    case 'PATIENT':
      return <PatientDashboard />
    case 'ADJUSTER':
      return <AdjusterDashboard />
    case 'FINANCE_OFFICER':
      return <FinanceDashboard />
    case 'ADMIN':
      return <Navigate to="/admin/dashboard" replace />
    default:
      return <Navigate to="/login" replace />
  }
}

export default Dashboard
