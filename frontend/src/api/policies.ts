import apiClient from './client'
import { Policy } from '../types'

export const getPolicies = async (): Promise<Policy[]> => {
  const response = await apiClient.get<Policy[]>('/policies')
  return response.data
}

export const getPolicy = async (id: string): Promise<Policy> => {
  const response = await apiClient.get<Policy>(`/policies/${id}`)
  return response.data
}

export const createPolicy = async (data: Partial<Policy>): Promise<Policy> => {
  const response = await apiClient.post<Policy>('/policies', data)
  return response.data
}

export const updatePolicy = async (id: string, data: Partial<Policy>): Promise<Policy> => {
  const response = await apiClient.put<Policy>(`/policies/${id}`, data)
  return response.data
}

export const deactivatePolicy = async (id: string): Promise<Policy> => {
  const response = await apiClient.put<Policy>(`/policies/${id}`, { isActive: false })
  return response.data
}

export const assignPolicy = async (policyId: string, userId: string): Promise<void> => {
  await apiClient.post(`/policies/${policyId}/assign/${userId}`)
}

export const deletePolicy = async (id: string): Promise<void> => {
  await apiClient.delete(`/policies/${id}`)
}
