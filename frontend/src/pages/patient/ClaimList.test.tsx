import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import ClaimList from './ClaimList'
import * as claimsApi from '../../api/claims'

vi.mock('../../api/claims')

const mockClaims = [
  {
    id: 'claim-1',
    claimNumber: 'CLM-001',
    patientId: 'patient-1',
    policyId: 'policy-1',
    type: 'HOSPITALIZATION' as const,
    status: 'SUBMITTED' as const,
    description: 'Hospital stay',
    incidentDate: '2024-01-15',
    totalAmount: 5000,
    reimbursable: 4000,
    createdAt: '2024-01-20',
    updatedAt: '2024-01-20',
  },
]

describe('ClaimList', () => {
  beforeEach(() => {
    vi.mocked(claimsApi.getClaims).mockResolvedValue({
      data: mockClaims,
      pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
    })
  })

  it('should navigate to /patient/claims/{id} when clicking claim number', async () => {
    render(
      <BrowserRouter>
        <ClaimList />
      </BrowserRouter>
    )

    await expect(screen.findByText('CLM-001')).resolves.toBeTruthy()
    const link = screen.getByText('CLM-001').closest('a')
    expect(link?.getAttribute('href')).toBe('/patient/claims/claim-1')
  })

  it('should navigate to /patient/claims/{id} when clicking View button', async () => {
    render(
      <BrowserRouter>
        <ClaimList />
      </BrowserRouter>
    )

    await expect(screen.findByTestId('view-claim-btn')).resolves.toBeTruthy()
    const viewLink = screen.getByTestId('view-claim-btn')
    expect(viewLink.getAttribute('href')).toBe('/patient/claims/claim-1')
  })
})
