import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  PlusCircle,
  Shield,
  User,
  ClipboardList,
  DollarSign,
  Users,
  BookOpen,
  ScrollText,
  LogOut,
  Menu,
  X,
  Heart,
  Activity,
  UserCheck,
  Timer,
  Stethoscope,
  AlertTriangle,
  Settings,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { Role } from '../types'

interface NavItem {
  label: string
  to: string
  icon: React.ElementType
}

const navByRole: Record<Role, NavItem[]> = {
  PATIENT: [
    { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
    { label: 'My Claims', to: '/claims', icon: FileText },
    { label: 'New Claim', to: '/claims/new', icon: PlusCircle },
    { label: 'My Policies', to: '/policies', icon: Shield },
    { label: 'Profile', to: '/profile', icon: User },
  ],
  ADJUSTER: [
    { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
    { label: 'Claims Queue', to: '/adjuster/claims', icon: ClipboardList },
    { label: 'Profile', to: '/profile', icon: User },
  ],
  FINANCE_OFFICER: [
    { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
    { label: 'Payouts', to: '/finance/payouts', icon: DollarSign },
    { label: 'Overpayments', to: '/finance/overpayments', icon: AlertTriangle },
    { label: 'Finance Reports', to: '/finance/reports', icon: FileText },
    { label: 'TAT Report', to: '/admin/reports/tat', icon: Timer },
    { label: 'Profile', to: '/profile', icon: User },
  ],
  ADMIN: [
    { label: 'Dashboard', to: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Users', to: '/admin/users', icon: Users },
    { label: 'Policies', to: '/admin/policies', icon: BookOpen },
    { label: 'User Policies', to: '/admin/user-policies', icon: UserCheck },
    { label: 'Providers', to: '/admin/providers', icon: Stethoscope },
    { label: 'Adjuster Workload', to: '/admin/adjuster-workload', icon: Activity },
    { label: 'TAT Report', to: '/admin/reports/tat', icon: Timer },
    { label: 'Audit Logs', to: '/admin/audit-logs', icon: ScrollText },
    { label: 'Settings', to: '/admin/settings', icon: Settings },
    { label: 'Profile', to: '/profile', icon: User },
  ],
}

const Sidebar: React.FC = () => {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const navItems = user ? navByRole[user.role] : []

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-blue-700">
        <div className="flex-shrink-0 bg-white rounded-lg p-1.5">
          <Heart className="h-5 w-5 text-blue-600" />
        </div>
        <span className="text-lg font-bold text-white tracking-tight">HealthClaims</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-700 text-white'
                  : 'text-blue-100 hover:bg-blue-700/50 hover:text-white'
              }`
            }
            onClick={() => setMobileOpen(false)}
            data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <item.icon className="h-4 w-4 flex-shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User info + logout */}
      <div className="px-3 py-4 border-t border-blue-700">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-400 flex items-center justify-center">
            <span className="text-xs font-semibold text-white">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-xs text-blue-300 truncate">{user?.role?.replace('_', ' ')}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-blue-100 hover:bg-blue-700/50 hover:text-white transition-colors"
          data-testid="logout-btn"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile toggle button */}
      <button
        className="fixed top-4 left-4 z-50 md:hidden bg-blue-600 text-white p-2 rounded-lg shadow-lg"
        onClick={() => setMobileOpen(!mobileOpen)}
        data-testid="sidebar-mobile-toggle"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`fixed left-0 top-0 z-40 h-full w-64 bg-blue-600 transform transition-transform md:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent />
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-64 bg-blue-600 h-screen sticky top-0 flex-shrink-0">
        <SidebarContent />
      </aside>
    </>
  )
}

export default Sidebar
