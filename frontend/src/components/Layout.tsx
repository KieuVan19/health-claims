import React from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

const pageTitles: Record<string, string> = {
  '/patient/dashboard': 'Dashboard',
  '/patient/profile': 'My Profile',
  '/patient/claims': 'My Claims',
  '/patient/claims/new': 'New Claim',
  '/patient/policies': 'My Policies',
  '/adjuster/dashboard': 'Dashboard',
  '/adjuster/profile': 'My Profile',
  '/adjuster/claims': 'Claims Queue',
  '/finance/dashboard': 'Dashboard',
  '/finance/profile': 'My Profile',
  '/finance/payouts': 'Payouts',
  '/finance/reports': 'Finance Reports',
  '/finance/reports/tat': 'TAT Compliance Report',
  '/finance/overpayments': 'Overpayments',
  '/admin/dashboard': 'Admin Dashboard',
  '/admin/profile': 'My Profile',
  '/admin/users': 'User Management',
  '/admin/policies': 'Policy Management',
  '/admin/user-policies': 'User Policies',
  '/admin/providers': 'Provider Management',
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
    if (location.pathname.match(/^\/patient\/claims\/[^/]+$/)) return 'Claim Details'
    if (location.pathname.match(/^\/adjuster\/claims\/[^/]+$/)) return 'Claim Review'
    if (location.pathname.match(/^\/admin\/claims\/[^/]+$/)) return 'Claim Details'
    if (location.pathname.match(/^\/finance\/payouts\/[^/]+$/)) return 'Payout Details'
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
