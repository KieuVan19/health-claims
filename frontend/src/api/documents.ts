import apiClient from './client'
import { Document } from '../types'

export const uploadDocuments = async (claimId: string, files: File[]): Promise<Document[]> => {
  const formData = new FormData()
  files.forEach((file) => formData.append('documents', file))
  const response = await apiClient.post<Document[]>(`/documents/claims/${claimId}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

export const getDocuments = async (claimId: string): Promise<Document[]> => {
  const response = await apiClient.get<Document[]>(`/documents/claims/${claimId}`)
  return response.data
}

export const downloadDocument = async (id: string): Promise<Blob> => {
  const response = await apiClient.get(`/documents/${id}/download`, { responseType: 'blob' })
  return response.data
}

export const previewDocument = async (id: string): Promise<Blob> => {
  const response = await apiClient.get(`/documents/${id}/download`, { responseType: 'blob' })
  return response.data
}

export const deleteDocument = async (id: string): Promise<void> => {
  await apiClient.delete(`/documents/${id}`)
}
