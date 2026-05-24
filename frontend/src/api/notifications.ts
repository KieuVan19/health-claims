import apiClient from './client'
import { Notification } from '../types'

export const getNotifications = async (): Promise<Notification[]> => {
  const response = await apiClient.get<Notification[]>('/notifications')
  return response.data
}

export const getUnreadCount = async (): Promise<number> => {
  const response = await apiClient.get<{ count: number }>('/notifications/unread-count')
  return response.data.count
}

export const markRead = async (id: string): Promise<void> => {
  await apiClient.put(`/notifications/${id}/read`)
}

export const markAllRead = async (): Promise<void> => {
  await apiClient.put('/notifications/read-all')
}
