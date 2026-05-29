import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import Topbar from './Topbar'

vi.mock('../store/authStore')
import { useAuthStore } from '../store/authStore'

const mockLogout = vi.fn()

describe('Topbar Profile Menu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows Settings menu for Admin users pointing to /admin/settings', async () => {
    const mockUser = {
      id: '1',
      email: 'admin@test.com',
      firstName: 'System',
      lastName: 'Admin',
      role: 'ADMIN' as const,
      isActive: true,
      createdAt: new Date().toISOString(),
    }

    vi.mocked(useAuthStore).mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      logout: mockLogout,
      initialize: vi.fn(),
      setUser: vi.fn(),
      token: 'test-token',
      updateUser: vi.fn(),
    } as any)

    render(
      <BrowserRouter>
        <Topbar title="Admin Panel" />
      </BrowserRouter>
    )

    const menuButton = screen.getByTestId('user-menu-btn')
    await userEvent.click(menuButton)

    await waitFor(() => {
      const settingsLink = screen.getByTestId('settings-link')
      expect(settingsLink).toBeInTheDocument()
      expect(settingsLink).toHaveAttribute('href', '/admin/settings')
    })
  })

  it('hides Settings menu for Patient users', async () => {
    const mockUser = {
      id: '2',
      email: 'patient@test.com',
      firstName: 'John',
      lastName: 'Patient',
      role: 'PATIENT' as const,
      isActive: true,
      createdAt: new Date().toISOString(),
    }

    vi.mocked(useAuthStore).mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      logout: mockLogout,
      initialize: vi.fn(),
      setUser: vi.fn(),
      token: 'test-token',
      updateUser: vi.fn(),
    } as any)

    render(
      <BrowserRouter>
        <Topbar title="Patient Dashboard" />
      </BrowserRouter>
    )

    const menuButton = screen.getByTestId('user-menu-btn')
    await userEvent.click(menuButton)

    await waitFor(() => {
      expect(screen.getByTestId('profile-link')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('settings-link')).not.toBeInTheDocument()
  })

  it('hides Settings menu for Adjuster users', async () => {
    const mockUser = {
      id: '3',
      email: 'adjuster@test.com',
      firstName: 'Jane',
      lastName: 'Adjuster',
      role: 'ADJUSTER' as const,
      isActive: true,
      createdAt: new Date().toISOString(),
    }

    vi.mocked(useAuthStore).mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      logout: mockLogout,
      initialize: vi.fn(),
      setUser: vi.fn(),
      token: 'test-token',
      updateUser: vi.fn(),
    } as any)

    render(
      <BrowserRouter>
        <Topbar title="Adjuster Queue" />
      </BrowserRouter>
    )

    const menuButton = screen.getByTestId('user-menu-btn')
    await userEvent.click(menuButton)

    await waitFor(() => {
      expect(screen.getByTestId('profile-link')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('settings-link')).not.toBeInTheDocument()
  })

  it('shows My Profile for all user roles', async () => {
    const mockUser = {
      id: '4',
      email: 'finance@test.com',
      firstName: 'Jane',
      lastName: 'Finance',
      role: 'FINANCE_OFFICER' as const,
      isActive: true,
      createdAt: new Date().toISOString(),
    }

    vi.mocked(useAuthStore).mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      logout: mockLogout,
      initialize: vi.fn(),
      setUser: vi.fn(),
      token: 'test-token',
      updateUser: vi.fn(),
    } as any)

    render(
      <BrowserRouter>
        <Topbar title="Finance Dashboard" />
      </BrowserRouter>
    )

    const menuButton = screen.getByTestId('user-menu-btn')
    await userEvent.click(menuButton)

    await waitFor(() => {
      const profileLink = screen.getByTestId('profile-link')
      expect(profileLink).toBeInTheDocument()
      expect(profileLink).toHaveAttribute('href', '/profile')
    })
  })
})
