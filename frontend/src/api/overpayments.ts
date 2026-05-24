import apiClient from './client'
import { Overpayment, OverpaymentsResponse, OverpaymentReason } from '../types'

export interface ListOverpaymentsParams {
  status?: string
  page?: number
  limit?: number
}

export const listOverpayments = async (
  params?: ListOverpaymentsParams,
): Promise<OverpaymentsResponse> => {
  const response = await apiClient.get<OverpaymentsResponse>('/overpayments', { params })
  return response.data
}

export const getOverpayment = async (id: string): Promise<Overpayment> => {
  const response = await apiClient.get<Overpayment>(`/overpayments/${id}`)
  return response.data
}

export const flagOverpayment = async (
  claimId: string,
  data: { overpaidAmount: number; reason: OverpaymentReason },
): Promise<Overpayment> => {
  const response = await apiClient.post<Overpayment>(`/overpayments/claim/${claimId}`, data)
  return response.data
}

export const waiveOverpayment = async (
  id: string,
  data: { waiverReason: string },
): Promise<Overpayment> => {
  const response = await apiClient.post<Overpayment>(`/overpayments/${id}/waive`, data)
  return response.data
}
