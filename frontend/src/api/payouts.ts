import apiClient from './client'
import { Claim } from '../types'

export interface PayoutsParams {
  page?: number
  limit?: number
  status?: string
  search?: string
  from?: string
  to?: string
}

export interface PayoutsResponse {
  data: Claim[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export const getPendingPayouts = async (params?: PayoutsParams): Promise<PayoutsResponse> => {
  const response = await apiClient.get<PayoutsResponse>('/payouts', { params })
  return response.data
}

export const payClaim = async (
  claimId: string,
  data: { paymentRef: string; notes?: string }
): Promise<Claim> => {
  const response = await apiClient.post<Claim>(`/payouts/${claimId}/pay`, data)
  return response.data
}

export interface BatchPayResult {
  processed: { claimId: string; claimNumber: string; amount: number; status: string }[]
  errors: { claimId: string; error: string }[]
  batchRef: string
}

export const batchPay = async (data: { claimIds: string[]; paymentRef: string; notes?: string }): Promise<BatchPayResult> => {
  const response = await apiClient.post<BatchPayResult>('/payouts/batch', data)
  return response.data
}

export const exportPayouts = async (params?: PayoutsParams): Promise<Blob> => {
  const response = await apiClient.get('/payouts/export', {
    responseType: 'blob',
    params,
  })
  return response.data
}

export interface FinanceReportsParams {
  months?: number
  from?: string
  to?: string
}

export const getPayoutDetail = async (claimId: string): Promise<Claim> => {
  const response = await apiClient.get<Claim>(`/payouts/${claimId}`)
  return response.data
}

export const getFinanceReports = async (params: FinanceReportsParams = {}) => {
  const response = await apiClient.get('/payouts/reports', { params })
  return response.data
}
