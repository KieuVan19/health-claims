import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Save, Send, Plus, X as XIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import { getClaim, updateClaim, submitClaim } from '../../api/claims'
import { Claim, ClaimType } from '../../types'
import ICD10Input from '../../components/ICD10Input'
import LoadingSpinner from '../../components/LoadingSpinner'

const ICD10_REGEX = /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/

const claimTypes: { value: ClaimType; label: string }[] = [
  { value: 'HOSPITALIZATION', label: 'Hospitalization' },
  { value: 'OUTPATIENT', label: 'Outpatient' },
  { value: 'DENTAL', label: 'Dental' },
  { value: 'VISION', label: 'Vision' },
  { value: 'PHARMACY', label: 'Pharmacy' },
]

interface FormData {
  type: ClaimType
  description: string
  incidentDate: string
  totalAmount: string
}

const EditClaim: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [claim, setClaim] = useState<Claim | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<FormData>({
    type: 'OUTPATIENT',
    description: '',
    incidentDate: '',
    totalAmount: '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [diagnosisCodes, setDiagnosisCodes] = useState<string[]>([''])
  const [diagnosisErrors, setDiagnosisErrors] = useState<(string | null)[]>([null])

  useEffect(() => {
    if (!id) return
    getClaim(id)
      .then((data) => {
        setClaim(data)
        setForm({
          type: data.type,
          description: data.description,
          incidentDate: data.incidentDate ? data.incidentDate.split('T')[0] : '',
          totalAmount: String(data.totalAmount),
        })
        const existing = data.diagnosisCodes && data.diagnosisCodes.length > 0 ? data.diagnosisCodes : ['']
        setDiagnosisCodes(existing)
        setDiagnosisErrors(existing.map(() => null))
      })
      .catch(() => {
        toast.error('Failed to load claim')
        navigate('/claims')
      })
      .finally(() => setLoading(false))
  }, [id, navigate])

  const validate = (): boolean => {
    const errs: Partial<Record<keyof FormData, string>> = {}
    if (!form.type) errs.type = 'Claim type is required'
    if (form.description.trim().length < 10) errs.description = 'Description must be at least 10 characters'
    if (!form.incidentDate) {
      errs.incidentDate = 'Incident date is required'
    } else if (new Date(form.incidentDate) > new Date()) {
      errs.incidentDate = 'Incident date must be today or in the past'
    }
    if (!form.totalAmount || isNaN(Number(form.totalAmount)) || Number(form.totalAmount) <= 0) {
      errs.totalAmount = 'Amount must be a positive number'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleChange = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const getValidDiagnosisCodes = () => diagnosisCodes.filter((c) => c.trim() !== '')

  const handleDiagnosisChange = (index: number, value: string) => {
    const upper = value.toUpperCase()
    const updated = [...diagnosisCodes]
    updated[index] = upper
    setDiagnosisCodes(updated)
    const errs = [...diagnosisErrors]
    if (upper === '' || ICD10_REGEX.test(upper)) {
      errs[index] = null
    } else {
      errs[index] = 'Invalid ICD-10 format (e.g. A01, B02.1)'
    }
    setDiagnosisErrors(errs)
  }

  const addDiagnosisRow = () => {
    if (diagnosisCodes.length >= 12) return
    setDiagnosisCodes([...diagnosisCodes, ''])
    setDiagnosisErrors([...diagnosisErrors, null])
  }

  const removeDiagnosisRow = (index: number) => {
    setDiagnosisCodes(diagnosisCodes.filter((_, i) => i !== index))
    setDiagnosisErrors(diagnosisErrors.filter((_, i) => i !== index))
  }

  const handleSaveDraft = async () => {
    if (!validate() || !id) return
    setSaving(true)
    try {
      await updateClaim(id, {
        type: form.type,
        description: form.description.trim(),
        incidentDate: form.incidentDate,
        totalAmount: Number(form.totalAmount),
        diagnosisCodes: getValidDiagnosisCodes(),
      })
      toast.success('Draft saved')
      navigate(`/claims/${id}`)
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Failed to save draft')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAndSubmit = async () => {
    if (!validate() || !id) return
    setSubmitting(true)
    try {
      await updateClaim(id, {
        type: form.type,
        description: form.description.trim(),
        incidentDate: form.incidentDate,
        totalAmount: Number(form.totalAmount),
        diagnosisCodes: getValidDiagnosisCodes(),
      })
      await submitClaim(id)
      toast.success('Claim submitted successfully!')
      navigate(`/claims/${id}`)
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string; message?: string } } }
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to submit claim')
    } finally {
      setSubmitting(false)
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

  if (claim.status !== 'DRAFT') {
    return (
      <div className="max-w-6xl mx-auto space-y-4">
        <Link to={`/claims/${id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> Back to Claim
        </Link>
        <div className="card p-6 text-center">
          <p className="text-gray-600">This claim cannot be edited because it is no longer a draft.</p>
          <Link to={`/claims/${id}`} className="btn-primary mt-4 inline-flex">View Claim</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Link to={`/claims/${id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to Claim
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Edit Claim</h1>
        <p className="text-sm text-gray-500 mt-0.5">{claim.claimNumber} &mdash; Draft</p>
      </div>

      <div className="card p-6">
        <form
          data-testid="edit-claim-form"
          noValidate
          onSubmit={(e) => { e.preventDefault(); void handleSaveDraft() }}
          className="space-y-5"
        >
          <div>
            <label className="form-label" htmlFor="claim-type">Claim Type</label>
            <select
              id="claim-type"
              data-testid="claim-type-select"
              className={`form-input ${errors.type ? 'border-red-500' : ''}`}
              value={form.type}
              onChange={(e) => handleChange('type', e.target.value)}
            >
              {claimTypes.map((ct) => (
                <option key={ct.value} value={ct.value}>{ct.label}</option>
              ))}
            </select>
            {errors.type && <p className="form-error">{errors.type}</p>}
          </div>

          <div>
            <label className="form-label" htmlFor="claim-description">Description</label>
            <textarea
              id="claim-description"
              data-testid="claim-description-input"
              rows={4}
              className={`form-input resize-none ${errors.description ? 'border-red-500' : ''}`}
              placeholder="Describe the medical service or treatment (minimum 10 characters)..."
              value={form.description}
              onChange={(e) => handleChange('description', e.target.value)}
            />
            {errors.description && <p className="form-error">{errors.description}</p>}
          </div>

          <div>
            <label className="form-label">ICD-10 Diagnosis Codes</label>
            <p className="text-xs text-gray-500 mb-2">
              Type a code (e.g. R07.9) or a plain-language name (e.g. chest pain) to search. Primary diagnosis first. Up to 12 codes.
            </p>
            <div className="space-y-2">
              {diagnosisCodes.map((code, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="text-xs text-gray-400 w-16 shrink-0 pt-2">
                    {index === 0 ? 'Primary' : `Secondary ${index}`}
                  </span>
                  <ICD10Input
                    value={code}
                    onChange={(v) => handleDiagnosisChange(index, v)}
                    error={diagnosisErrors[index]}
                    testId={`diagnosis-code-input-${index}`}
                  />
                  {diagnosisCodes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDiagnosisRow(index)}
                      className="text-gray-400 hover:text-red-500 transition-colors pt-2"
                      data-testid={`remove-diagnosis-${index}`}
                    >
                      <XIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {diagnosisCodes.length < 12 && (
              <button
                type="button"
                onClick={addDiagnosisRow}
                className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                data-testid="add-diagnosis-btn"
              >
                <Plus className="h-3 w-3" /> Add code
              </button>
            )}
          </div>

          <div>
            <label className="form-label" htmlFor="claim-date">Incident / Service Date</label>
            <input
              id="claim-date"
              type="date"
              data-testid="claim-date-input"
              max={new Date().toISOString().split('T')[0]}
              className={`form-input ${errors.incidentDate ? 'border-red-500' : ''}`}
              value={form.incidentDate}
              onChange={(e) => handleChange('incidentDate', e.target.value)}
            />
            {errors.incidentDate && <p className="form-error">{errors.incidentDate}</p>}
          </div>

          <div>
            <label className="form-label" htmlFor="claim-amount">Total Amount Claimed ($)</label>
            <input
              id="claim-amount"
              type="number"
              data-testid="claim-amount-input"
              step="0.01"
              min="0.01"
              className={`form-input ${errors.totalAmount ? 'border-red-500' : ''}`}
              placeholder="0.00"
              value={form.totalAmount}
              onChange={(e) => handleChange('totalAmount', e.target.value)}
            />
            {errors.totalAmount && <p className="form-error">{errors.totalAmount}</p>}
          </div>

          <div className="flex flex-wrap justify-end gap-3 pt-2 border-t border-gray-100">
            <Link to={`/claims/${id}`} className="btn-secondary">
              Cancel
            </Link>
            <button
              type="button"
              data-testid="save-draft-btn"
              disabled={saving || submitting}
              className="btn-secondary"
              onClick={() => void handleSaveDraft()}
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              type="button"
              data-testid="save-submit-btn"
              disabled={saving || submitting}
              className="btn-primary"
              onClick={() => void handleSaveAndSubmit()}
            >
              <Send className="h-4 w-4" />
              {submitting ? 'Submitting...' : 'Save & Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EditClaim
