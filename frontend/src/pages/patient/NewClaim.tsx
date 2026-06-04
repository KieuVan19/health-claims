import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Hospital,
  Stethoscope,
  Smile,
  Eye,
  Pill,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  Save,
  Send,
  Trash2,
  Plus,
  X as XIcon,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { createClaim, executeClaimAction, deleteClaim } from '../../api/claims'
import { uploadDocuments } from '../../api/documents'
import { getPolicies } from '../../api/policies'
import { getCoverageSummary } from '../../api/users'
import { getProviders } from '../../api/providers'
import { getFeatureFlags } from '../../api/features'
import { Policy, ClaimType, CoverageSummary, Provider, ClaimLineInput } from '../../types'
import FileUpload from '../../components/FileUpload'
import ICD10Input from '../../components/ICD10Input'
import LoadingSpinner from '../../components/LoadingSpinner'
import { formatCurrency } from '../../utils/formatting'

const ICD10_REGEX = /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/
const CPT_REGEX = /^\d{5}$/
const MODIFIER_REGEX = /^[A-Z0-9]{2}$/

const emptyLine = (): ClaimLineInput & { _cptError?: string; _modifierError?: string } => ({
  cptCode: '',
  modifier: '',
  diagnosisPointers: [0],
  units: 1,
  billedAmount: 0,
  _cptError: undefined,
  _modifierError: undefined,
})

const claimTypes: { type: ClaimType; label: string; icon: React.ElementType; description: string }[] = [
  { type: 'HOSPITALIZATION', label: 'Hospitalization', icon: Hospital, description: 'Inpatient hospital stays' },
  { type: 'OUTPATIENT', label: 'Outpatient', icon: Stethoscope, description: 'Doctor visits & consultations' },
  { type: 'DENTAL', label: 'Dental', icon: Smile, description: 'Dental procedures & treatments' },
  { type: 'VISION', label: 'Vision', icon: Eye, description: 'Eye exams, glasses & contacts' },
  { type: 'PHARMACY', label: 'Pharmacy', icon: Pill, description: 'Prescription medications' },
]

const detailsSchema = z.object({
  policyId: z.string().min(1, 'Please select a policy'),
  providerName: z.string().min(1, 'Treating Provider is required'),
  incidentDate: z.string()
    .min(1, 'Incident date is required')
    .refine((v) => {
      const date = new Date(v)
      return !isNaN(date.getTime()) && date <= new Date()
    }, 'Incident date must be today or in the past'),
  description: z.string().min(10, 'Please provide at least 10 characters of description'),
  totalAmount: z
    .string()
    .min(1, 'Amount is required')
    .refine((v) => !isNaN(Number(v)) && Number(v) > 0, 'Amount must be a positive number'),
})

type DetailsFormData = z.infer<typeof detailsSchema>

type Step = 'type' | 'details' | 'documents' | 'review'
const steps: Step[] = ['type', 'details', 'documents', 'review']
const stepLabels = ['Claim Type', 'Details', 'Documents', 'Review']

