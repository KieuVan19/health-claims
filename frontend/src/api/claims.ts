import apiClient from './client'
import { Claim, ClaimTypeSummary, Document, LineAdjudicationStatus } from '../types'

export interface ClaimsParams {
  status?: string
  type?: string
  page?: number
  limit?: number
  search?: string
  unassigned?: boolean
  myAppeals?: boolean
  history?: boolean
  dateFrom?: string
  dateTo?: string
}

export interface ClaimsResponse {
  claims: Claim[]
  total: number
  page: number
  totalPages: number
}

export const getClaims = async (params?: ClaimsParams): Promise<ClaimsResponse> => {
  const response = await apiClient.get<ClaimsResponse>('/claims', { params })
  return response.data
}

export const getClaim = async (id: string): Promise<Claim> => {
  const response = await apiClient.get<Claim>(`/claims/${id}`)
  return response.data
}

export const createClaim = async (data: Partial<Claim>): Promise<Claim> => {
  const response = await apiClient.post<Claim>('/claims', data)
  return response.data
}

export const updateClaim = async (id: string, data: Partial<Claim>): Promise<Claim> => {
  const response = await apiClient.put<Claim>(`/claims/${id}`, data)
  return response.data
}

export const deleteClaim = async (id: string): Promise<void> => {
  await apiClient.delete(`/claims/${id}`)
}

export const submitClaim = async (id: string): Promise<Claim> => {
  const response = await apiClient.post<Claim>(`/claims/${id}/submit`)
  return response.data
}

export const assignClaim = async (id: string, adjusterId: string): Promise<Claim> => {
  const response = await apiClient.post<Claim>(`/claims/${id}/assign`, { adjusterId })
  return response.data
}

export const approveClaim = async (id: string, notes?: string, eligibleAmount?: number): Promise<Claim> => {
  const response = await apiClient.post<Claim>(`/claims/${id}/approve`, { notes, eligibleAmount })
  return response.data
}

export const rejectClaim = async (id: string, notes: string): Promise<Claim> => {
  const response = await apiClient.post<Claim>(`/claims/${id}/reject`, { notes })
  return response.data
}

export const requestInfo = async (id: string, message: string): Promise<Claim> => {
  const response = await apiClient.post<Claim>(`/claims/${id}/request-info`, { message })
  return response.data
}

export const respondInfo = async (claimId: string, infoRequestId: string, response: string): Promise<Claim> => {
  const res = await apiClient.post<Claim>(`/claims/${claimId}/respond-info`, { infoRequestId, response })
  return res.data
}

export const resubmitClaim = async (id: string): Promise<Claim> => {
  const response = await apiClient.post<Claim>(`/claims/${id}/resubmit`)
  return response.data
}

export const withdrawClaim = async (id: string, reason?: string): Promise<Claim> => {
  const response = await apiClient.post<Claim>(`/claims/${id}/withdraw`, { reason })
  return response.data
}

export const downloadEOB = async (id: string): Promise<Blob> => {
  const response = await apiClient.get(`/claims/${id}/eob`, { responseType: 'blob' })
  return response.data
}

export const getClaimTypeSummary = async (id: string): Promise<ClaimTypeSummary> => {
  const response = await apiClient.get<ClaimTypeSummary>(`/claims/${id}/type-summary`)
  return response.data
}

export const initiateAppeal = async (id: string, reason: string): Promise<Claim> => {
  const response = await apiClient.post<Claim>(`/claims/${id}/appeal`, { reason })
  return response.data
}

export const assignAppeal = async (id: string, adjusterId: string): Promise<Claim> => {
  const response = await apiClient.post<Claim>(`/claims/${id}/assign-appeal`, { adjusterId })
  return response.data
}

export const resolveAppeal = async (id: string, resolution: 'APPEAL_APPROVED' | 'APPEAL_DENIED', notes?: string): Promise<Claim> => {
  const response = await apiClient.post<Claim>(`/claims/${id}/resolve-appeal`, { resolution, notes })
  return response.data
}

export const overrideFilingDeadline = async (id: string, reason: string): Promise<{ message: string; claimId: string; claimNumber: string }> => {
  const response = await apiClient.post<{ message: string; claimId: string; claimNumber: string }>(
    `/claims/${id}/override-filing-deadline`,
    { reason },
  )
  return response.data
}

export const reassignClaim = async (id: string, adjusterId: string): Promise<Claim> => {
  const response = await apiClient.post<Claim>(`/claims/${id}/reassign`, { adjusterId })
  return response.data
}

export const getDocuments = async (claimId: string): Promise<Document[]> => {
  const response = await apiClient.get<Document[]>(`/documents/claims/${claimId}`)
  return response.data
}

export const enterExternalPrimaryEOB = async (
  id: string,
  data: { primaryInsurerName: string; primaryPaidAmount: number; primaryEOBDate: string },
): Promise<Claim> => {
  const response = await apiClient.put<Claim>(`/claims/${id}/cob/external-primary`, data)
  return response.data
}

export const initiateSecondaryClaim = async (
  id: string,
  data: { secondaryPolicyId: string; notes?: string },
): Promise<Claim> => {
  const response = await apiClient.post<Claim>(`/claims/${id}/cob/initiate-secondary`, data)
  return response.data
}

export const adjudicateLine = async (
  claimId: string,
  lineId: string,
  data: {
    adjudicationStatus: LineAdjudicationStatus
    allowedAmount?: number
    denialReason?: string
    adjudicatorNote?: string
  },
): Promise<Claim> => {
  const response = await apiClient.post<Claim>(`/claims/${claimId}/lines/${lineId}/adjudicate`, data)
  return response.data
}
