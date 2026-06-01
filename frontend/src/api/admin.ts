import apiClient from './client'
import { User, Analytics, UserPolicy, TatReport } from '../types'

export interface AdminUsersParams {
  role?: string
  isActive?: boolean
  page?: number
  limit?: number
  search?: string
}

export interface AuditLogsParams {
  page?: number
  limit?: number
  search?: string
  startDate?: string
  endDate?: string
  user?: string
  resource?: string
}

export interface AuditLog {
  id: string
  userId: string
  action: string
  resource: string
  resourceId?: string
  details?: string
  ipAddress?: string
  userAgent?: string
  createdAt: string
  user?: User
}

export interface AdminUsersResponse {
  data: User[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export interface AuditLogsResponse {
  logs: AuditLog[]
  total: number
  page: number
  totalPages: number
}

export interface DashboardStats {
  totalUsers: number
  activeClaims: number
  pendingPayouts: number
  totalReimbursed: number
  claimsByStatus: Record<string, number>
  claimsByType: Record<string, number>
  recentActivity: AuditLog[]
}

export const getUsers = async (params?: AdminUsersParams): Promise<AdminUsersResponse> => {
  const response = await apiClient.get<AdminUsersResponse>('/admin/users', { params })
  return response.data
}

export const createUser = async (data: {
  firstName: string
  lastName: string
  email: string
  password: string
  role: string
}): Promise<User> => {
  const response = await apiClient.post<User>('/admin/users', data)
  return response.data
}

export const updateUser = async (
  id: string,
  data: { firstName?: string; lastName?: string; role?: string; isActive?: boolean; specialty?: string | null }
): Promise<User> => {
  const response = await apiClient.put<User>(`/admin/users/${id}`, data)
  return response.data
}

export const deactivateUser = async (id: string): Promise<User> => {
  const response = await apiClient.put<User>(`/admin/users/${id}`, { isActive: false })
  return response.data
}

export const getAuditLogs = async (params?: AuditLogsParams): Promise<AuditLogsResponse> => {
  const response = await apiClient.get<AuditLogsResponse>('/admin/audit-logs', { params })
  return response.data
}

export interface DateRangeParams {
  startDate?: string
  endDate?: string
  groupBy?: 'daily' | 'weekly' | 'monthly' | 'yearly'
}

export const getAnalytics = async (params?: DateRangeParams): Promise<Analytics> => {
  const response = await apiClient.get<Analytics>('/admin/analytics', { params })
  return response.data
}

export const getDashboardStats = async (params?: DateRangeParams): Promise<DashboardStats> => {
  const response = await apiClient.get<DashboardStats>('/admin/dashboard-stats', { params })
  return response.data
}

export const getAdjusterWorkload = async () => {
  const response = await apiClient.get('/admin/adjuster-workload')
  return response.data
}

export const getUserPolicies = async (): Promise<UserPolicy[]> => {
  const response = await apiClient.get<UserPolicy[]>('/admin/user-policies')
  return response.data
}

export const updateUserPolicyPayerOrder = async (
  id: string,
  payerOrder: 'PRIMARY' | 'SECONDARY',
): Promise<UserPolicy> => {
  const response = await apiClient.patch<UserPolicy>(`/admin/user-policies/${id}`, { payerOrder })
  return response.data
}

export const getPatientUserPolicies = async (patientId: string): Promise<UserPolicy[]> => {
  const response = await apiClient.get<UserPolicy[]>(`/users/${patientId}/user-policies`)
  return response.data
}

export const bulkAssignPolicy = async (policyId: string, userIds: string[]) => {
  const response = await apiClient.post(`/admin/policies/${policyId}/bulk-assign`, { userIds })
  return response.data
}

export interface TatReportParams {
  adjusterId?: string
  startDate?: string
  endDate?: string
  slaStatus?: 'ON_TRACK' | 'AT_RISK' | 'BREACHED'
  page?: number
  limit?: number
}

export const getTatReport = async (params?: TatReportParams): Promise<TatReport> => {
  const response = await apiClient.get<TatReport>('/admin/reports/tat', { params })
  return response.data
}

export interface SystemSettings {
  autoAssignEnabled: string
  diagnosisCodesEnabled: string
  cptCodesEnabled: string
  outOfNetworkEnabled: string
}

export const getSystemSettings = async (): Promise<SystemSettings> => {
  const response = await apiClient.get<SystemSettings>('/admin/settings')
  return response.data
}

export const updateSystemSetting = async (key: string, value: string): Promise<void> => {
  await apiClient.put(`/admin/settings/${key}`, { value })
}
