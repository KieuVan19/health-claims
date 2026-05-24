import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('../lib/prisma', () => ({
  default: {
    claim: { findMany: vi.fn(), update: vi.fn() },
    payout: { findUnique: vi.fn(), create: vi.fn() },
    claimEvent: { create: vi.fn() },
  },
}))

vi.mock('../middleware/auth', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = { id: 'finance-1', email: 'finance@test.com', role: 'FINANCE_OFFICER' }
    next()
  },
}))

vi.mock('../utils/notification', () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../utils/audit', () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../services/email', () => ({ sendClaimPaid: vi.fn().mockResolvedValue(undefined) }))

import prisma from '../lib/prisma'
import payoutsRouter from './payouts'
import { errorHandler } from '../middleware/error'

const buildApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/payouts', payoutsRouter)
  app.use(errorHandler)
  return app
}

const makeClaim = (id: string, claimNumber: string, reimbursable = 500) => ({
  id,
  claimNumber,
  status: 'APPROVED',
  reimbursable,
  patientId: 'patient-1',
  patient: { id: 'patient-1', email: 'patient@test.com', firstName: 'John', lastName: 'Doe' },
})

describe('POST /payouts/batch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.claim.update).mockResolvedValue({} as never)
    vi.mocked(prisma.payout.create).mockResolvedValue({ id: 'payout-new' } as never)
    vi.mocked(prisma.claimEvent.create).mockResolvedValue({} as never)
  })

  it('processes all approved claims and returns them in the processed list', async () => {
    vi.mocked(prisma.claim.findMany).mockResolvedValue([
      makeClaim('c1', 'CLM-001', 500),
      makeClaim('c2', 'CLM-002', 750),
    ] as never)
    vi.mocked(prisma.payout.findUnique).mockResolvedValue(null)

    const res = await request(buildApp())
      .post('/payouts/batch')
      .send({ claimIds: ['c1', 'c2'], paymentRef: 'BATCH-001' })

    expect(res.status).toBe(200)
    expect(res.body.processed).toHaveLength(2)
    expect(res.body.errors).toHaveLength(0)
    expect(res.body.batchRef).toBe('BATCH-001')
    expect(res.body.processed[0]).toMatchObject({ claimId: 'c1', claimNumber: 'CLM-001', amount: 500, status: 'PAID' })
    // individual paymentRef should be derived from batchRef + claimNumber
    const payoutCreateCall = vi.mocked(prisma.payout.create).mock.calls[0][0]
    expect(payoutCreateCall.data.paymentRef).toBe('BATCH-001-CLM-001')
    expect(payoutCreateCall.data.batchRef).toBe('BATCH-001')
  })

  it('skips claims that already have a payout and reports them as errors', async () => {
    vi.mocked(prisma.claim.findMany).mockResolvedValue([
      makeClaim('c1', 'CLM-001'),
      makeClaim('c2', 'CLM-002'),
    ] as never)
    vi.mocked(prisma.payout.findUnique)
      .mockResolvedValueOnce({ id: 'existing' } as never) // c1 already paid
      .mockResolvedValueOnce(null)                        // c2 is fine

    const res = await request(buildApp())
      .post('/payouts/batch')
      .send({ claimIds: ['c1', 'c2'], paymentRef: 'BATCH-002' })

    expect(res.status).toBe(200)
    expect(res.body.processed).toHaveLength(1)
    expect(res.body.processed[0].claimId).toBe('c2')
    expect(res.body.errors).toHaveLength(1)
    expect(res.body.errors[0]).toMatchObject({ claimId: 'c1', error: 'Payment already processed' })
  })

  it('returns 400 when no approved claims match the provided IDs', async () => {
    vi.mocked(prisma.claim.findMany).mockResolvedValue([])

    const res = await request(buildApp())
      .post('/payouts/batch')
      .send({ claimIds: ['nonexistent'], paymentRef: 'BATCH-003' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/no approved claims/i)
  })

  it('uses paymentRef directly and sets no batchRef for a single claim', async () => {
    vi.mocked(prisma.claim.findMany).mockResolvedValue([
      makeClaim('c1', 'CLM-001', 500),
    ] as never)
    vi.mocked(prisma.payout.findUnique).mockResolvedValue(null)

    const res = await request(buildApp())
      .post('/payouts/batch')
      .send({ claimIds: ['c1'], paymentRef: 'PAY-CLM-001' })

    expect(res.status).toBe(200)
    expect(res.body.processed).toHaveLength(1)
    expect(res.body.batchRef).toBeUndefined()
    const payoutCreateCall = vi.mocked(prisma.payout.create).mock.calls[0][0]
    expect(payoutCreateCall.data.paymentRef).toBe('PAY-CLM-001')
    expect(payoutCreateCall.data.batchRef).toBeNull()
  })

  it('returns 400 when claimIds array is empty', async () => {
    const res = await request(buildApp())
      .post('/payouts/batch')
      .send({ claimIds: [], paymentRef: 'BATCH-004' })

    expect(res.status).toBe(400)
  })

  it('returns 400 when paymentRef is missing', async () => {
    const res = await request(buildApp())
      .post('/payouts/batch')
      .send({ claimIds: ['c1'] })

    expect(res.status).toBe(400)
  })
})
