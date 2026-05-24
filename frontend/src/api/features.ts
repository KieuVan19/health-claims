import apiClient from './client'

export interface FeatureFlags {
  diagnosisCodesEnabled: boolean
  cptCodesEnabled: boolean
}

export const getFeatureFlags = async (): Promise<FeatureFlags> => {
  const response = await apiClient.get<FeatureFlags>('/features')
  return response.data
}
