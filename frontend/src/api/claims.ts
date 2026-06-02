import apiClient from './client'
import { Claim, ClaimTypeSummary, Document } from '../types'

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

export interface PaginationMeta {
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface ClaimsResponse {
  data: Claim[]
  pagination: PaginationMeta
}

// ─── Read Operations ────────────────────────────────────────────────────────

export const getClaims = async (params?: ClaimsParams): Promise<ClaimsResponse> => {
  const response = await apiClient.get<ClaimsResponse>('/claims', { params })
  return response.data
}

export const getClaim = async (id: string): Promise<Claim> => {
  const response = await apiClient.get<Claim>(`/claims/${id}`)
  return response.data
}

export const getClaimTypeSummary = async (id: string): Promise<ClaimTypeSummary> => {
  const response = await apiClient.get<ClaimTypeSummary>(`/claims/${id}/type-summary`)
  return response.data
}

export const getDocuments = async (claimId: string): Promise<Document[]> => {
  const response = await apiClient.get<Document[]>(`/documents?claimId=${claimId}`)
  return response.data
}

export const downloadEOB = async (id: string): Promise<Blob> => {
  const response = await apiClient.get(`/claims/${id}/eob`, { responseType: 'blob' })
  return response.data
}

// ─── Write Operations (CRUD) ────────────────────────────────────────────────

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

// ─── Unified Action Dispatcher ──────────────────────────────────────────────

type ClaimActionPayload = Record<string, unknown>

interface ClaimActionRequest {
  action: string
  payload?: ClaimActionPayload
}

/**
 * Execute a claim action using the unified dispatcher endpoint.
 * Supports all claim actions: SUBMIT, WITHDRAW, ASSIGN, APPROVE, REJECT, REQUEST_INFO, RESPOND_INFO,
 * RESUBMIT, OVERRIDE_FILING_DEADLINE, APPEAL, ASSIGN_APPEAL, RESOLVE_APPEAL, EXTERNAL_PRIMARY,
 * INITIATE_SECONDARY, REASSIGN, ADJUDICATE_LINE.
 */
export const executeClaimAction = async (
  claimId: string,
  action: string,
  payload?: ClaimActionPayload,
): Promise<Claim | { message: string; claimId: string; claimNumber: string }> => {
  const request: ClaimActionRequest = { action }
  if (payload !== undefined) {
    request.payload = payload
  }
  const response = await apiClient.post<Claim | { message: string; claimId: string; claimNumber: string }>(
    `/claims/${claimId}/actions`,
    request,
  )
  return response.data
}
