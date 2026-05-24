import { create } from 'zustand'
import { User } from '../types'
import { getMe } from '../api/auth'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  setAuth: (user: User, token: string) => void
  logout: () => void
  clearAuth: () => void
  setUser: (user: User) => void
  initialize: () => Promise<void>
}

const TOKEN_KEY = 'hc_token'

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem(TOKEN_KEY),
  isAuthenticated: false,
  isLoading: true,

  setAuth: (user: User, token: string) => {
    localStorage.setItem(TOKEN_KEY, token)
    set({ user, token, isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY)
    set({ user: null, token: null, isAuthenticated: false })
  },

  clearAuth: () => {
    localStorage.removeItem(TOKEN_KEY)
    set({ user: null, token: null, isAuthenticated: false })
  },

  setUser: (user: User) => {
    set({ user })
  },

  initialize: async () => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      set({ isLoading: false, isAuthenticated: false, user: null, token: null })
      return
    }
    try {
      const user = await getMe()
      set({ user, token, isAuthenticated: true, isLoading: false })
    } catch {
      localStorage.removeItem(TOKEN_KEY)
      set({ user: null, token: null, isAuthenticated: false, isLoading: false })
    }
  },
}))
