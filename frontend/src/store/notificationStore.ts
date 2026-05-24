import { create } from 'zustand'
import { Notification } from '../types'
import { getNotifications, getUnreadCount } from '../api/notifications'

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  pollingInterval: ReturnType<typeof setInterval> | null
  setNotifications: (notifications: Notification[]) => void
  setUnreadCount: (count: number) => void
  markRead: (id: string) => void
  markAllRead: () => void
  addNotification: (notification: Notification) => void
  startPolling: () => void
  stopPolling: () => void
  fetchUnreadCount: () => Promise<void>
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  pollingInterval: null,

  setNotifications: (notifications) => set({ notifications }),

  setUnreadCount: (unreadCount) => set({ unreadCount }),

  markRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),

  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0,
    })),

  addNotification: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: notification.isRead ? state.unreadCount : state.unreadCount + 1,
    })),

  fetchUnreadCount: async () => {
    try {
      const count = await getUnreadCount()
      set({ unreadCount: count })
    } catch {
      // ignore polling errors
    }
  },

  startPolling: () => {
    const { pollingInterval, fetchUnreadCount } = get()
    if (pollingInterval) return // already polling

    // Fetch immediately
    fetchUnreadCount()

    const interval = setInterval(() => {
      fetchUnreadCount()
    }, 30000) // 30 seconds

    set({ pollingInterval: interval })
  },

  stopPolling: () => {
    const { pollingInterval } = get()
    if (pollingInterval) {
      clearInterval(pollingInterval)
      set({ pollingInterval: null })
    }
  },
}))
