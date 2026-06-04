import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, CreditCard, User, Stethoscope, AlertTriangle, X, GitMerge, DollarSign } from 'lucide-react'
import toast from 'react-hot-toast'
import { getPayoutDetail, payClaim } from '../../api/payouts'
import { flagOverpayment } from '../../api/overpayments'
import { executeClaimAction } from '../../api/claims'
import { getPatientUserPolicies } from '../../api/admin'
import { Claim, Overpayment, OverpaymentReason, UserPolicy } from '../../types'
import StatusBadge from '../../components/StatusBadge'
import LoadingSpinner from '../../components/LoadingSpinner'
import { formatCurrency } from '../../utils/formatting'

interface RowProps {
  label: string
  value: string
  valueClass?: string
}

const Row: React.FC<RowProps> = ({ label, value, valueClass = '' }) => (
  <div className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
    <span className="text-sm text-gray-500">{label}</span>
    <span className={`text-sm font-medium text-gray-900 ${valueClass}`}>{value}</span>
  </div>
)

const REASON_LABELS: Record<OverpaymentReason, string> = {
  ADJUSTER_ERROR: 'Adjuster Error',
  COB_UPDATE: 'COB Update',
  POLICY_CHANGE: 'Policy Change',
}

const PayoutDetail: React.FC = () => {
  const { claimId } = useParams<{ claimId: string }>()
  const navigate = useNavigate()
  const [claim, setClaim] = useState<Claim | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Flag overpayment modal
  const [flagModal, setFlagModal] = useState(false)
  const [flagAmount, setFlagAmount] = useState('')
  const [flagReason, setFlagReason] = useState<OverpaymentReason>('ADJUSTER_ERROR')
  const [flagging, setFlagging] = useState(false)
  const [newOverpayment, setNewOverpayment] = useState<Overpayment | null>(null)

  // Pay modal
  const [payModal, setPayModal] = useState(false)
  const [paymentRef, setPaymentRef] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [paying, setPaying] = useState(false)

  // COB state
  const [cobModal, setCobModal] = useState<'external-primary' | 'initiate-secondary' | null>(null)
  const [extInsurerName, setExtInsurerName] = useState('')
  const [extPaidAmount, setExtPaidAmount] = useState('')
  const [extEobDate, setExtEobDate] = useState('')
  const [cobSaving, setCobSaving] = useState(false)
  const [patientPolicies, setPatientPolicies] = useState<UserPolicy[]>([])
  const [secondaryPolicyId, setSecondaryPolicyId] = useState('')
  const [secondaryNotes, setSecondaryNotes] = useState('')

  useEffect(() => {
    if (!claimId) return
    setLoading(true)
    getPayoutDetail(claimId)
      .then(setClaim)
      .catch(() => setError('Claim not found or access denied.'))
      .finally(() => setLoading(false))
  }, [claimId])

  const handlePay = async () => {
    if (!claimId || !paymentRef.trim()) return
    setPaying(true)
    try {
      await payClaim(claimId, { paymentRef: paymentRef.trim(), notes: paymentNotes.trim() || undefined })
      const updated = await getPayoutDetail(claimId)
      setClaim(updated)
      toast.success('Payment processed successfully')
      setPayModal(false)
      setPaymentRef('')
      setPaymentNotes('')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      toast.error(e.response?.data?.error ?? 'Failed to process payment')
    } finally {
      setPaying(false)
    }
  }

  const openCobModal = async (type: 'external-primary' | 'initiate-secondary') => {
    setCobModal(type)
    if (type === 'initiate-secondary' && claim?.patientId && patientPolicies.length === 0) {
      try {
        const policies = await getPatientUserPolicies(claim.patientId)
        setPatientPolicies(policies.filter((up) => up.payerOrder === 'SECONDARY'))
      } catch {
        toast.error('Failed to load patient policies')
      }
    }
  }

  const handleEnterExternalPrimary = async () => {
    if (!claimId || !extInsurerName || !extPaidAmount || !extEobDate) return
    const amount = parseFloat(extPaidAmount)
    if (isNaN(amount) || amount < 0) { toast.error('Enter a valid primary paid amount'); return }
    setCobSaving(true)
    try {
      const updated = await executeClaimAction(claimId, 'EXTERNAL_PRIMARY', {
        primaryInsurerName: extInsurerName,
        primaryPaidAmount: amount,
        primaryEOBDate: extEobDate,
      }) as any
      setClaim(updated)
      toast.success('External primary EOB recorded')
      setCobModal(null)
      setExtInsurerName('')
      setExtPaidAmount('')
      setExtEobDate('')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      toast.error(e.response?.data?.error ?? 'Failed to save external primary EOB')
    } finally {
      setCobSaving(false)
    }
  }

  const handleInitiateSecondary = async () => {
    if (!claimId || !secondaryPolicyId) return
    setCobSaving(true)
    try {
      await executeClaimAction(claimId, 'INITIATE_SECONDARY', { secondaryPolicyId, notes: secondaryNotes || undefined }) as any
      const updated = await getPayoutDetail(claimId)
      setClaim(updated)
      toast.success('Secondary COB claim created and submitted')
      setCobModal(null)
      setSecondaryPolicyId('')
      setSecondaryNotes('')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      toast.error(e.response?.data?.error ?? 'Failed to initiate secondary claim')
    } finally {
      setCobSaving(false)
    }
  }

  const handleFlag = async () => {
    if (!claimId) return
    const amount = parseFloat(flagAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error('Enter a valid overpaid amount')
      return
    }
    setFlagging(true)
    try {
      const op = await flagOverpayment(claimId, { overpaidAmount: amount, reason: flagReason })
      setNewOverpayment(op)
      toast.success('Overpayment flagged — it will be recouped from the patient\'s next payout')
      setFlagModal(false)
      setFlagAmount('')
      setFlagReason('ADJUSTER_ERROR')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      toast.error(e.response?.data?.error ?? 'Failed to flag overpayment')
    } finally {
      setFlagging(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error || !claim) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p className="text-lg font-medium">{error ?? 'Claim not found'}</p>
        <button onClick={() => navigate('/finance/payouts')} className="mt-4 btn-secondary">
          Back to Payouts
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Back */}
      <button
        onClick={() => navigate('/finance/payouts')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        data-testid="back-to-payouts-link"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Payouts
      </button>

      {/* Page header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">Payment Detail</h1>
        <span className="text-gray-400">·</span>
        <span className="text-base font-medium text-gray-600" data-testid="payout-claim-number">{claim.claimNumber}</span>
        <StatusBadge status={claim.status} />
        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/finance/overpayments"
            className="btn-secondary text-sm"
          >
            <AlertTriangle className="h-4 w-4" />
            Overpayments
          </Link>
          {(claim.status === 'APPROVED' || claim.status === 'PARTIALLY_APPROVED') && (
            <button
              onClick={() => { setPaymentRef(claim.claimNumber); setPayModal(true) }}
              className="btn-primary text-sm"
              data-testid="process-payment-btn"
            >
              <DollarSign className="h-4 w-4" />
              Process Payment
            </button>
          )}
          {claim.status === 'PAID' && !newOverpayment && (
            <button
              onClick={() => setFlagModal(true)}
              className="btn-secondary text-sm text-amber-700 border-amber-300 hover:bg-amber-50"
              data-testid="flag-overpayment-btn"
            >
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Flag Overpayment
            </button>
          )}
          {claim.cobFlag && claim.status === 'PAID' && !claim.secondaryClaim && (
            <>
              {!claim.cobDetail && (
                <button
                  onClick={() => openCobModal('external-primary')}
                  className="btn-secondary text-sm text-teal-700 border-teal-300 hover:bg-teal-50"
                  data-testid="enter-external-primary-btn"
                >
                  <GitMerge className="h-4 w-4" />
                  External Primary EOB
                </button>
              )}
              {(claim.cobDetail || claim.status === 'PAID') && (
                <button
                  onClick={() => openCobModal('initiate-secondary')}
                  className="btn-secondary text-sm text-teal-700 border-teal-300 hover:bg-teal-50"
                  data-testid="initiate-secondary-btn"
                >
                  <GitMerge className="h-4 w-4" />
                  Initiate Secondary Claim
                </button>
              )}
            </>
          )}
          {newOverpayment && (
            <span className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" />
              Flagged: {formatCurrency(newOverpayment.overpaidAmount)}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left — payment details */}
        <div className="card p-5" data-testid="payment-details-card">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-4">
            <CreditCard className="h-4 w-4 text-gray-400" />
            Payment Details
          </h2>

          <div className="flex justify-between items-center pb-4 mb-2 border-b border-gray-200">
            <span className="text-sm text-gray-500">Amount Paid</span>
            <span className={`text-2xl font-bold ${claim.payout ? 'text-green-600' : 'text-gray-400'}`} data-testid="amount-paid-value">
              {formatCurrency(claim.payout?.amount ?? claim.adjustedAmount ?? claim.reimbursable ?? 0)}
            </span>
          </div>

          <Row
            label="Payment Reference"
            value={claim.payout?.paymentRef ?? '-'}
            valueClass={claim.payout?.paymentRef ? 'font-mono text-xs tracking-wide' : ''}
          />
          <Row
            label="Batch Reference"
            value={claim.payout?.batchRef ?? '-'}
            valueClass={claim.payout?.batchRef ? 'font-mono text-xs tracking-wide' : ''}
          />
          <Row
            label="Paid Date"
            value={claim.payout?.paidAt ? format(new Date(claim.payout.paidAt), 'MMM d, yyyy') : '-'}
          />
          <Row
            label="Processed By"
            value={
              claim.payout?.processor
                ? `${claim.payout.processor.firstName} ${claim.payout.processor.lastName}`
                : '-'
            }
          />

          <div className="mt-3">
            <p className="text-sm text-gray-500 mb-1">Notes</p>
            <p className="text-sm text-gray-500" data-testid="payout-notes-value">{claim.payout?.notes ?? '-'}</p>
          </div>
        </div>

        {/* Right — patient + adjuster */}
        <div className="space-y-5">
          <div className="card p-5" data-testid="patient-card">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
              <User className="h-4 w-4 text-gray-400" />
              Patient
            </h2>
            <p className="font-medium text-gray-900" data-testid="patient-name-value">
              {claim.patient ? `${claim.patient.firstName} ${claim.patient.lastName}` : '-'}
            </p>
            <p className="text-sm text-gray-500 mt-0.5" data-testid="patient-email-value">{claim.patient?.email ?? '-'}</p>
          </div>

          <div className="card p-5" data-testid="adjuster-card">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
              <Stethoscope className="h-4 w-4 text-gray-400" />
              Adjuster
            </h2>
            <p className="font-medium text-gray-900" data-testid="adjuster-name-value">
              {claim.adjuster ? `${claim.adjuster.firstName} ${claim.adjuster.lastName}` : '-'}
            </p>
            <p className="text-sm text-gray-500 mt-0.5" data-testid="adjuster-email-value">{claim.adjuster?.email ?? '-'}</p>
          </div>
        </div>
      </div>

      {/* COB detail panel */}
      {claim.cobFlag && (
        <div className="card p-5 border-teal-200 bg-teal-50">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-teal-800 mb-4">
            <GitMerge className="h-4 w-4 text-teal-600" />
            Coordination of Benefits
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {claim.cobDetail ? (
              <div className="space-y-2 text-teal-800">
                <p className="font-medium">External Primary EOB</p>
                <div className="flex justify-between"><span>Primary Insurer</span><span className="font-medium">{claim.cobDetail.primaryInsurerName ?? '-'}</span></div>
                <div className="flex justify-between"><span>Primary Paid</span><span className="font-bold">{formatCurrency(claim.cobDetail.primaryPaidAmount ?? 0)}</span></div>
                <div className="flex justify-between"><span>Patient Responsibility</span><span className="font-medium">{formatCurrency(claim.cobDetail.patientResponsibility ?? 0)}</span></div>
                {claim.cobDetail.primaryEOBDate && (
                  <div className="flex justify-between"><span>EOB Date</span><span>{format(new Date(claim.cobDetail.primaryEOBDate), 'MMM d, yyyy')}</span></div>
                )}
              </div>
            ) : (
              <p className="text-teal-600 text-sm italic">No external primary EOB recorded yet. If primary insurer is not in this system, enter their EOB details to enable secondary adjudication.</p>
            )}
            {claim.secondaryClaim && (
              <div className="space-y-2 text-teal-800">
                <p className="font-medium">Secondary Claim</p>
                <div className="flex justify-between"><span>Claim #</span><span className="font-mono">{claim.secondaryClaim.claimNumber}</span></div>
                <div className="flex justify-between"><span>Status</span><span>{claim.secondaryClaim.status}</span></div>
                {claim.secondaryClaim.payout && (
                  <div className="flex justify-between"><span>Secondary Paid</span><span className="font-bold">{formatCurrency(claim.secondaryClaim.payout.amount)}</span></div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* COB — External Primary EOB modal */}
      {cobModal === 'external-primary' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCobModal(null)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <button className="absolute top-4 right-4 text-gray-400 hover:text-gray-600" onClick={() => setCobModal(null)}>
              <X className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                <GitMerge className="h-5 w-5 text-teal-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Enter External Primary EOB</h3>
                <p className="text-sm text-gray-500">Record what the primary insurer paid to calculate secondary liability</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="form-label">Primary Insurer Name <span className="text-red-500">*</span></label>
                <input type="text" value={extInsurerName} onChange={(e) => setExtInsurerName(e.target.value)} className="form-input" placeholder="e.g. Blue Cross Blue Shield" data-testid="ext-insurer-name-input" />
              </div>
              <div>
                <label className="form-label">Primary Paid Amount ($) <span className="text-red-500">*</span></label>
                <input type="number" min="0" step="0.01" value={extPaidAmount} onChange={(e) => setExtPaidAmount(e.target.value)} className="form-input" placeholder="0.00" data-testid="ext-paid-amount-input" />
              </div>
              <div>
                <label className="form-label">Primary EOB Date <span className="text-red-500">*</span></label>
                <input type="date" value={extEobDate} onChange={(e) => setExtEobDate(e.target.value)} className="form-input" data-testid="ext-eob-date-input" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setCobModal(null)} className="btn-secondary">Cancel</button>
              <button
                onClick={handleEnterExternalPrimary}
                disabled={cobSaving || !extInsurerName || !extPaidAmount || !extEobDate}
                className="btn-primary"
                data-testid="confirm-ext-primary-btn"
              >
                {cobSaving ? 'Saving…' : 'Save EOB'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COB — Initiate Secondary Claim modal */}
      {cobModal === 'initiate-secondary' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCobModal(null)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <button className="absolute top-4 right-4 text-gray-400 hover:text-gray-600" onClick={() => setCobModal(null)}>
              <X className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                <GitMerge className="h-5 w-5 text-teal-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Initiate Secondary COB Claim</h3>
                <p className="text-sm text-gray-500">Secondary claim will be capped at patient responsibility from primary</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="form-label">Secondary Policy <span className="text-red-500">*</span></label>
                <select value={secondaryPolicyId} onChange={(e) => setSecondaryPolicyId(e.target.value)} className="form-input" data-testid="secondary-policy-select">
                  <option value="">Select secondary policy...</option>
                  {patientPolicies.map((up) => (
                    <option key={up.policyId} value={up.policyId}>
                      {up.policy.name} ({up.policy.type}) — expires {format(new Date(up.policy.expiryDate), 'MMM d, yyyy')}
                    </option>
                  ))}
                </select>
                {patientPolicies.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">No SECONDARY-order policies found for this patient. Configure payer order in Admin &gt; User Policies.</p>
                )}
              </div>
              <div>
                <label className="form-label">Notes (optional)</label>
                <input type="text" value={secondaryNotes} onChange={(e) => setSecondaryNotes(e.target.value)} className="form-input" placeholder="Optional notes..." data-testid="secondary-notes-input" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setCobModal(null)} className="btn-secondary">Cancel</button>
              <button
                onClick={handleInitiateSecondary}
                disabled={cobSaving || !secondaryPolicyId}
                className="btn-primary"
                data-testid="confirm-secondary-btn"
              >
                {cobSaving ? 'Creating…' : 'Create Secondary Claim'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Process payment modal */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPayModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <button
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              onClick={() => setPayModal(false)}
            >
              <X className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Process Payment</h3>
                <p className="text-sm text-gray-500">
                  {claim.claimNumber} &mdash;{' '}
                  {formatCurrency(claim.adjustedAmount ?? claim.reimbursable ?? 0)}
                </p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4 text-sm text-gray-700">
              You are about to process a payment of{' '}
              <span className="font-semibold text-green-600">
                {formatCurrency(claim.adjustedAmount ?? claim.reimbursable ?? 0)}
              </span>{' '}
              to{' '}
              <span className="font-semibold">
                {claim.patient ? `${claim.patient.firstName} ${claim.patient.lastName}` : '—'}
              </span>
              . This action cannot be undone.
            </div>

            <div className="space-y-3">
              <div>
                <label className="form-label">Payment Reference <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  className="form-input"
                  placeholder="e.g. CLM-2024-001"
                  data-testid="payment-ref-input"
                />
              </div>
              <div>
                <label className="form-label">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  rows={3}
                  className="form-input resize-none"
                  placeholder="Add any payment notes..."
                  data-testid="payment-notes-input"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setPayModal(false)} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handlePay}
                disabled={paying || !paymentRef.trim()}
                className="btn-primary"
                data-testid="confirm-payment-btn"
              >
                <DollarSign className="h-4 w-4" />
                {paying ? 'Processing…' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flag overpayment modal */}
      {flagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFlagModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <button
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              onClick={() => setFlagModal(false)}
            >
              <X className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Flag Overpayment</h3>
                <p className="text-sm text-gray-500">
                  {claim.claimNumber} &mdash; paid {formatCurrency(claim.payout?.amount ?? 0)}
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              The overpaid amount will be automatically deducted from the patient&apos;s next claim payout
              until fully recovered. No negative payouts will be issued.
            </p>
            <div className="space-y-3">
              <div>
                <label className="form-label">
                  Overpaid Amount ($) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={flagAmount}
                  onChange={(e) => setFlagAmount(e.target.value)}
                  className="form-input"
                  placeholder="0.00"
                  data-testid="flag-amount-input"
                />
              </div>
              <div>
                <label className="form-label">Reason <span className="text-red-500">*</span></label>
                <select
                  className="form-input"
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value as OverpaymentReason)}
                  data-testid="flag-reason-select"
                >
                  {(Object.entries(REASON_LABELS) as [OverpaymentReason, string][]).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setFlagModal(false)} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleFlag}
                disabled={flagging || !flagAmount}
                className="btn-primary"
                data-testid="confirm-flag-btn"
              >
                <AlertTriangle className="h-4 w-4" />
                {flagging ? 'Flagging…' : 'Flag Overpayment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PayoutDetail
