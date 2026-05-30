import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  ArrowLeft,
  FileText,
  Download,
  Eye,
  CheckCircle,
  XCircle,
  HelpCircle,
  UserCheck,
  User as UserIcon,
  Shield,
  Calendar,
  X,
  AlertTriangle,
  BarChart2,
  Scale,
  GitMerge,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { getClaim, approveClaim, rejectClaim, requestInfo, assignClaim, getClaimTypeSummary, assignAppeal, resolveAppeal, reassignClaim, adjudicateLine } from '../../api/claims'
import { downloadDocument, previewDocument } from '../../api/documents'
import { getUsers } from '../../api/admin'
import { useAuthStore } from '../../store/authStore'
import { Claim, ClaimLine, ClaimTypeSummary, LineAdjudicationStatus, User } from '../../types'
import StatusBadge from '../../components/StatusBadge'
import ClaimTimeline from '../../components/ClaimTimeline'
import LoadingSpinner from '../../components/LoadingSpinner'
import { formatCurrency } from '../../utils/formatting'
import { CLAIM_TYPE_LABELS } from '../../constants/claimTypes'

type ModalType = 'approve' | 'reject' | 'requestInfo' | 'resolveAppeal' | null

const ClaimReview: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [claim, setClaim] = useState<Claim | null>(null)
  const [typeSummary, setTypeSummary] = useState<ClaimTypeSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [modal, setModal] = useState<ModalType>(null)
  const [notes, setNotes] = useState('')
  const [overrideAmount, setOverrideAmount] = useState(false)
  const [adjustedAmount, setAdjustedAmount] = useState('')
  const [adjusters, setAdjusters] = useState<User[]>([])
  const [reassignAdjusterId, setReassignAdjusterId] = useState('')
  const [lineModal, setLineModal] = useState<{ line: ClaimLine; action: LineAdjudicationStatus } | null>(null)
  const [lineAllowedAmount, setLineAllowedAmount] = useState('')
  const [lineDenialReason, setLineDenialReason] = useState('')
  const [lineAdjNote, setLineAdjNote] = useState('')
  const [lineLoading, setLineLoading] = useState(false)

  const fetchClaim = async () => {
    if (!id) return
    setLoading(true)
    try {
      const data = await getClaim(id)
      setClaim(data)
      getClaimTypeSummary(id).then(setTypeSummary).catch(() => null)
    } catch {
      toast.error('Failed to load claim')
      navigate('/adjuster/claims')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchClaim()
    if (user?.role === 'ADMIN') {
      getUsers({ role: 'ADJUSTER', limit: 100 })
        .then((res) => setAdjusters(res.users.filter((u) => u.isActive)))
        .catch(() => null)
    }
  }, [id])

  const handleReassign = async () => {
    if (!claim || !reassignAdjusterId) return
    setActionLoading(true)
    try {
      const updated = await reassignClaim(claim.id, reassignAdjusterId)
      setClaim(updated)
      setReassignAdjusterId('')
      toast.success('Claim reassigned successfully')
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error || 'Failed to reassign claim')
    } finally {
      setActionLoading(false)
    }
  }

  const handleAssign = async () => {
    if (!claim || !user) return
    setActionLoading(true)
    try {
      const updated = await assignClaim(claim.id, user.id)
      setClaim(updated)
      toast.success('Claim assigned to you')
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Failed to assign claim')
    } finally {
      setActionLoading(false)
    }
  }

  const closeModal = () => {
    setModal(null)
    setNotes('')
    setOverrideAmount(false)
    setAdjustedAmount('')
  }

  const closeLineModal = () => {
    setLineModal(null)
    setLineAllowedAmount('')
    setLineDenialReason('')
    setLineAdjNote('')
  }

  const handleAdjudicateLine = async () => {
    if (!claim || !lineModal) return
    const { line, action } = lineModal
    if (action === 'REDUCED' && (!lineAllowedAmount || isNaN(parseFloat(lineAllowedAmount)) || parseFloat(lineAllowedAmount) <= 0)) {
      toast.error('Enter a valid allowed amount for a reduced line')
      return
    }
    if (action === 'DENIED' && !lineDenialReason.trim()) {
      toast.error('Denial reason is required')
      return
    }
    setLineLoading(true)
    try {
      const updated = await adjudicateLine(claim.id, line.id, {
        adjudicationStatus: action,
        ...(action === 'APPROVED' ? { allowedAmount: parseFloat(lineAllowedAmount) || line.billedAmount } : {}),
        ...(action === 'REDUCED' ? { allowedAmount: parseFloat(lineAllowedAmount) } : {}),
        ...(action === 'DENIED' ? { denialReason: lineDenialReason } : {}),
        ...(lineAdjNote.trim() ? { adjudicatorNote: lineAdjNote } : {}),
      })
      setClaim(updated)
      closeLineModal()
      toast.success(`Line ${line.lineNumber} ${action.toLowerCase()}`)
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error || 'Failed to adjudicate line')
    } finally {
      setLineLoading(false)
    }
  }

  const handleApprove = async () => {
    if (!claim) return

    const parsedEligible = overrideAmount ? parseFloat(adjustedAmount) : undefined
    if (overrideAmount) {
      if (!adjustedAmount || isNaN(parsedEligible!)) {
        toast.error('Enter a valid eligible amount')
        return
      }
      if (claim.eligibleAmount !== undefined && parsedEligible! > claim.eligibleAmount) {
        toast.error('Eligible amount cannot exceed the calculated eligible amount')
        return
      }
      if (parsedEligible! <= 0) {
        toast.error('Eligible amount must be greater than zero')
        return
      }
    }

    setActionLoading(true)
    try {
      const updated = await approveClaim(claim.id, notes || undefined, parsedEligible)
      setClaim(updated)
      closeModal()
      toast.success('Claim approved!')
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Failed to approve claim')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async () => {
    if (!claim) return
    setActionLoading(true)
    try {
      const updated = await rejectClaim(claim.id, notes)
      setClaim(updated)
      setModal(null)
      setNotes('')
      toast.success('Claim rejected')
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Failed to reject claim')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRequestInfo = async () => {
    if (!claim || !notes.trim()) return
    setActionLoading(true)
    try {
      const updated = await requestInfo(claim.id, notes)
      setClaim(updated)
      setModal(null)
      setNotes('')
      toast.success('Information requested from patient')
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Failed to request info')
    } finally {
      setActionLoading(false)
    }
  }

  const handleAssignAppeal = async () => {
    if (!claim || !user) return
    setActionLoading(true)
    try {
      const updated = await assignAppeal(claim.id, user.id)
      setClaim(updated)
      toast.success('Appeal assigned to you')
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string; error?: string } } }
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to assign appeal')
    } finally {
      setActionLoading(false)
    }
  }

  const handleResolveAppeal = async (resolution: 'APPEAL_APPROVED' | 'APPEAL_DENIED') => {
    if (!claim) return
    setActionLoading(true)
    try {
      const updated = await resolveAppeal(claim.id, resolution, notes || undefined)
      setClaim(updated)
      closeModal()
      toast.success(resolution === 'APPEAL_APPROVED' ? 'Appeal approved — claim returned to review' : 'Appeal denied')
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string; error?: string } } }
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to resolve appeal')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDownload = async (docId: string, name: string) => {
    try {
      const blob = await downloadDocument(docId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download document')
    }
  }

  const handleView = async (docId: string, mimeType: string) => {
    const isViewable = mimeType.startsWith('image/') || mimeType === 'application/pdf'
    if (!isViewable) return
    try {
      const blob = await previewDocument(docId)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch {
      toast.error('Failed to open document')
    }
  }

  const openModal = (type: ModalType) => {
    setNotes('')
    setModal(type)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!claim) return null

  const isAssigned = claim.adjusterId === user?.id || claim.assignedAdjuster?.id === user?.id
  const isAppeal = claim.status === 'APPEAL_PENDING'
  const canAct = ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED', 'INFO_RESPONDED', 'APPEAL_PENDING'].includes(claim.status)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link
        to={user?.role === 'ADMIN' ? '/admin/adjuster-workload' : '/adjuster/claims'}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" /> {user?.role === 'ADMIN' ? 'Back to Workload' : 'Back to Queue'}
      </Link>

      {/* Header */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{claim.claimNumber}</h1>
              <StatusBadge status={claim.status} />
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {CLAIM_TYPE_LABELS[claim.type]} &bull; Patient: {claim.patient
                ? `${claim.patient.firstName} ${claim.patient.lastName}`
                : 'Unknown'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isAppeal && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                <Scale className="h-3 w-3" />
                Appeal
              </span>
            )}
            {claim.cobFlag && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
                <GitMerge className="h-3 w-3" />
                COB
              </span>
            )}
            {!isAssigned && !['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID', 'WITHDRAWN', 'APPEAL_DENIED', 'APPEAL_APPROVED'].includes(claim.status) && (
              // For appeals, the server enforces the second-adjudicator constraint; show button if not the original adjudicator
              (!isAppeal || claim.originalAdjudicatorId !== user?.id) && (
                <button
                  onClick={isAppeal ? handleAssignAppeal : handleAssign}
                  disabled={actionLoading}
                  className="btn-secondary"
                  data-testid="assign-to-me-btn"
                >
                  <UserCheck className="h-4 w-4" />
                  {isAppeal ? 'Assign Appeal to Me' : 'Assign to Me'}
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* Status progress */}
      {!['REJECTED', 'WITHDRAWN', 'APPEAL_PENDING', 'APPEAL_DENIED', 'APPEAL_APPROVED'].includes(claim.status) && (
        <div className="card p-5">
          <ClaimTimeline
            events={[]}
            showStatusProgress
            currentStatus={claim.status}
            adjusterView
            progressOnly
          />
        </div>
      )}
      {/* Appeal status banner */}
      {isAppeal && (
        <div className="flex items-start gap-3 p-4 bg-purple-50 border border-purple-200 rounded-xl">
          <Scale className="h-5 w-5 text-purple-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-purple-800">Internal Appeal Pending</p>
            {claim.appealReason && (
              <p className="text-sm text-purple-700 mt-1">{claim.appealReason}</p>
            )}
            {claim.originalAdjudicatorId && claim.originalAdjudicatorId === user?.id && (
              <p className="text-xs text-red-600 mt-1 font-medium">You made the original rejection decision and cannot review this appeal.</p>
            )}
          </div>
        </div>
      )}

      {/* COB banner */}
      {claim.cobFlag && (
        <div className="flex items-start gap-3 p-4 bg-teal-50 border border-teal-200 rounded-xl" data-testid="cob-banner">
          <GitMerge className="h-5 w-5 text-teal-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-teal-800">Coordination of Benefits (COB)</p>
            <p className="text-sm text-teal-700 mt-1">
              This patient has both a primary and secondary insurance policy. Adjudicate this claim as the <strong>primary payer</strong> first.
              After payment is processed, Finance can initiate the secondary claim against the secondary policy.
            </p>
            {claim.secondaryClaim && (
              <p className="text-xs text-teal-600 mt-1 font-medium">
                Secondary claim: {claim.secondaryClaim.claimNumber} ({claim.secondaryClaim.status})
              </p>
            )}
            {claim.primaryClaim && (
              <p className="text-xs text-teal-600 mt-1 font-medium">
                This is a secondary COB claim. Primary: {claim.primaryClaim.claimNumber} ({claim.primaryClaim.status})
              </p>
            )}
          </div>
        </div>
      )}

      {/* Fraud alert */}
      {claim.fraudScore !== undefined && claim.fraudScore >= 50 && (() => {
        const flags: string[] = claim.fraudFlags
          ? (() => { try { return JSON.parse(claim.fraudFlags as string) } catch { return [] } })()
          : []
        return (
          <div
            className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800"
            data-testid="fraud-alert"
          >
            <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Fraud Risk Detected — Score: {Math.round(claim.fraudScore!)}/100</p>
              {flags.length > 0 && (
                <ul className="mt-1 list-disc list-inside text-xs space-y-0.5">
                  {flags.map((flag) => (
                    <li key={flag}>{flag.replace(/_/g, ' ')}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )
      })()}


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Claim details */}
          <div className="card p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" />
              Claim Details
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Incident Date</label>
                <div className="mt-1 flex items-center gap-1 text-sm text-gray-900">
                  <Calendar className="h-3.5 w-3.5 text-gray-400" />
                  {format(new Date(claim.incidentDate), 'MMM d, yyyy')}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Type</label>
                <p className="mt-1 text-sm text-gray-900">{CLAIM_TYPE_LABELS[claim.type]}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Amount</label>
                <p className="mt-1 text-sm font-semibold text-gray-900">{formatCurrency(claim.totalAmount)}</p>
              </div>
              {claim.eligibleAmount !== undefined && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Eligible Amount</label>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{formatCurrency(claim.eligibleAmount)}</p>
                </div>
              )}
              {claim.deductible !== undefined && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Deductible</label>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{formatCurrency(claim.deductible)}</p>
                </div>
              )}
              {claim.eligibleAmount !== undefined && claim.deductible !== undefined && claim.policy?.copayPercentage !== undefined && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Copay Amount</label>
                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    {formatCurrency(Math.max(0, claim.eligibleAmount - claim.deductible) * (claim.policy.copayPercentage / 100))}
                  </p>
                </div>
              )}
              {claim.reimbursable !== undefined && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {claim.adjustedAmount != null ? 'Calculated Reimbursable' : 'Reimbursable'}
                  </label>
                  <p className={`mt-1 text-sm font-bold ${claim.adjustedAmount != null ? 'text-gray-400 line-through' : 'text-green-600'}`}>
                    {formatCurrency(claim.reimbursable)}
                  </p>
                </div>
              )}
              {claim.adjustedAmount != null && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Approved Amount (Adjusted)</label>
                  <p className="mt-1 text-sm font-bold text-green-600">{formatCurrency(claim.adjustedAmount)}</p>
                </div>
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Description</label>
              <p className="mt-1 text-sm text-gray-700">{claim.description}</p>
            </div>
            {claim.diagnosisCodes && claim.diagnosisCodes.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Diagnosis Codes (ICD-10)
                </label>
                <div className="mt-2 space-y-1">
                  {claim.diagnosisCodes.map((code, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-20 shrink-0">
                        {i === 0 ? 'Primary' : `Secondary ${i}`}
                      </span>
                      <span className="font-mono text-sm font-semibold text-gray-900">{code}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Line Items adjudication table */}
          {claim.lines && claim.lines.length > 0 && (
            <div className="card p-5">
              <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600" />
                Procedure Line Items
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-100">
                      <th className="text-left py-2 pr-2">#</th>
                      <th className="text-left py-2 pr-2">CPT</th>
                      <th className="text-left py-2 pr-2">Mod</th>
                      <th className="text-right py-2 pr-2">Units</th>
                      <th className="text-right py-2 pr-2">Billed</th>
                      <th className="text-right py-2 pr-2">Allowed</th>
                      <th className="text-left py-2 pr-2">Status</th>
                      <th className="text-left py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {claim.lines.map((line) => {
                      const statusColors: Record<string, string> = {
                        PENDING: 'text-gray-500',
                        APPROVED: 'text-green-600 font-medium',
                        REDUCED: 'text-amber-600 font-medium',
                        DENIED: 'text-red-600 font-medium',
                      }
                      const canAdjLine = canAct && isAssigned
                      return (
                        <tr key={line.id} className="border-b border-gray-50 last:border-0">
                          <td className="py-2 pr-2 text-gray-400">{line.lineNumber}</td>
                          <td className="py-2 pr-2 font-mono font-medium text-gray-900">{line.cptCode}</td>
                          <td className="py-2 pr-2 font-mono text-gray-500">{line.modifier || '—'}</td>
                          <td className="py-2 pr-2 text-right">{line.units}</td>
                          <td className="py-2 pr-2 text-right">{formatCurrency(line.billedAmount)}</td>
                          <td className="py-2 pr-2 text-right">
                            {line.allowedAmount != null ? formatCurrency(line.allowedAmount) : '—'}
                          </td>
                          <td className={`py-2 pr-2 ${statusColors[line.adjudicationStatus] ?? ''}`}>
                            {line.adjudicationStatus.charAt(0) + line.adjudicationStatus.slice(1).toLowerCase()}
                            {line.denialReason && (
                              <span className="block text-xs text-gray-500">{line.denialReason}</span>
                            )}
                          </td>
                          <td className="py-2">
                            {canAdjLine && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => { setLineModal({ line, action: 'APPROVED' }); setLineAllowedAmount(String(line.billedAmount)) }}
                                  className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                                  data-testid={`approve-line-${line.id}`}
                                  title="Approve"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => { setLineModal({ line, action: 'REDUCED' }); setLineAllowedAmount('') }}
                                  className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
                                  data-testid={`reduce-line-${line.id}`}
                                  title="Reduce"
                                >
                                  Reduce
                                </button>
                                <button
                                  onClick={() => { setLineModal({ line, action: 'DENIED' }); setLineDenialReason('') }}
                                  className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                                  data-testid={`deny-line-${line.id}`}
                                  title="Deny"
                                >
                                  Deny
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="border-t border-gray-200">
                    <tr>
                      <td colSpan={4} className="py-2 pr-2 text-xs font-semibold text-gray-500 uppercase">Totals</td>
                      <td className="py-2 pr-2 text-right font-semibold">
                        {formatCurrency(claim.lines.reduce((s, l) => s + l.billedAmount, 0))}
                      </td>
                      <td className="py-2 pr-2 text-right font-semibold text-green-700">
                        {claim.totalAllowed != null ? formatCurrency(claim.totalAllowed) : '—'}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Patient info */}
          {claim.patient && (
            <div className="card p-5">
              <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <UserIcon className="h-4 w-4 text-blue-600" />
                Patient Information
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Name</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {claim.patient.firstName} {claim.patient.lastName}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Email</label>
                  <p className="mt-1 text-sm text-gray-900">{claim.patient.email}</p>
                </div>
              </div>
            </div>
          )}

          {/* Info requests */}
          {claim.infoRequests && claim.infoRequests.length > 0 && (
            <div className="card p-5">
              <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-orange-500" />
                Information Requests
              </h2>
              <div className="space-y-3">
                {claim.infoRequests.map((req) => (
                  <div key={req.id} className="rounded-xl bg-gray-50 border border-gray-200 p-4">
                    <p className="text-sm font-medium text-gray-900">Request:</p>
                    <p className="text-sm text-gray-700 mt-1">{req.message}</p>
                    {req.respondedAt ? (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-sm font-medium text-green-700">Patient Response:</p>
                        {req.response ? (
                          <p className="text-sm text-gray-700 mt-1">{req.response}</p>
                        ) : (
                          <p className="text-sm text-gray-500 italic mt-1">Patient provided supporting document(s) — see Documents section.</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                          Responded {format(new Date(req.respondedAt), 'MMM d, yyyy')}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-orange-600 font-medium">Awaiting patient response</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Documents */}
          <div className="card p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" />
              Documents ({claim.documents?.length ?? 0})
            </h2>
            {!claim.documents || claim.documents.length === 0 ? (
              <p className="text-sm text-gray-500">No documents uploaded.</p>
            ) : (
              <ul className="space-y-2">
                {claim.documents.map((doc) => {
                  const isViewable = doc.mimeType.startsWith('image/') || doc.mimeType === 'application/pdf'
                  return (
                    <li
                      key={doc.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-200"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                        <span className="text-sm text-gray-700 truncate">{doc.originalName}</span>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {(doc.size / 1024).toFixed(1)} KB
                        </span>
                      </div>
                      <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                        {isViewable && (
                          <button
                            onClick={() => handleView(doc.id, doc.mimeType)}
                            className="text-blue-600 hover:text-blue-700 p-1 rounded hover:bg-blue-50 transition-colors"
                            title="Open"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDownload(doc.id, doc.originalName)}
                          className="text-blue-600 hover:text-blue-700 p-1 rounded hover:bg-blue-50 transition-colors"
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Timeline */}
          <div className="card p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Activity Timeline</h2>
            <ClaimTimeline events={claim.events ?? []} />
          </div>
        </div>

        {/* Action panel */}
        <div className="space-y-4">
          {/* SLA / TAT info */}
          {claim.ageDays != null && claim.slaStatus != null && (
            <div className={`card p-4 border ${
              claim.slaStatus === 'BREACHED' ? 'border-red-300 bg-red-50' :
              claim.slaStatus === 'AT_RISK' ? 'border-amber-300 bg-amber-50' :
              'border-gray-200'
            }`}>
              <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${
                claim.slaStatus === 'BREACHED' ? 'text-red-800' :
                claim.slaStatus === 'AT_RISK' ? 'text-amber-800' :
                'text-gray-900'
              }`}>
                <AlertTriangle className="h-4 w-4" />
                SLA / Turnaround Time
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Age</span>
                  <span className={`font-semibold ${
                    claim.slaStatus === 'BREACHED' ? 'text-red-700' :
                    claim.slaStatus === 'AT_RISK' ? 'text-amber-700' :
                    'text-gray-800'
                  }`}>Day {claim.ageDays}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">SLA Status</span>
                  <span className={`font-semibold ${
                    claim.slaStatus === 'BREACHED' ? 'text-red-700' :
                    claim.slaStatus === 'AT_RISK' ? 'text-amber-700' :
                    'text-green-700'
                  }`}>{claim.slaStatus === 'BREACHED' ? 'Breached' : claim.slaStatus === 'AT_RISK' ? 'At Risk' : 'On Track'}</span>
                </div>
                {claim.submittedAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Submitted</span>
                    <span className="text-gray-800">{format(new Date(claim.submittedAt), 'MMM d, yyyy')}</span>
                  </div>
                )}
                {claim.ackDays != null && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Ack SLA</span>
                    <span className={`font-semibold ${claim.ackSlaBreached ? 'text-red-700' : 'text-green-700'}`}>
                      {claim.ackDays}d {claim.ackSlaBreached ? '(exceeded 10d)' : '(within 10d)'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Ack SLA for closed claims that have been reviewed */}
          {claim.ackDays != null && claim.ageDays == null && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-gray-500" />
                Acknowledgement SLA
              </h3>
              <div className="text-sm text-gray-600 flex justify-between">
                <span>Days to first review</span>
                <span className={`font-semibold ${claim.ackSlaBreached ? 'text-red-700' : 'text-green-700'}`}>
                  {claim.ackDays}d {claim.ackSlaBreached ? '(exceeded 10d)' : '(within 10d)'}
                </span>
              </div>
            </div>
          )}

          {/* Policy info */}
          {claim.policy && (
            <div className="card p-4">
              <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4 text-blue-600" />
                Policy
              </h3>
              <p className="font-medium text-gray-900 text-base">{claim.policy.name}</p>
              <div className="mt-2 space-y-1 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>Coverage</span>
                  <span>{formatCurrency(claim.policy.coverageAmount ?? claim.policy.coverageLimit ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Deductible</span>
                  <span>{formatCurrency(claim.policy.deductible)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Copay Rate</span>
                  <span>{claim.policy.copayPercentage ?? 0}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Effective Date</span>
                  <span>{format(new Date(claim.policy.effectiveDate), 'MMM d, yyyy')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Expiry Date</span>
                  <span className={new Date(claim.policy.expiryDate) < new Date() ? 'text-red-600 font-medium' : ''}>
                    {format(new Date(claim.policy.expiryDate), 'MMM d, yyyy')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Claim type usage summary */}
          {typeSummary && (
            <div className="card p-4">
              <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-blue-600" />
                Type Usage
              </h3>
              <div className="space-y-3">
                <p className="text-xs text-gray-400 mb-3">Year-to-date usage from other approved claims — this claim is not included.</p>
                {typeSummary.typeUsages.map((t) => {
                  const usedPct = t.limit ? Math.min(100, (t.usedAmount / t.limit) * 100) : 0
                  return (
                    <div key={t.type}>
                      <div className="flex justify-between items-center mb-1">
                        <span className={`text-xs font-medium ${t.isCurrentType ? 'text-blue-600' : 'text-gray-600'}`}>
                          {CLAIM_TYPE_LABELS[t.type]}{t.isCurrentType ? ' ←' : ''}
                        </span>
                        <span className="text-xs text-gray-500">
                          ${t.usedAmount.toFixed(1)}{t.limit !== null ? `/${Math.round(t.limit)}` : ''}
                        </span>
                      </div>
                      {t.limit !== null && (
                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${usedPct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Admin reassign panel */}
          {user?.role === 'ADMIN' && !['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID', 'WITHDRAWN', 'APPEAL_DENIED'].includes(claim.status) && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Reassign Claim</h3>
              <p className="text-xs text-gray-500 mb-2">
                Currently assigned to:{' '}
                {claim.assignedAdjuster
                  ? `${claim.assignedAdjuster.firstName} ${claim.assignedAdjuster.lastName}`
                  : <span className="text-gray-400">Unassigned</span>}
              </p>
              <select
                value={reassignAdjusterId}
                onChange={(e) => setReassignAdjusterId(e.target.value)}
                className="form-input text-sm mb-2"
                data-testid="reassign-adjuster-select"
              >
                <option value="">Select adjuster...</option>
                {adjusters.map((adj) => (
                  <option key={adj.id} value={adj.id}>
                    {adj.firstName} {adj.lastName}{adj.specialty ? ` (${adj.specialty})` : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={handleReassign}
                disabled={!reassignAdjusterId || actionLoading}
                className="btn-secondary w-full justify-center text-sm"
                data-testid="reassign-submit-btn"
              >
                Reassign
              </button>
            </div>
          )}

          {/* Actions — standard review (also shown for appeal claims assigned to this adjuster) */}
          {canAct && isAssigned && (
            <div className="card p-4 sticky top-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Actions</h3>
              <div className="space-y-2">
                <button
                  onClick={() => openModal('approve')}
                  className="btn-primary w-full justify-center"
                  data-testid="approve-claim-btn"
                >
                  <CheckCircle className="h-4 w-4" />
                  Approve Claim
                </button>
                <button
                  onClick={() => openModal('reject')}
                  className="btn-danger w-full justify-center"
                  data-testid="reject-claim-btn"
                >
                  <XCircle className="h-4 w-4" />
                  Reject Claim
                </button>
                <button
                  onClick={() => openModal('requestInfo')}
                  className="btn-secondary w-full justify-center"
                  data-testid="request-info-btn"
                >
                  <HelpCircle className="h-4 w-4" />
                  Request Info
                </button>
              </div>
            </div>
          )}

          {canAct && !isAssigned && (!isAppeal || claim.originalAdjudicatorId !== user?.id) && (
            <div className="card p-4 bg-amber-50 border-amber-200">
              <p className="text-sm text-amber-700 text-center">
                {isAppeal ? 'Assign this appeal to yourself to take action. Note: you cannot review an appeal you originally decided.' : 'Assign this claim to yourself to take action.'}
              </p>
            </div>
          )}

          {['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID', 'WITHDRAWN', 'APPEAL_DENIED', 'APPEAL_APPROVED'].includes(claim.status) && (
            <div className="card p-4 bg-gray-50">
              <p className="text-sm text-gray-500 text-center">
                This claim has been {claim.status.toLowerCase().replace(/_/g, ' ')} and requires no further action.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <button
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              onClick={closeModal}
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {modal === 'approve' && 'Approve Claim'}
              {modal === 'reject' && 'Reject Claim'}
              {modal === 'requestInfo' && 'Request Additional Information'}
              {modal === 'resolveAppeal' && 'Resolve Appeal'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {modal === 'approve' && `Calculated reimbursable: ${claim.reimbursable !== undefined ? formatCurrency(claim.reimbursable) : 'N/A'}.`}
              {modal === 'reject' && 'Provide a reason for rejecting this claim.'}
              {modal === 'requestInfo' && 'Specify what additional information the patient needs to provide.'}
              {modal === 'resolveAppeal' && 'Choose your appeal decision. Approving returns the claim to UNDER_REVIEW for full adjudication. Denying closes the appeal and notifies the patient of their external review rights.'}
            </p>

            {modal === 'approve' && (
              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={overrideAmount}
                    onChange={(e) => {
                      setOverrideAmount(e.target.checked)
                      if (!e.target.checked) setAdjustedAmount('')
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    data-testid="override-amount-checkbox"
                  />
                  <span className="text-sm font-medium text-gray-700">Override eligible amount (some items not covered)</span>
                </label>
                {overrideAmount && (
                  <div className="mt-3">
                    <label className="form-label">
                      Eligible Amount <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        max={claim.eligibleAmount}
                        value={adjustedAmount}
                        onChange={(e) => setAdjustedAmount(e.target.value)}
                        className="form-input pl-7"
                        placeholder={claim.eligibleAmount !== undefined ? claim.eligibleAmount.toFixed(2) : '0.00'}
                        data-testid="adjusted-amount-input"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Maximum: {claim.eligibleAmount !== undefined ? formatCurrency(claim.eligibleAmount) : 'N/A'}. Deductible and copay will be recalculated. Notes below are required to explain the reduction.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="form-label">
                {modal === 'requestInfo' ? 'Information Required' : 'Notes'}
                {(modal === 'requestInfo' || (modal === 'approve' && overrideAmount)) && <span className="text-red-500 ml-1">*</span>}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="form-input resize-none"
                placeholder={
                  modal === 'approve'
                    ? overrideAmount
                      ? 'Explain why this amount is not fully covered...'
                      : 'Optional approval notes...'
                    : modal === 'reject'
                    ? 'Reason for rejection...'
                    : modal === 'resolveAppeal'
                    ? 'Optional notes about the appeal decision...'
                    : 'Describe what information is needed...'
                }
                data-testid="action-notes-input"
              />
            </div>

            {modal === 'resolveAppeal' && (
              <div className="mt-4 flex flex-col gap-2">
                <button
                  onClick={() => handleResolveAppeal('APPEAL_APPROVED')}
                  disabled={actionLoading}
                  className="btn-primary w-full justify-center"
                  data-testid="appeal-approve-btn"
                >
                  <CheckCircle className="h-4 w-4" />
                  {actionLoading ? 'Processing...' : 'Approve Appeal — Return to Review'}
                </button>
                <button
                  onClick={() => handleResolveAppeal('APPEAL_DENIED')}
                  disabled={actionLoading}
                  className="btn-danger w-full justify-center"
                  data-testid="appeal-deny-btn"
                >
                  <XCircle className="h-4 w-4" />
                  {actionLoading ? 'Processing...' : 'Deny Appeal'}
                </button>
                <button onClick={closeModal} className="btn-secondary w-full justify-center" disabled={actionLoading}>Cancel</button>
              </div>
            )}

            {modal !== 'resolveAppeal' && (
              <div className="mt-4 flex justify-end gap-3">
                <button
                  onClick={closeModal}
                  className="btn-secondary"
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={
                    modal === 'approve'
                      ? handleApprove
                      : modal === 'reject'
                      ? handleReject
                      : handleRequestInfo
                  }
                  disabled={
                    actionLoading ||
                    (modal === 'requestInfo' && !notes.trim()) ||
                    (modal === 'approve' && overrideAmount && (!adjustedAmount || !notes.trim()))
                  }
                  className={modal === 'reject' ? 'btn-danger' : 'btn-primary'}
                  data-testid="modal-confirm-btn"
                >
                  {actionLoading ? 'Processing...' : modal === 'approve' ? 'Confirm Approval' : modal === 'reject' ? 'Confirm Rejection' : 'Send Request'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Line adjudication modal */}
      {lineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeLineModal} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <button className="absolute top-4 right-4 text-gray-400 hover:text-gray-600" onClick={closeLineModal}>
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {lineModal.action === 'APPROVED' && 'Approve Line'}
              {lineModal.action === 'REDUCED' && 'Reduce Line'}
              {lineModal.action === 'DENIED' && 'Deny Line'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Line {lineModal.line.lineNumber} — CPT {lineModal.line.cptCode} (billed: {formatCurrency(lineModal.line.billedAmount)})
            </p>

            {lineModal.action !== 'DENIED' && (
              <div className="mb-4">
                <label className="form-label">
                  Allowed Amount {lineModal.action === 'APPROVED' ? '(leave blank to use billed amount)' : <span className="text-red-500">*</span>}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={lineAllowedAmount}
                    onChange={(e) => setLineAllowedAmount(e.target.value)}
                    className="form-input pl-7"
                    placeholder={lineModal.line.billedAmount.toFixed(2)}
                    data-testid="line-allowed-amount-input"
                  />
                </div>
              </div>
            )}

            {lineModal.action === 'DENIED' && (
              <div className="mb-4">
                <label className="form-label">Denial Reason <span className="text-red-500">*</span></label>
                <textarea
                  value={lineDenialReason}
                  onChange={(e) => setLineDenialReason(e.target.value)}
                  rows={3}
                  className="form-input resize-none"
                  placeholder="Reason for denial..."
                  data-testid="line-denial-reason-input"
                />
              </div>
            )}

            <div className="mb-4">
              <label className="form-label">Adjudicator Note (optional)</label>
              <textarea
                value={lineAdjNote}
                onChange={(e) => setLineAdjNote(e.target.value)}
                rows={2}
                className="form-input resize-none"
                placeholder="Internal note..."
                data-testid="line-adj-note-input"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={closeLineModal} className="btn-secondary" disabled={lineLoading}>Cancel</button>
              <button
                onClick={handleAdjudicateLine}
                disabled={lineLoading || (lineModal.action === 'DENIED' && !lineDenialReason.trim())}
                className={lineModal.action === 'DENIED' ? 'btn-danger' : 'btn-primary'}
                data-testid="line-adjudication-confirm-btn"
              >
                {lineLoading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ClaimReview
