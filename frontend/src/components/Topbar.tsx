import React, { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, User, LogOut, Settings } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import NotificationBell from './NotificationBell'

interface TopbarProps {
  title?: string
}

const Topbar: React.FC<TopbarProps> = ({ title }) => {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const roleLabels: Record<string, string> = {
    PATIENT: 'Patient',
    ADJUSTER: 'Claims Adjuster',
    FINANCE_OFFICER: 'Finance Officer',
    ADMIN: 'Administrator',
  }

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 h-16 flex items-center px-4 md:px-6 gap-4">
      {/* Mobile padding for hamburger */}
      <div className="md:hidden w-10" />

      {title && (
        <h1 className="text-lg font-semibold text-gray-900 flex-1 truncate">{title}</h1>
      )}
      {!title && <div className="flex-1" />}

      <div className="flex items-center gap-2">
{user?.role !== 'ADMIN' && <NotificationBell />}

        {/* User menu */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((p) => !p)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            data-testid="user-menu-btn"
          >
            <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-white">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </span>
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-gray-900 leading-none">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {user?.role ? roleLabels[user.role] : ''}
              </p>
            </div>
            <ChevronDown className="h-4 w-4 text-gray-500 hidden sm:block" />
          </button>

          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-xl border border-gray-200 z-20 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                </div>
                <div className="py-1">
                  <Link
                    to="/profile"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    data-testid="profile-link"
                  >
                    <User className="h-4 w-4" />
                    My Profile
                  </Link>
                  {user?.role === 'ADMIN' && (
                    <Link
                      to="/admin/settings"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      data-testid="settings-link"
                    >
                      <Settings className="h-4 w-4" />
                      Settings
                    </Link>
                  )}
                </div>
                <div className="border-t border-gray-100 py-1">
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    data-testid="topbar-logout-btn"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

export default Topbar
