import apiClient from './client'
import { Provider, ProviderType } from '../types'

export interface ProvidersParams {
  search?: string
  inNetwork?: boolean
  page?: number
  limit?: number
}

export interface ProvidersResponse {
  data: Provider[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export interface CreateProviderData {
  npi: string
  name: string
  providerType: ProviderType
  inNetwork: boolean
  specialty?: string
}

export interface UpdateProviderData {
  name?: string
  providerType?: ProviderType
  inNetwork?: boolean
  specialty?: string | null
}

export const getProviders = async (params?: ProvidersParams): Promise<ProvidersResponse> => {
  const response = await apiClient.get<ProvidersResponse>('/providers', { params })
  return response.data
}

export const getProvider = async (id: string): Promise<Provider> => {
  const response = await apiClient.get<Provider>(`/providers/${id}`)
  return response.data
}

export const createProvider = async (data: CreateProviderData): Promise<Provider> => {
  const response = await apiClient.post<Provider>('/providers', data)
  return response.data
}

export const updateProvider = async (id: string, data: UpdateProviderData): Promise<Provider> => {
  const response = await apiClient.put<Provider>(`/providers/${id}`, data)
  return response.data
}
