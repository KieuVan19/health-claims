import React, { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { useNotificationStore } from './store/notificationStore'

import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'

import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'

import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'

import PatientDashboard from './pages/patient/PatientDashboard'
import ClaimList from './pages/patient/ClaimList'
import NewClaim from './pages/patient/NewClaim'
import ClaimDetail from './pages/patient/ClaimDetail'
import EditClaim from './pages/patient/EditClaim'
import PolicyView from './pages/patient/PolicyView'
import PolicyHistory from './pages/patient/PolicyHistory'


import AdjusterDashboard from './pages/adjuster/AdjusterDashboard'
import ClaimQueue from './pages/adjuster/ClaimQueue'
import ClaimReview from './pages/adjuster/ClaimReview'

import FinanceDashboard from './pages/finance/FinanceDashboard'
import PayoutList from './pages/finance/PayoutList'
import PayoutDetail from './pages/finance/PayoutDetail'
import FinanceReports from './pages/finance/FinanceReports'
import Overpayments from './pages/finance/Overpayments'

import AdminDashboard from './pages/admin/AdminDashboard'
import UserManagement from './pages/admin/UserManagement'
import PolicyManagement from './pages/admin/PolicyManagement'
import UserPolicyManagement from './pages/admin/UserPolicyManagement'
import AuditLogs from './pages/admin/AuditLogs'
import AdjusterWorkload from './pages/admin/AdjusterWorkload'
import TatReport from './pages/admin/TatReport'
import ProviderManagement from './pages/admin/ProviderManagement'
import SystemSettings from './pages/admin/SystemSettings'

import LoadingSpinner from './components/LoadingSpinner'

function App() {
  const { initialize, isLoading, isAuthenticated, user } = useAuthStore()
  const { startPolling, stopPolling } = useNotificationStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  useEffect(() => {
    if (isAuthenticated && user?.role !== 'ADMIN') {
      startPolling()
    } else {
      stopPolling()
    }
  }, [isAuthenticated, user, startPolling, stopPolling])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <Routes>
      {/* Public auth routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />

      {/* Protected routes with layout */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          {/* Root redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/profile" element={<Profile />} />

          {/* Patient routes */}
          <Route
            path="/claims"
            element={
              <ProtectedRoute allowedRoles={['PATIENT']}>
                <ClaimList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/claims/new"
            element={
              <ProtectedRoute allowedRoles={['PATIENT']}>
                <NewClaim />
              </ProtectedRoute>
            }
          />
          <Route
            path="/claims/:id"
            element={
              <ProtectedRoute allowedRoles={['PATIENT']}>
                <ClaimDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/claims/:id/edit"
            element={
              <ProtectedRoute allowedRoles={['PATIENT']}>
                <EditClaim />
              </ProtectedRoute>
            }
          />
          <Route
            path="/policies"
            element={
              <ProtectedRoute allowedRoles={['PATIENT']}>
                <PolicyView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/policies/history"
            element={
              <ProtectedRoute allowedRoles={['PATIENT']}>
                <PolicyHistory />
              </ProtectedRoute>
            }
          />

          {/* Adjuster routes */}
          <Route
            path="/adjuster/claims"
            element={
              <ProtectedRoute allowedRoles={['ADJUSTER']}>
                <ClaimQueue />
              </ProtectedRoute>
            }
          />
          <Route
            path="/adjuster/claims/:id"
            element={
              <ProtectedRoute allowedRoles={['ADJUSTER']}>
                <ClaimReview />
              </ProtectedRoute>
            }
          />

          {/* Finance routes */}
          <Route
            path="/finance/payouts"
            element={
              <ProtectedRoute allowedRoles={['FINANCE_OFFICER']}>
                <PayoutList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/payouts/:claimId"
            element={
              <ProtectedRoute allowedRoles={['FINANCE_OFFICER']}>
                <PayoutDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/reports"
            element={
              <ProtectedRoute allowedRoles={['FINANCE_OFFICER']}>
                <FinanceReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/overpayments"
            element={
              <ProtectedRoute allowedRoles={['FINANCE_OFFICER']}>
                <Overpayments />
              </ProtectedRoute>
            }
          />

          {/* Admin routes */}
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <UserManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/policies"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <PolicyManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/audit-logs"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <AuditLogs />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/user-policies"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <UserPolicyManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/adjuster-workload"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <AdjusterWorkload />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/reports/tat"
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'FINANCE_OFFICER']}>
                <TatReport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/providers"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <ProviderManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/claims/:id"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <ClaimReview />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <SystemSettings />
              </ProtectedRoute>
            }
          />
        </Route>
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
