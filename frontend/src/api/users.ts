import apiClient from './client'
import { User, NotificationPrefs, CoverageSummary } from '../types'

export const getProfile = async (): Promise<User> => {
  const response = await apiClient.get<User>('/users/profile')
  return response.data
}

export const updateProfile = async (data: { firstName?: string; lastName?: string }): Promise<User> => {
  const response = await apiClient.put<User>('/users/profile', data)
  return response.data
}

export const updatePassword = async (data: {
  currentPassword: string
  newPassword: string
}): Promise<void> => {
  await apiClient.put('/users/password', data)
}

export const getNotificationPrefs = async (): Promise<NotificationPrefs> => {
  const res = await apiClient.get<NotificationPrefs>('/users/notification-preferences')
  return res.data
}

export const updateNotificationPrefs = async (prefs: Partial<NotificationPrefs>): Promise<NotificationPrefs> => {
  const res = await apiClient.put<NotificationPrefs>('/users/notification-preferences', prefs)
  return res.data
}

export const exportMyData = async (): Promise<Blob> => {
  const res = await apiClient.get('/users/export-data', { responseType: 'blob' })
  return res.data
}

export const getCoverageSummary = async (year?: number): Promise<CoverageSummary[]> => {
  const res = await apiClient.get<CoverageSummary[]>('/users/coverage-summary', {
    params: year ? { year } : undefined,
  })
  return res.data
}
