import React, { useEffect, useRef, useState } from 'react'
import { Bell, Check, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { useNotificationStore } from '../store/notificationStore'
import { getNotifications, markAllRead, markRead } from '../api/notifications'
import toast from 'react-hot-toast'

const NotificationBell: React.FC = () => {
  const { notifications, unreadCount, setNotifications, markRead: markReadStore, markAllRead: markAllReadStore } =
    useNotificationStore()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleOpen = async () => {
    setOpen((prev) => !prev)
    if (!open) {
      try {
        const data = await getNotifications()
        setNotifications(data)
      } catch {
        // ignore
      }
    }
  }

  const handleMarkAllRead = async () => {
    setLoading(true)
    try {
      await markAllRead()
      markAllReadStore()
    } catch {
      toast.error('Failed to mark notifications as read')
    } finally {
      setLoading(false)
    }
  }

  const handleMarkOne = async (id: string) => {
    try {
      await markRead(id)
      markReadStore(id)
    } catch {
      // ignore
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleOpen}
        className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        data-testid="notification-bell"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 text-xs font-bold bg-red-500 text-white rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={loading}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                data-testid="mark-all-read-btn"
              >
                <Check className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No notifications yet</p>
              </div>
            ) : (
              notifications.slice(0, 10).map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 hover:bg-gray-50 transition-colors ${!n.isRead ? 'bg-blue-50/50' : ''}`}
                  data-testid="notification-item"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${!n.isRead ? 'text-gray-900' : 'text-gray-600'}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {format(new Date(n.createdAt), 'MMM d, h:mm a')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {n.link && (
                        <Link
                          to={n.link}
                          onClick={() => { setOpen(false); handleMarkOne(n.id) }}
                          className="text-blue-500 hover:text-blue-700"
                          aria-label="view-notification"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                      {!n.isRead && (
                        <button
                          onClick={() => handleMarkOne(n.id)}
                          className="text-gray-400 hover:text-green-500"
                          title="Mark as read"
                          aria-label="mark-notification-read"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell
