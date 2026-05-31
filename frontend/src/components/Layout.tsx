import React from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/patient/dashboard': 'Dashboard',
  '/patient/claims': 'My Claims',
  '/patient/claims/new': 'New Claim',
  '/patient/policies': 'My Policies',
  '/profile': 'My Profile',
  '/adjuster/dashboard': 'Dashboard',
  '/adjuster/claims': 'Claims Queue',
  '/finance/dashboard': 'Dashboard',
  '/finance/payouts': 'Payouts',
  '/finance/reports': 'Finance Reports',
  '/admin/dashboard': 'Admin Dashboard',
  '/admin/users': 'User Management',
  '/admin/policies': 'Policy Management',
  '/admin/user-policies': 'User Policies',
  '/admin/audit-logs': 'Audit Logs',
  '/admin/adjuster-workload': 'Adjuster Workload',
  '/admin/reports/tat': 'TAT Compliance Report',
  '/admin/settings': 'System Settings',
}

const Layout: React.FC = () => {
  const location = useLocation()

  const getTitle = () => {
    // Check exact match
    if (pageTitles[location.pathname]) return pageTitles[location.pathname]
    // Check if it's a claims detail page
    if (location.pathname.match(/^\/patient\/claims\/[^/]+\/edit$/)) return 'Edit Claim'
    if (location.pathname.startsWith('/patient/claims/')) return 'Claim Details'
    if (location.pathname.startsWith('/adjuster/claims/')) return 'Claim Review'
    if (location.pathname.startsWith('/admin/claims/')) return 'Claim Review'
    return ''
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar title={getTitle()} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default Layout
