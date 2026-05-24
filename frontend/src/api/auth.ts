import apiClient from './client'
import { AuthResponse, User } from '../types'

export const login = async (email: string, password: string): Promise<AuthResponse> => {
  const response = await apiClient.post<AuthResponse>('/auth/login', { email, password })
  return response.data
}

export const register = async (data: {
  firstName: string
  lastName: string
  email: string
  password: string
}): Promise<AuthResponse> => {
  const response = await apiClient.post<AuthResponse>('/auth/register', data)
  return response.data
}

export const getMe = async (): Promise<User> => {
  const response = await apiClient.get<User>('/auth/me')
  return response.data
}

export const forgotPassword = async (email: string): Promise<void> => {
  await apiClient.post('/auth/forgot-password', { email })
}

export const resetPassword = async (token: string, password: string): Promise<void> => {
  await apiClient.post('/auth/reset-password', { token, password })
}

export const logout = async (): Promise<void> => {
  // JWT logout is client-side only; optionally call server endpoint
  try {
    await apiClient.post('/auth/logout')
  } catch {
    // ignore
  }
}

export const changePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
  await apiClient.put('/users/password', { currentPassword, newPassword })
}

export const updateProfile = async (data: { firstName: string; lastName: string }): Promise<User> => {
  const response = await apiClient.put<User>('/users/profile', data)
  return response.data
}
