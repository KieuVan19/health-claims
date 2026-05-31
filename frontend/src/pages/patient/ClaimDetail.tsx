import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  FileText,
  Download,
  Send,
  RefreshCw,
  Trash2,
  ArrowLeft,
  Calendar,
  DollarSign,
  User,
  Shield,
  Clock,
  MinusCircle,
  AlertTriangle,
  Eye,
  Edit3,
  Scale,
  GitMerge,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getClaim,
  submitClaim,
  deleteClaim,
  withdrawClaim,
  downloadEOB,
  initiateAppeal,
} from '../../api/claims'
import { downloadDocument } from '../../api/documents'
import { Claim } from '../../types'
import StatusBadge from '../../components/StatusBadge'
import ClaimTimeline from '../../components/ClaimTimeline'
import InfoRequestCard from '../../components/InfoRequestCard'
import ConfirmModal from '../../components/ConfirmModal'
import LoadingSpinner from '../../components/LoadingSpinner'
import { formatCurrency } from '../../utils/formatting'
import { CLAIM_TYPE_LABELS } from '../../constants/claimTypes'

const ClaimDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [claim, setClaim] = useState<Claim | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [downloadingEOB, setDownloadingEOB] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  const [withdrawReason, setWithdrawReason] = useState('')
  const [showAppealModal, setShowAppealModal] = useState(false)
  const [appealReason, setAppealReason] = useState('')
  const [appealing, setAppealing] = useState(false)


  const fetchClaim = async () => {
    if (!id) return
    setLoading(true)
    try {
      const data = await getClaim(id)
      setClaim(data)
    } catch {
      toast.error('Failed to load claim')
      navigate('/patient/claims')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchClaim()
  }, [id])

  const handleSubmit = async () => {
    if (!claim) return
    setSubmitting(true)
    try {
      const updated = await submitClaim(claim.id)
      setClaim(updated)
      toast.success('Claim submitted successfully!')
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string; error?: string } } }
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to submit claim')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!claim) return
    setDeleting(true)
    try {
      await deleteClaim(claim.id)
      toast.success('Claim deleted')
      navigate('/patient/claims')
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error || 'Failed to delete claim')
    } finally {
      setDeleting(false)
      setShowDeleteModal(false)
    }
  }

  const handleWithdraw = async () => {
    if (!claim) return
    setWithdrawing(true)
    try {
      const updated = await withdrawClaim(claim.id, withdrawReason || undefined)
      setClaim(updated)
      toast.success('Claim withdrawn')
      setShowWithdrawModal(false)
      setWithdrawReason('')
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error || 'Failed to withdraw claim')
    } finally {
      setWithdrawing(false)
    }
  }


  const handleAppeal = async () => {
    if (!claim || !appealReason.trim()) return
    setAppealing(true)
    try {
      const updated = await initiateAppeal(claim.id, appealReason)
      setClaim(updated)
      toast.success('Appeal submitted successfully')
      setShowAppealModal(false)
      setAppealReason('')
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error || 'Failed to submit appeal')
    } finally {
      setAppealing(false)
    }
  }

  const handleDownloadEOB = async () => {
    if (!claim) return
    setDownloadingEOB(true)
    try {
      const blob = await downloadEOB(claim.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `EOB-${claim.claimNumber}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('EOB downloaded')
    } catch {
      toast.error('Failed to download EOB')
    } finally {
      setDownloadingEOB(false)
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

  const handleView = async (docId: string) => {
    try {
      const blob = await downloadDocument(docId)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch {
      toast.error('Failed to open document')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!claim) return null

  const hasPendingInfoRequests = claim.infoRequests?.some((r) => !r.respondedAt)
  const fraudFlags: string[] = (() => {
    try { return JSON.parse(claim.fraudFlags || '[]') } catch { return [] }
  })()
  const isFraudRisk = (claim.fraudScore ?? 0) >= 50

  return (
    <div className="space-y-6">
      <Link to="/patient/claims" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to Claims
      </Link>

      {/* Fraud alert (shown to patient as a notice, not a blocking error) */}
      {isFraudRisk && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Claim under enhanced review</p>
            <p className="text-xs text-amber-700 mt-0.5">
              This claim requires additional verification. An adjuster will review it carefully.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{claim.claimNumber}</h1>
              <StatusBadge status={claim.status} patientView />
              {claim.daysOpen !== undefined && !['PAID', 'REJECTED', 'WITHDRAWN'].includes(claim.status) && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  claim.daysOpen >= 10 ? 'bg-red-100 text-red-700' :
                  claim.daysOpen >= 5 ? 'bg-amber-100 text-amber-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {claim.daysOpen}d open
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {CLAIM_TYPE_LABELS[claim.type]} &bull; Submitted {format(new Date(claim.createdAt), 'MMM d, yyyy')}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {claim.status === 'DRAFT' && (
              <>
                <Link
                  to={`/claims/${claim.id}/edit`}
                  className="btn-secondary"
                  data-testid="edit-claim-btn"
                >
                  <Edit3 className="h-4 w-4" />
                  Edit
                </Link>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="btn-secondary text-red-600 hover:text-red-700 hover:border-red-300"
                  data-testid="delete-claim-btn"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="btn-primary"
                  data-testid="submit-claim-btn"
                >
                  <Send className="h-4 w-4" />
                  {submitting ? 'Submitting...' : 'Submit Claim'}
                </button>
              </>
            )}
            {claim.status === 'SUBMITTED' && (
              <button
                onClick={() => setShowWithdrawModal(true)}
                className="btn-secondary text-slate-600"
                data-testid="withdraw-claim-btn"
              >
                <MinusCircle className="h-4 w-4" />
                Withdraw
              </button>
            )}
            {['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID'].includes(claim.status) && (
              <button
                onClick={handleDownloadEOB}
                disabled={downloadingEOB}
                className="btn-secondary"
                data-testid="download-eob-btn"
              >
                <Download className="h-4 w-4" />
                {downloadingEOB ? 'Generating...' : 'Download EOB'}
              </button>
            )}
            {claim.status === 'REJECTED' && (
              <button
                onClick={() => setShowAppealModal(true)}
                className="btn-secondary text-purple-700 border-purple-300 hover:border-purple-400"
                data-testid="file-appeal-btn"
              >
                <Scale className="h-4 w-4" />
                File Appeal
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Status progress bar */}
      <div className="card p-5">
        <ClaimTimeline
          events={[]}
          showStatusProgress
          progressOnly
          currentStatus={claim.status}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Claim Info */}
          <div className="card p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" />
              Claim Information
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
            {claim.adjusterNotes && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Adjuster Notes</label>
                <p className="mt-1 text-sm text-gray-700">{claim.adjusterNotes}</p>
              </div>
            )}
          </div>

          {/* Line Items */}
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
                      <th className="text-left py-2 pr-3">#</th>
                      <th className="text-left py-2 pr-3">CPT</th>
                      <th className="text-left py-2 pr-3">Mod</th>
                      <th className="text-right py-2 pr-3">Units</th>
                      <th className="text-right py-2 pr-3">Billed</th>
                      <th className="text-right py-2 pr-3">Allowed</th>
                      <th className="text-left py-2 pr-3">Status</th>
                      <th className="text-right py-2">Patient Resp.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {claim.lines.map((line) => {
                      const patientResp =
                        line.adjudicationStatus === 'APPROVED' || line.adjudicationStatus === 'REDUCED'
                          ? Math.max(0, line.billedAmount - (line.allowedAmount ?? 0))
                          : line.adjudicationStatus === 'DENIED'
                          ? line.billedAmount
                          : undefined
                      const statusColors: Record<string, string> = {
                        PENDING: 'text-gray-500',
                        APPROVED: 'text-green-600 font-medium',
                        REDUCED: 'text-amber-600 font-medium',
                        DENIED: 'text-red-600 font-medium',
                      }
                      return (
                        <tr key={line.id} className="border-b border-gray-50 last:border-0">
                          <td className="py-2 pr-3 text-gray-400">{line.lineNumber}</td>
                          <td className="py-2 pr-3 font-mono font-medium text-gray-900">{line.cptCode}</td>
                          <td className="py-2 pr-3 font-mono text-gray-500">{line.modifier || '—'}</td>
                          <td className="py-2 pr-3 text-right">{line.units}</td>
                          <td className="py-2 pr-3 text-right">{formatCurrency(line.billedAmount)}</td>
                          <td className="py-2 pr-3 text-right">
                            {line.allowedAmount != null ? formatCurrency(line.allowedAmount) : '—'}
                          </td>
                          <td className={`py-2 pr-3 ${statusColors[line.adjudicationStatus] ?? ''}`}>
                            {line.adjudicationStatus.charAt(0) + line.adjudicationStatus.slice(1).toLowerCase()}
                          </td>
                          <td className="py-2 text-right">
                            {patientResp != null ? formatCurrency(patientResp) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="border-t border-gray-200">
                    <tr>
                      <td colSpan={4} className="py-2 pr-3 text-xs font-semibold text-gray-500 uppercase">Totals</td>
                      <td className="py-2 pr-3 text-right font-semibold">
                        {formatCurrency(claim.lines.reduce((s, l) => s + l.billedAmount, 0))}
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold text-green-700">
                        {claim.totalAllowed != null ? formatCurrency(claim.totalAllowed) : '—'}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Info Requests */}
          {claim.infoRequests && claim.infoRequests.length > 0 && (
            <div className="card p-5">
              <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Clock className="h-4 w-4 text-orange-500" />
                Information Requests
                {hasPendingInfoRequests && (
                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Action Required</span>
                )}
              </h2>
              <div className="space-y-3">
                {claim.infoRequests.map((req) => (
                  <InfoRequestCard
                    key={req.id}
                    infoRequest={req}
                    claimId={claim.id}
                    onResponded={fetchClaim}
                  />
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
                {(() => {
                  const sorted = [...claim.documents].sort((a, b) => {
                    const aEob = a.type === 'EOB' || a.isSystemGenerated
                    const bEob = b.type === 'EOB' || b.isSystemGenerated
                    if (aEob !== bEob) return aEob ? -1 : 1
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                  })
                  const latestEobId = sorted.find((d) => d.type === 'EOB' || d.isSystemGenerated)?.id
                  return sorted.map((doc) => {
                  const isPreviewable = doc.mimeType.startsWith('image/') || doc.mimeType === 'application/pdf'
                  const isEob = doc.type === 'EOB' || doc.isSystemGenerated
                  const isLatestEob = isEob && doc.id === latestEobId
                  return (
                    <li
                      key={doc.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${isEob ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}
                      data-testid="document-item"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className={`h-4 w-4 flex-shrink-0 ${isEob ? 'text-blue-600' : 'text-blue-500'}`} />
                        <span className="text-sm text-gray-700 truncate">{doc.originalName}</span>
                        {isEob && (
                          <span className="text-xs font-medium text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded flex-shrink-0">
                            EOB
                          </span>
                        )}
                        {isLatestEob && (
                          <span className="text-xs font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded flex-shrink-0">
                            Latest
                          </span>
                        )}
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {(doc.size / 1024).toFixed(1)} KB
                        </span>
                      </div>
                      <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                        {isPreviewable && (
                          <button
                            onClick={() => handleView(doc.id)}
                            className="text-blue-600 hover:text-blue-700 p-1 rounded hover:bg-blue-50 transition-colors"
                            title="Open"
                            data-testid="preview-doc-btn"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDownload(doc.id, doc.originalName)}
                          className="text-blue-600 hover:text-blue-700 p-1 rounded hover:bg-blue-50 transition-colors"
                          title="Download"
                          data-testid="download-doc-btn"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  )
                })})()}
              </ul>
            )}
          </div>

          {/* Activity log */}
          <div className="card p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Activity Timeline</h2>
            <ClaimTimeline
              events={claim.events ?? []}
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
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
                  <span>{formatCurrency(claim.policy.coverageAmount ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Deductible</span>
                  <span>{formatCurrency(claim.policy.deductible)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Copay Rate</span>
                  <span>{claim.policy.copayPercentage}%</span>
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
              {new Date(claim.policy.expiryDate) < new Date() && (
                <p className="mt-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">Policy expired</p>
              )}
            </div>
          )}

          {claim.adjuster && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <User className="h-4 w-4 text-blue-600" />
                Assigned Adjuster
              </h3>
              <p className="text-sm text-gray-900">{claim.adjuster.firstName} {claim.adjuster.lastName}</p>
              <p className="text-xs text-gray-500">{claim.adjuster.email}</p>
            </div>
          )}

          {claim.payout && (
            <div className="card p-4 border-teal-200 bg-teal-50">
              <h3 className="text-sm font-semibold text-teal-900 mb-3 flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-teal-600" />
                Payment Details
              </h3>
              <div className="space-y-1 text-xs text-teal-800">
                <div className="flex justify-between">
                  <span>Amount Paid</span>
                  <span className="font-bold">{formatCurrency(claim.payout.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Payment Ref</span>
                  <span className="font-mono">{claim.payout.paymentRef}</span>
                </div>
                <div className="flex justify-between">
                  <span>Paid On</span>
                  <span>{format(new Date(claim.payout.paidAt), 'MMM d, yyyy')}</span>
                </div>
                {claim.payout.notes && (
                  <div className="pt-1 border-t border-teal-200">
                    <p className="text-teal-700">{claim.payout.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* COB linked claims */}
          {claim.cobFlag && (claim.secondaryClaim || claim.primaryClaim) && (
            <div className="card p-4 border-cyan-200 bg-cyan-50">
              <h3 className="text-sm font-semibold text-cyan-900 mb-3 flex items-center gap-2">
                <GitMerge className="h-4 w-4 text-cyan-600" />
                Coordination of Benefits
              </h3>
              {claim.secondaryClaim && (
                <div className="text-xs text-cyan-800 space-y-1">
                  <p className="font-medium">Secondary Claim</p>
                  <div className="flex justify-between">
                    <span>Claim #</span>
                    <span className="font-mono">{claim.secondaryClaim.claimNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Status</span>
                    <span>{claim.secondaryClaim.status}</span>
                  </div>
                  {claim.secondaryClaim.payout && (
                    <div className="flex justify-between">
                      <span>Secondary Paid</span>
                      <span className="font-bold">{formatCurrency(claim.secondaryClaim.payout.amount)}</span>
                    </div>
                  )}
                </div>
              )}
              {claim.primaryClaim && (
                <div className="text-xs text-cyan-800 space-y-1">
                  <p className="font-medium">Primary Claim</p>
                  <div className="flex justify-between">
                    <span>Claim #</span>
                    <span className="font-mono">{claim.primaryClaim.claimNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Status</span>
                    <span>{claim.primaryClaim.status}</span>
                  </div>
                  {claim.primaryClaim.payout && (
                    <div className="flex justify-between">
                      <span>Primary Paid</span>
                      <span className="font-bold">{formatCurrency(claim.primaryClaim.payout.amount)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirm modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        title="Delete Claim"
        message="Are you sure you want to delete this draft claim? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteModal(false)}
      />

      {/* Withdraw modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowWithdrawModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Withdraw Claim</h3>
            <p className="text-sm text-gray-500 mb-4">
              This will cancel the claim. You can submit a new claim later if needed.
            </p>
            <div>
              <label className="form-label">Reason (optional)</label>
              <textarea
                value={withdrawReason}
                onChange={(e) => setWithdrawReason(e.target.value)}
                rows={3}
                className="form-input resize-none"
                placeholder="Why are you withdrawing this claim?"
                data-testid="withdraw-reason-input"
              />
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => setShowWithdrawModal(false)} className="btn-secondary">Cancel</button>
              <button
                onClick={handleWithdraw}
                disabled={withdrawing}
                className="btn-secondary text-slate-700 border-slate-300"
                data-testid="confirm-withdraw-btn"
              >
                <MinusCircle className="h-4 w-4" />
                {withdrawing ? 'Withdrawing...' : 'Withdraw Claim'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Appeal modal */}
      {showAppealModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAppealModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">File an Internal Appeal</h3>
            <p className="text-sm text-gray-500 mb-4">
              Under the ACA you have the right to an internal appeal. A different adjudicator will review your claim. Please explain why you believe this claim should be approved.
            </p>
            <div>
              <label className="form-label">
                Reason for Appeal <span className="text-red-500">*</span>
              </label>
              <textarea
                value={appealReason}
                onChange={(e) => setAppealReason(e.target.value)}
                rows={4}
                className="form-input resize-none"
                placeholder="Describe why you are appealing this decision..."
                data-testid="appeal-reason-input"
              />
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => { setShowAppealModal(false); setAppealReason('') }} className="btn-secondary">Cancel</button>
              <button
                onClick={handleAppeal}
                disabled={appealing || !appealReason.trim()}
                className="btn-primary"
                data-testid="confirm-appeal-btn"
              >
                <Scale className="h-4 w-4" />
                {appealing ? 'Submitting...' : 'Submit Appeal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ClaimDetail