const NewClaim: React.FC = () => {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState<Step>('type')
  const [selectedType, setSelectedType] = useState<ClaimType | null>(null)
  const [policies, setPolicies] = useState<Policy[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [loadingPolicies, setLoadingPolicies] = useState(true)
  const [coverageSummaries, setCoverageSummaries] = useState<CoverageSummary[]>([])
  const [createdClaimId, setCreatedClaimId] = useState<string | null>(null)
  const [filingDeadlineWarning, setFilingDeadlineWarning] = useState<string | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
  const [providerLoading, setProviderLoading] = useState(false)
  const [diagnosisCodes, setDiagnosisCodes] = useState<string[]>([''])
  const [diagnosisErrors, setDiagnosisErrors] = useState<(string | null)[]>([null])
  const [lineItems, setLineItems] = useState<(ClaimLineInput & { _cptError?: string; _modifierError?: string })[]>([emptyLine()])
  const [diagnosisCodesEnabled, setDiagnosisCodesEnabled] = useState(true)
  const [cptCodesEnabled, setCptCodesEnabled] = useState(true)
  const [outOfNetworkEnabled, setOutOfNetworkEnabled] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    getValues,
  } = useForm<DetailsFormData>({
    resolver: zodResolver(detailsSchema),
  })

  const watchPolicyId = watch('policyId')
  const watchAmount = watch('totalAmount')
  const watchIncidentDate = watch('incidentDate')
  const watchProviderName = watch('providerName')

  useEffect(() => {
    if (!watchIncidentDate || !selectedPolicy) {
      setFilingDeadlineWarning(null)
      return
    }
    const incident = new Date(watchIncidentDate)
    if (isNaN(incident.getTime())) { setFilingDeadlineWarning(null); return }
    const deadlineDays = selectedPolicy.filingDeadlineDays ?? 365
    const msPerDay = 1000 * 60 * 60 * 24
    const daysSinceIncident = Math.floor((Date.now() - incident.getTime()) / msPerDay)
    const daysRemaining = deadlineDays - daysSinceIncident
    if (daysRemaining <= 0) {
      setFilingDeadlineWarning(null)
    } else if (daysRemaining <= 30) {
      setFilingDeadlineWarning(
        `Filing deadline warning: You have ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left to submit this claim (deadline: ${deadlineDays} days from the incident date).`
      )
    } else {
      setFilingDeadlineWarning(null)
    }
  }, [watchIncidentDate, selectedPolicy])

  useEffect(() => {
    const now = new Date()
    Promise.all([getPolicies(), getCoverageSummary(), getFeatureFlags()])
      .then(([data, summaries, flags]) => {
        const validPolicies = data
          .filter((p) => p.isActive)
          .filter((p) => new Date(p.expiryDate) > now)
        setPolicies(validPolicies)
        setCoverageSummaries(summaries)
        setDiagnosisCodesEnabled(flags.diagnosisCodesEnabled)
        setCptCodesEnabled(flags.cptCodesEnabled)
        setOutOfNetworkEnabled(flags.outOfNetworkEnabled)
      })
      .catch(() => {})
      .finally(() => setLoadingPolicies(false))
  }, [])

  useEffect(() => {
    if (!watchProviderName || watchProviderName.length < 2) {
      setProviders([])
      return
    }
    setProviderLoading(true)
    getProviders({ search: watchProviderName, limit: 10 })
      .then((res) => setProviders(res.data))
      .catch(() => setProviders([]))
      .finally(() => setProviderLoading(false))
  }, [watchProviderName])

  useEffect(() => {
    if (watchPolicyId) {
      const policy = policies.find((p) => p.id === watchPolicyId)
      setSelectedPolicy(policy ?? null)
    } else {
      setSelectedPolicy(null)
    }
  }, [watchPolicyId, policies])

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

  const updateLineItem = (
    index: number,
    field: keyof (ClaimLineInput & { _cptError?: string; _modifierError?: string }),
    value: unknown,
  ) => {
    const updated = lineItems.map((l, i) => (i === index ? { ...l, [field]: value } : l))
    if (field === 'cptCode') {
      const v = value as string
      updated[index]._cptError = v === '' || CPT_REGEX.test(v) ? undefined : 'CPT code must be exactly 5 digits'
    }
    if (field === 'modifier') {
      const v = (value as string).toUpperCase()
      updated[index].modifier = v
      updated[index]._modifierError = v === '' || MODIFIER_REGEX.test(v) ? undefined : 'Modifier must be 2 uppercase alphanumeric characters'
    }
    setLineItems(updated)
  }

  const addLineItem = () => setLineItems([...lineItems, emptyLine()])

  const removeLineItem = (index: number) => {
    if (lineItems.length <= 1) return
    setLineItems(lineItems.filter((_, i) => i !== index))
  }

  const getValidLineItems = (): ClaimLineInput[] =>
    lineItems
      .filter((l) => l.cptCode.trim() !== '' && CPT_REGEX.test(l.cptCode) && l.billedAmount > 0 && l.units > 0)
      .map((l) => ({
        cptCode: l.cptCode,
        modifier: l.modifier && MODIFIER_REGEX.test(l.modifier) ? l.modifier : undefined,
        diagnosisPointers: l.diagnosisPointers,
        units: l.units,
        billedAmount: l.billedAmount,
      }))

  const calculateEligibility = () => {
    if (!selectedPolicy || !watchAmount) return null
    const amount = Number(watchAmount)
    if (isNaN(amount) || amount <= 0) return null

    const isOutOfNetwork = outOfNetworkEnabled && selectedProvider && !selectedProvider.inNetwork
    const deductible = selectedPolicy.deductible ?? 0
    const copay = isOutOfNetwork
      ? selectedPolicy.oonCopayPercent ?? selectedPolicy.copayPercentage ?? 0
      : selectedPolicy.copayPercentage ?? 0
    const coverage = selectedPolicy.coverageAmount ?? selectedPolicy.coverageLimit ?? 0
    const oopMax = selectedPolicy.oopMax ?? Infinity

    const summary = coverageSummaries.find((s) => s.policy.id === selectedPolicy.id)
    const deductiblePaid = summary?.inNetworkDeductiblePaid ?? 0
    const oopPaid = summary?.inNetworkOopPaid ?? 0

    const eligibleAmount = Math.min(amount, coverage)
    const remainingOop = Math.max(0, oopMax - oopPaid)

    if (remainingOop === 0) {
      return { deductible: 0, eligible: eligibleAmount, reimbursable: eligibleAmount, copay: 0, isOutOfNetwork }
    }

    const remainingDeductible = Math.max(0, deductible - deductiblePaid)
    const deductibleApplied = Math.min(eligibleAmount, remainingDeductible)
    const afterDeductible = Math.max(0, eligibleAmount - deductibleApplied)
    const rawCopay = afterDeductible * (copay / 100)
    const totalCostSharing = deductibleApplied + rawCopay

    let actualDeductible = deductibleApplied
    let actualCopay = rawCopay
    if (totalCostSharing > remainingOop) {
      actualDeductible = Math.min(deductibleApplied, remainingOop)
      actualCopay = Math.min(rawCopay, remainingOop - actualDeductible)
    }

    const reimbursable = eligibleAmount - actualDeductible - actualCopay
    return { deductible: actualDeductible, eligible: afterDeductible, reimbursable, copay, isOutOfNetwork }
  }

  const eligibility = calculateEligibility()
  const currentStepIndex = steps.indexOf(currentStep)

  const goNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStep(steps[currentStepIndex + 1])
    }
  }

  const goBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStep(steps[currentStepIndex - 1])
    }
  }

  const handleContinueFromType = () => {
    if (!loadingPolicies && policies.length === 0) {
      toast.error('Your policy has expired. You cannot submit a new claim.')
      return
    }
    goNext()
  }

  const handleDetailsSubmit = () => {
    goNext()
  }

  const handleSaveDraft = async () => {
    const data = getValues()
    if (!selectedType) {
      toast.error('Please select a claim type first')
      return
    }
    setSaving(true)
    const validLines = cptCodesEnabled ? getValidLineItems() : []
    try {
      // Find provider ID from the entered name
      const matchedProvider = providers.find(p => p.name.toLowerCase() === data.providerName.toLowerCase()) || selectedProvider
      const claim = await createClaim({
        type: selectedType,
        policyId: data.policyId,
        incidentDate: data.incidentDate,
        description: data.description,
        totalAmount: Number(data.totalAmount),
        ...(matchedProvider ? { providerId: matchedProvider.id } : {}),
        ...(diagnosisCodesEnabled ? { diagnosisCodes: getValidDiagnosisCodes() } : {}),
        ...(validLines.length > 0 ? { lines: validLines } : {}),
      } as Parameters<typeof createClaim>[0])
      setCreatedClaimId(claim.id)
      if (files.length > 0) {
        await uploadDocuments(claim.id, files)
      }
      toast.success('Claim saved as draft')
      navigate(`/patient/claims/${claim.id}`)
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Failed to save draft')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!createdClaimId) {
      navigate('/patient/claims')
      return
    }
    setDeleting(true)
    try {
      await deleteClaim(createdClaimId)
      toast.success('Claim deleted')
      navigate('/patient/claims')
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Failed to delete claim')
    } finally {
      setDeleting(false)
    }
  }

  const handleSubmitClaim = async () => {
    const data = getValues()
    if (!selectedType) return
    setSubmitting(true)
    const validLines = cptCodesEnabled ? getValidLineItems() : []
    try {
      let claimId = createdClaimId
      if (!claimId) {
        // Find provider ID from the entered name
        const matchedProvider = providers.find(p => p.name.toLowerCase() === data.providerName.toLowerCase()) || selectedProvider
        const claim = await createClaim({
          type: selectedType,
          policyId: data.policyId,
          incidentDate: data.incidentDate,
          description: data.description,
          totalAmount: Number(data.totalAmount),
          ...(matchedProvider ? { providerId: matchedProvider.id } : {}),
          ...(diagnosisCodesEnabled ? { diagnosisCodes: getValidDiagnosisCodes() } : {}),
          ...(validLines.length > 0 ? { lines: validLines } : {}),
        } as Parameters<typeof createClaim>[0])
        claimId = claim.id
        setCreatedClaimId(claimId)
      }
      if (files.length > 0) {
        await uploadDocuments(claimId, files)
      }
      await executeClaimAction(claimId, 'SUBMIT', {}) as any
      toast.success('Claim submitted successfully!')
      navigate(`/patient/claims/${claimId}`)
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string; message?: string } } }
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to submit claim')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New Claim</h1>
        <p className="text-sm text-gray-500 mt-0.5">Complete the steps below to submit your claim</p>
      </div>

      {/* Step Indicator */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <React.Fragment key={step}>
              <div className="flex items-center gap-2">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                    currentStepIndex > index
                      ? 'bg-green-500 text-white'
                      : currentStepIndex === index
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {currentStepIndex > index ? <CheckCircle className="h-5 w-5" /> : index + 1}
                </div>
                <span
                  className={`text-sm font-medium hidden sm:block ${
                    currentStepIndex === index ? 'text-blue-600' : currentStepIndex > index ? 'text-green-600' : 'text-gray-400'
                  }`}
                >
                  {stepLabels[index]}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${currentStepIndex > index ? 'bg-green-400' : 'bg-gray-200'}`} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Step Content */}

      {/* Step 1: Type Selection */}
      {currentStep === 'type' && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Claim Type</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {claimTypes.map(({ type, label, icon: Icon, description }) => (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedType(type)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  selectedType === type
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
                data-testid={`claim-type-${type.toLowerCase()}`}
              >
                <div className={`inline-flex p-2 rounded-lg mb-2 ${selectedType === type ? 'bg-blue-600' : 'bg-gray-100'}`}>
                  <Icon className={`h-5 w-5 ${selectedType === type ? 'text-white' : 'text-gray-600'}`} />
                </div>
                <p className="font-semibold text-sm text-gray-900">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{description}</p>
              </button>
            ))}
          </div>
          <div className="flex justify-end mt-6">
            <button
              type="button"
              onClick={handleContinueFromType}
              disabled={!selectedType}
              className="btn-primary"
              data-testid="next-step-btn"
            >
              Continue <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Details */}
      {currentStep === 'details' && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Claim Details</h2>
          <form onSubmit={handleSubmit(handleDetailsSubmit)} noValidate className="space-y-4">
            <div>
              <label className="form-label" htmlFor="claimType">Claim Type</label>
              <select
                id="claimType"
                className="form-input"
                value={selectedType ?? ''}
                onChange={(e) => setSelectedType(e.target.value as ClaimType)}
                data-testid="claim-type-select"
              >
                {claimTypes.map(({ type, label }) => (
                  <option key={type} value={type}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label" htmlFor="policyId">Insurance Policy</label>
              {loadingPolicies ? (
                <LoadingSpinner size="sm" />
              ) : (
                <select
                  id="policyId"
                  className={`form-input ${errors.policyId ? 'border-red-500' : ''}`}
                  data-testid="policy-select"
                  {...register('policyId')}
                >
                  <option value="">Select a policy...</option>
                  {policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.type})
                    </option>
                  ))}
                </select>
              )}
              {errors.policyId && <p className="form-error">{errors.policyId.message}</p>}
            </div>

            {/* Treating Provider — always visible and required */}
            <div>
              <label className="form-label" htmlFor="providerName">Treating Provider</label>
              <div className="relative">
                <input
                  id="providerName"
                  type="text"
                  className={`form-input ${errors.providerName ? 'border-red-500' : ''}`}
                  placeholder="Enter provider name or search..."
                  data-testid="provider-name-input"
                  autoComplete="off"
                  {...register('providerName')}
                />
                {providerLoading && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">Searching…</span>
                )}
                {providers.length > 0 && watchProviderName && watchProviderName.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto">
                    {providers.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors"
                          onClick={() => {
                            setValue('providerName', p.name)
                            setSelectedProvider(p)
                            setProviders([])
                          }}
                        >
                          <p className="text-sm font-medium text-gray-900">{p.name}</p>
                          <p className="text-xs text-gray-500">
                            NPI: {p.npi} &middot; {p.specialty ?? p.providerType}
                            {outOfNetworkEnabled && (
                              <>
                                {' '}&middot; {p.inNetwork ? <span className="text-green-600">In-Network</span> : <span className="text-amber-600">Out-of-Network</span>}
                              </>
                            )}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {errors.providerName && <p className="form-error">{errors.providerName.message}</p>}
            </div>

            <div>
              <label className="form-label" htmlFor="incidentDate">Incident / Service Date</label>
              <input
                id="incidentDate"
                type="date"
                max={new Date().toISOString().split('T')[0]}
                className={`form-input ${errors.incidentDate ? 'border-red-500' : ''}`}
                data-testid="incident-date-input"
                {...register('incidentDate')}
              />
              {errors.incidentDate && <p className="form-error">{errors.incidentDate.message}</p>}
              {!errors.incidentDate && filingDeadlineWarning && (
                <p className="mt-1 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {filingDeadlineWarning}
                </p>
              )}
            </div>

            <div>
              <label className="form-label" htmlFor="totalAmount">Total Amount Claimed ($)</label>
              <input
                id="totalAmount"
                type="number"
                step="0.01"
                min="0.01"
                className={`form-input ${errors.totalAmount ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                placeholder="0.00"
                data-testid="amount-input"
                {...register('totalAmount')}
              />
              {errors.totalAmount && <p className="form-error">{errors.totalAmount.message}</p>}
            </div>

            <div>
              <label className="form-label" htmlFor="description">Description</label>
              <textarea
                id="description"
                rows={4}
                className={`form-input resize-none ${errors.description ? 'border-red-500' : ''}`}
                placeholder="Describe the medical service or treatment..."
                data-testid="description-input"
                {...register('description')}
              />
              {errors.description && <p className="form-error">{errors.description.message}</p>}
            </div>

            {/* Diagnosis Codes */}
            {diagnosisCodesEnabled && <div>
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
            </div>}

            {/* CPT Line Items */}
            {cptCodesEnabled && <div>
              <label className="form-label">CPT Procedure Codes (optional)</label>
              <p className="text-xs text-gray-500 mb-2">
                Each service billed becomes a line item with its own CPT code (5 digits), units, and amount.
              </p>
              <div className="space-y-3">
                {lineItems.map((line, idx) => (
                  <div key={idx} className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-600">Line {idx + 1}</span>
                      {lineItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLineItem(idx)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <XIcon className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500">CPT Code *</label>
                        <input
                          type="text"
                          className={`form-input font-mono text-sm ${line._cptError ? 'border-red-500' : ''}`}
                          placeholder="12345"
                          maxLength={5}
                          value={line.cptCode}
                          onChange={(e) => updateLineItem(idx, 'cptCode', e.target.value)}
                          data-testid={`cpt-code-input-${idx}`}
                        />
                        {line._cptError && <p className="text-xs text-red-500 mt-0.5">{line._cptError}</p>}
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Modifier (optional)</label>
                        <input
                          type="text"
                          className={`form-input font-mono text-sm uppercase ${line._modifierError ? 'border-red-500' : ''}`}
                          placeholder="LT"
                          maxLength={2}
                          value={line.modifier ?? ''}
                          onChange={(e) => updateLineItem(idx, 'modifier', e.target.value.toUpperCase())}
                          data-testid={`modifier-input-${idx}`}
                        />
                        {line._modifierError && <p className="text-xs text-red-500 mt-0.5">{line._modifierError}</p>}
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Units *</label>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          className="form-input text-sm"
                          value={line.units}
                          onChange={(e) => updateLineItem(idx, 'units', Math.max(1, parseInt(e.target.value, 10) || 1))}
                          data-testid={`units-input-${idx}`}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Billed Amount ($) *</label>
                        <input
                          type="number"
                          min={0.01}
                          step={0.01}
                          className="form-input text-sm"
                          placeholder="0.00"
                          value={line.billedAmount || ''}
                          onChange={(e) => updateLineItem(idx, 'billedAmount', parseFloat(e.target.value) || 0)}
                          data-testid={`billed-amount-input-${idx}`}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Diagnosis Pointer(s) (0-based index into diagnosis codes above)</label>
                      <input
                        type="text"
                        className="form-input text-sm"
                        placeholder="0"
                        value={line.diagnosisPointers.join(', ')}
                        onChange={(e) => {
                          const ptrs = e.target.value.split(',').map((v) => parseInt(v.trim(), 10)).filter((n) => !isNaN(n) && n >= 0)
                          updateLineItem(idx, 'diagnosisPointers', ptrs.length > 0 ? ptrs : [0])
                        }}
                        data-testid={`diagnosis-pointers-input-${idx}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addLineItem}
                className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                data-testid="add-line-item-btn"
              >
                <Plus className="h-3 w-3" /> Add line item
              </button>
            </div>}

            {/* Eligibility preview */}
            {eligibility && (
              <div className="rounded-xl bg-green-50 border border-green-200 p-4">
                <h3 className="text-sm font-semibold text-green-800 mb-2">Estimated Eligibility</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-green-700">Total Amount</span>
                    <span className="font-medium text-green-900">{formatCurrency(Number(watchAmount))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-700">Deductible Applied</span>
                    <span className="font-medium text-green-900">- {formatCurrency(eligibility.deductible)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-700">Eligible Amount</span>
                    <span className="font-medium text-green-900">{formatCurrency(eligibility.eligible)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-700">{outOfNetworkEnabled ? (eligibility.isOutOfNetwork ? 'Out-of-Network' : 'In-Network') : ''} Co-pay ({eligibility.copay}%)</span>
                    <span className="font-medium text-green-900">- {formatCurrency(eligibility.eligible * eligibility.copay / 100)}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-green-200">
                    <span className="text-green-800 font-semibold">Estimated Reimbursable</span>
                    <span className="font-bold text-green-900">{formatCurrency(eligibility.reimbursable)}</span>
                  </div>
                </div>
                <p className="text-xs text-green-600 mt-2">*Estimates are based on your policy terms and may vary.</p>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <button type="button" onClick={goBack} className="btn-secondary">
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={saving || submitting || deleting}
                  className="btn-secondary"
                  data-testid="save-draft-btn"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving...' : 'Save Draft'}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving || submitting || deleting}
                  className="btn-secondary text-red-600 hover:text-red-700 hover:border-red-300"
                  data-testid="delete-claim-btn"
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
                <button type="submit" className="btn-primary" data-testid="details-next-btn">
                  Continue <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Step 3: Documents */}
      {currentStep === 'documents' && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Upload Documents</h2>
          <p className="text-sm text-gray-500 mb-4">
            Attach invoices, receipts, prescriptions, or any supporting documents.
          </p>
          <FileUpload
            onChange={setFiles}
            maxFiles={10}
            label="Upload supporting documents"
          />
          <div className="flex justify-between mt-6">
            <button type="button" onClick={goBack} className="btn-secondary">
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saving || submitting}
                className="btn-secondary"
                data-testid="save-draft-btn"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
              <button type="button" onClick={goNext} className="btn-primary" data-testid="documents-next-btn">
                {files.length > 0 ? `Continue with ${files.length} file${files.length > 1 ? 's' : ''}` : 'Skip & Continue'}
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Review */}
      {currentStep === 'review' && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Review & Submit</h2>

          <div className="space-y-4">
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Claim Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between" data-testid="claim-type-summary">
                  <span className="text-gray-600">Claim Type</span>
                  <span className="font-medium" data-testid="claim-type-value">{selectedType?.replace('_', ' ')}</span>
                </div>
                <div className="flex justify-between" data-testid="policy-summary">
                  <span className="text-gray-600">Policy</span>
                  <span className="font-medium" data-testid="policy-value">{selectedPolicy?.name ?? getValues('policyId')}</span>
                </div>
                <div className="flex justify-between" data-testid="provider-summary">
                  <span className="text-gray-600">Treating Provider</span>
                  <span className="font-medium" data-testid="provider-value">{selectedProvider ? selectedProvider.name : '—'}</span>
                </div>
                <div className="flex justify-between" data-testid="incident-date-summary">
                  <span className="text-gray-600">Incident Date</span>
                  <span className="font-medium" data-testid="incident-date-value">
                    {getValues('incidentDate')
                      ? new Date(getValues('incidentDate')).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between" data-testid="total-amount-summary">
                  <span className="text-gray-600">Total Amount</span>
                  <span className="font-medium" data-testid="total-amount-value">{formatCurrency(Number(getValues('totalAmount')))}</span>
                </div>
                {eligibility && (
                  <div className="flex justify-between pt-1 border-t border-gray-200" data-testid="reimbursable-summary">
                    <span className="text-gray-700 font-medium">Est. Reimbursable</span>
                    <span className="font-bold text-green-600" data-testid="reimbursable-value">{formatCurrency(eligibility.reimbursable)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4" data-testid="description-summary-card">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Description</h3>
              <p className="text-sm text-gray-700" data-testid="description-value">{getValues('description')}</p>
            </div>

            {diagnosisCodesEnabled && getValidDiagnosisCodes().length > 0 && (
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-4" data-testid="diagnosis-codes-summary-card">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Diagnosis Codes ({getValidDiagnosisCodes().length})
                </h3>
                <div className="space-y-1" data-testid="diagnosis-codes-list">
                  {getValidDiagnosisCodes().map((code, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm" data-testid={`diagnosis-code-${i}`}>
                      <span className="text-xs text-gray-400 w-20 shrink-0">{i === 0 ? 'Primary' : `Secondary ${i}`}</span>
                      <span className="font-mono font-medium text-gray-900">{code}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {cptCodesEnabled && getValidLineItems().length > 0 && (
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-4" data-testid="line-items-summary-card">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Procedure Lines ({getValidLineItems().length})
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="line-items-table">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b border-gray-200">
                        <th className="text-left py-1 pr-2">#</th>
                        <th className="text-left py-1 pr-2">CPT</th>
                        <th className="text-left py-1 pr-2">Mod</th>
                        <th className="text-right py-1 pr-2">Units</th>
                        <th className="text-right py-1">Billed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getValidLineItems().map((l, i) => (
                        <tr key={i} className="border-b border-gray-100 last:border-0">
                          <td className="py-1 pr-2 text-gray-400">{i + 1}</td>
                          <td className="py-1 pr-2 font-mono font-medium">{l.cptCode}</td>
                          <td className="py-1 pr-2 font-mono text-gray-500">{l.modifier || '—'}</td>
                          <td className="py-1 pr-2 text-right">{l.units}</td>
                          <td className="py-1 text-right font-medium">{formatCurrency(l.billedAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {files.length > 0 && (
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-4" data-testid="documents-summary-card">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Documents ({files.length})
                </h3>
                <ul className="space-y-1" data-testid="documents-list">
                  {files.map((f, i) => (
                    <li key={i} className="text-sm text-gray-600 flex items-center gap-2">
                      <CheckCircle className="h-3 w-3 text-green-500" />
                      {f.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex flex-wrap justify-between gap-3 mt-6 pt-4 border-t border-gray-200">
            <button type="button" onClick={goBack} className="btn-secondary">
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saving || submitting}
                className="btn-secondary"
                data-testid="save-draft-btn"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
              <button
                type="button"
                onClick={handleSubmitClaim}
                disabled={saving || submitting}
                className="btn-primary"
                data-testid="submit-claim-btn"
              >
                <Send className="h-4 w-4" />
                {submitting ? 'Submitting...' : 'Submit Claim'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default NewClaim
