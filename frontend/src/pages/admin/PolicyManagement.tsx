import React, { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import {
  BookOpen,
  PlusCircle,
  X,
  CheckCircle,
  XCircle,
  Trash2,
  Search,
  Edit,
  Copy,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { getPolicies, createPolicy, updatePolicy, deletePolicy } from '../../api/policies'
import { getSystemSettings } from '../../api/admin'
import { Policy, PolicyType } from '../../types'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import ConfirmModal from '../../components/ConfirmModal'
import { formatCurrency } from '../../utils/formatting'

const policyTypeColors: Record<PolicyType, string> = {
  BASIC: 'bg-gray-100 text-gray-700',
  STANDARD: 'bg-blue-100 text-blue-700',
  PREMIUM: 'bg-purple-100 text-purple-700',
}

const policySchema = z.object({
  name: z.string().min(2, 'Name is required'),
  type: z.enum(['BASIC', 'STANDARD', 'PREMIUM']),
  description: z.string().optional(),
  coverageAmount: z.string().refine((v) => !isNaN(Number(v)) && Number(v) > 0, 'Must be a positive number'),
  deductible: z.string().refine((v) => !isNaN(Number(v)) && Number(v) >= 0, 'Must be >= 0'),
  copayPercentage: z.string().refine((v) => !isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100, 'Must be 0–100'),
  oopMax: z.string().refine((v) => !isNaN(Number(v)) && Number(v) >= 0, 'Must be >= 0'),
  oonDeductible: z.string().refine((v) => !isNaN(Number(v)) && Number(v) >= 0, 'Must be >= 0'),
  oonCopayPercent: z.string().refine((v) => !isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100, 'Must be 0–100'),
  filingDeadlineDays: z.string().refine((v) => !isNaN(Number(v)) && Number(v) >= 1, 'Must be at least 1 day'),
  effectiveDate: z.string().min(1, 'Effective date required'),
  expiryDate: z.string().min(1, 'Expiry date required'),
  limitHospitalization: z.string().optional(),
  limitOutpatient: z.string().optional(),
  limitDental: z.string().optional(),
  limitVision: z.string().optional(),
  limitPharmacy: z.string().optional(),
})

type PolicyFormData = z.infer<typeof policySchema>

const PolicyManagement: React.FC = () => {
  const [policies, setPolicies] = useState<Policy[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [outOfNetworkEnabled, setOutOfNetworkEnabled] = useState(false)

  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'clone'>('create')
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Policy | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [effectiveDateFilter, setEffectiveDateFilter] = useState('')
  const [expiryDateFilter, setExpiryDateFilter] = useState('')

  const form = useForm<PolicyFormData>({
    resolver: zodResolver(policySchema),
    defaultValues: { type: 'STANDARD', copayPercentage: '20', deductible: '0', oopMax: '8000', oonDeductible: '0', oonCopayPercent: '0', filingDeadlineDays: '365' },
  })

  const fetchPolicies = useCallback(async () => {
    setLoading(true)
    try {
      const [data, settings] = await Promise.all([
        getPolicies(),
        getSystemSettings(),
      ])
      setPolicies(data)
      setOutOfNetworkEnabled(settings.outOfNetworkEnabled === 'true')
    } catch {
      setPolicies([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPolicies() }, [fetchPolicies])

  const now = new Date()

  const filtered = policies.filter((p) => {
    const isExpired = new Date(p.expiryDate) < now
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (statusFilter === 'active' && (!p.isActive || isExpired)) return false
    if (statusFilter === 'inactive' && (p.isActive || isExpired)) return false
    if (statusFilter === 'expired' && !isExpired) return false
    if (typeFilter && p.type !== typeFilter) return false
    if (effectiveDateFilter && new Date(p.effectiveDate) < new Date(effectiveDateFilter)) return false
    if (expiryDateFilter && new Date(p.expiryDate) > new Date(expiryDateFilter)) return false
    return true
  })

  // ─── Create / Edit / Clone ────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingPolicy(null)
    setModalMode('create')
    form.reset({ type: 'STANDARD', copayPercentage: '20', deductible: '250', oopMax: '8000', oonDeductible: '0', oonCopayPercent: '0', filingDeadlineDays: '365' })
    setShowModal(true)
  }

  const benefitLimitsFromPolicy = (policy: Policy) => ({
    limitHospitalization: policy.benefits?.hospitalization?.limit != null ? String(policy.benefits.hospitalization.limit) : '',
    limitOutpatient: policy.benefits?.outpatient?.limit != null ? String(policy.benefits.outpatient.limit) : '',
    limitDental: policy.benefits?.dental?.limit != null ? String(policy.benefits.dental.limit) : '',
    limitVision: policy.benefits?.vision?.limit != null ? String(policy.benefits.vision.limit) : '',
    limitPharmacy: policy.benefits?.pharmacy?.limit != null ? String(policy.benefits.pharmacy.limit) : '',
  })

  const openEdit = (policy: Policy) => {
    setEditingPolicy(policy)
    setModalMode('edit')
    form.reset({
      name: policy.name,
      type: policy.type,
      description: policy.description ?? '',
      coverageAmount: String(policy.coverageAmount ?? policy.coverageLimit ?? ''),
      deductible: String(policy.deductible),
      copayPercentage: String(policy.copayPercentage ?? 0),
      oopMax: String(policy.oopMax ?? 8000),
      oonDeductible: String(policy.oonDeductible ?? 0),
      oonCopayPercent: String(policy.oonCopayPercent ?? 0),
      filingDeadlineDays: String(policy.filingDeadlineDays ?? 365),
      effectiveDate: policy.effectiveDate.split('T')[0],
      expiryDate: policy.expiryDate.split('T')[0],
      ...benefitLimitsFromPolicy(policy),
    })
    setShowModal(true)
  }

  const openClone = (policy: Policy) => {
    setEditingPolicy(null)
    setModalMode('clone')
    form.reset({
      name: `Copy of ${policy.name}`,
      type: policy.type,
      description: policy.description ?? '',
      coverageAmount: String(policy.coverageAmount ?? policy.coverageLimit ?? ''),
      deductible: String(policy.deductible),
      copayPercentage: String(policy.copayPercentage ?? 0),
      oopMax: String(policy.oopMax ?? 8000),
      oonDeductible: String(policy.oonDeductible ?? 0),
      oonCopayPercent: String(policy.oonCopayPercent ?? 0),
      filingDeadlineDays: String(policy.filingDeadlineDays ?? 365),
      effectiveDate: policy.effectiveDate.split('T')[0],
      expiryDate: policy.expiryDate.split('T')[0],
      ...benefitLimitsFromPolicy(policy),
    })
    setShowModal(true)
  }

  const handleSubmit = async (data: PolicyFormData) => {
    setActionLoading(true)
    const limitEntries = (
      [
        ['hospitalization', data.limitHospitalization],
        ['outpatient', data.limitOutpatient],
        ['dental', data.limitDental],
        ['vision', data.limitVision],
        ['pharmacy', data.limitPharmacy],
      ] as [string, string | undefined][]
    )
      .filter(([, v]) => v && !isNaN(Number(v)) && Number(v) > 0)
      .map(([k, v]) => [k, { limit: Number(v) }] as [string, { limit: number }])
    const payload = {
      ...data,
      coverageAmount: Number(data.coverageAmount),
      deductible: Number(data.deductible),
      copayPercentage: Number(data.copayPercentage),
      oopMax: Number(data.oopMax),
      oonDeductible: 0,
      oonCopayPercent: outOfNetworkEnabled ? Number(data.oonCopayPercent) : 0,
      filingDeadlineDays: Number(data.filingDeadlineDays),
      benefits: Object.fromEntries(limitEntries),
    }
    try {
      if (modalMode === 'edit' && editingPolicy) {
        await updatePolicy(editingPolicy.id, payload)
        toast.success('Policy updated')
      } else {
        await createPolicy(payload)
        toast.success(modalMode === 'clone' ? 'Policy cloned' : 'Policy created')
      }
      setShowModal(false)
      fetchPolicies()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Failed to save policy')
    } finally {
      setActionLoading(false)
    }
  }

  // ─── Delete ───────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return
    setActionLoading(true)
    try {
      await deletePolicy(deleteTarget.id)
      toast.success('Policy deleted')
      setDeleteTarget(null)
      fetchPolicies()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error || 'Failed to delete policy')
      setDeleteTarget(null)
    } finally {
      setActionLoading(false)
    }
  }

  // ─── Status helper ────────────────────────────────────────────────────────────

  const renderStatus = (policy: Policy) => {
    const isExpired = new Date(policy.expiryDate) < now
    if (isExpired) {
      return (
        <span className="flex items-center gap-1 text-xs text-red-500 font-semibold">
          <XCircle className="h-3 w-3" /> Expired
        </span>
      )
    }
    if (policy.isActive) {
      return (
        <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
          <CheckCircle className="h-3 w-3" /> Active
        </span>
      )
    }
    return (
      <span className="flex items-center gap-1 text-xs text-gray-400 font-medium">
        <XCircle className="h-3 w-3" /> Inactive
      </span>
    )
  }

  // ─── Per-type limits mismatch warning ────────────────────────────────────────

  const [watchLimitH, watchLimitO, watchLimitD, watchLimitV, watchLimitP] = form.watch([
    'limitHospitalization', 'limitOutpatient', 'limitDental', 'limitVision', 'limitPharmacy',
  ])
  const watchCoverage = form.watch('coverageAmount')

  const filledLimitValues = [watchLimitH, watchLimitO, watchLimitD, watchLimitV, watchLimitP]
    .map((v) => (v && !isNaN(Number(v)) && Number(v) > 0 ? Number(v) : null))
    .filter((v): v is number => v !== null)
  const limitsSum = filledLimitValues.reduce((a, b) => a + b, 0)
  const coverageNum = Number(watchCoverage)
  const showLimitsMismatch =
    filledLimitValues.length > 0 &&
    !isNaN(coverageNum) &&
    coverageNum > 0 &&
    Math.abs(limitsSum - coverageNum) > 0.01

  // ─── JSX ──────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Policy Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} of {policies.length} polic{policies.length !== 1 ? 'ies' : 'y'}</p>
        </div>
        <button onClick={openCreate} className="btn-primary" data-testid="create-policy-btn">
          <PlusCircle className="h-4 w-4" />
          Create Policy
        </button>
      </div>

      {/* Filters */}
      <div className="card p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              className="form-input pl-9"
              placeholder="Search policies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="policies-search-input"
            />
          </div>
          <input
            type="date"
            className="form-input w-40 text-sm"
            value={effectiveDateFilter}
            onChange={(e) => setEffectiveDateFilter(e.target.value)}
            title="Effective date from"
            data-testid="policy-effective-date-from"
          />
          <span className="text-gray-400 text-sm">–</span>
          <input
            type="date"
            className="form-input w-40 text-sm"
            value={expiryDateFilter}
            onChange={(e) => setExpiryDateFilter(e.target.value)}
            title="Expiry date up to"
            data-testid="policy-expiry-date-to"
          />
          <select
            className="form-input w-36 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            data-testid="policy-status-filter"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="expired">Expired</option>
          </select>
          <select
            className="form-input w-36 text-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            data-testid="policy-type-filter"
          >
            <option value="">All Types</option>
            <option value="BASIC">Basic</option>
            <option value="STANDARD">Standard</option>
            <option value="PREMIUM">Premium</option>
          </select>
          <button
            onClick={() => { setSearchQuery(''); setStatusFilter(''); setTypeFilter(''); setEffectiveDateFilter(''); setExpiryDateFilter('') }}
            title="Clear filters"
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-700 hover:border-red-300 transition-colors flex-shrink-0"
            data-testid="clear-policy-filters-btn"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48"><LoadingSpinner size="lg" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={BookOpen} title="No policies found" description={policies.length > 0 ? 'Try adjusting the filters' : 'Create your first insurance policy'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">Name</th>
                  <th className="table-header">Type</th>
                  <th className="table-header">Coverage</th>
                  <th className="table-header">Deductible</th>
                  <th className="table-header">{outOfNetworkEnabled ? 'In-Network Copay' : 'Copay'}</th>
                  {outOfNetworkEnabled && <th className="table-header">Out-of-Network Copay</th>}
                  <th className="table-header">OOP Max</th>
                  <th className="table-header">Filing Deadline</th>
                  <th className="table-header">Effective Date</th>
                  <th className="table-header">Expired Date</th>
                  <th className="table-header">Status</th>
                  <th className="table-header"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((policy) => {
                  const isExpired = new Date(policy.expiryDate) < now
                  return (
                    <tr key={policy.id} className="hover:bg-gray-50 transition-colors" data-testid="policy-row">
                      <td className="table-cell">
                        <div>
                          <p className="font-medium text-gray-900" data-testid={`policy-name-${policy.id}`}>{policy.name}</p>
                          {policy.description && (
                            <p className="text-xs text-gray-500 truncate max-w-48" data-testid={`policy-desc-${policy.id}`}>{policy.description}</p>
                          )}
                        </div>
                      </td>
                      <td className="table-cell">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${policyTypeColors[policy.type]}`} data-testid={`policy-type-${policy.id}`}>
                          {policy.type}
                        </span>
                      </td>
                      <td className="table-cell font-medium" data-testid={`policy-coverage-${policy.id}`}>{formatCurrency(policy.coverageAmount ?? policy.coverageLimit ?? 0)}</td>
                      <td className="table-cell" data-testid={`policy-deductible-${policy.id}`}>{formatCurrency(policy.deductible)}</td>
                      <td className="table-cell" data-testid={`policy-copay-${policy.id}`}>{policy.copayPercentage ?? 0}%</td>
                      {outOfNetworkEnabled && <td className="table-cell" data-testid={`policy-oon-copay-${policy.id}`}>{policy.oonCopayPercent ?? 0}%</td>}
                      <td className="table-cell" data-testid={`policy-oop-max-${policy.id}`}>{formatCurrency(policy.oopMax ?? 8000)}</td>
                      <td className="table-cell" data-testid={`policy-deadline-${policy.id}`}>{policy.filingDeadlineDays ?? 365} days</td>
                      <td className="table-cell text-gray-600" data-testid={`policy-effective-date-${policy.id}`}>
                        {format(new Date(policy.effectiveDate), 'MMM d, yyyy')}
                      </td>
                      <td className={`table-cell font-medium ${isExpired ? 'text-red-500' : 'text-gray-600'}`} data-testid={`policy-expiry-date-${policy.id}`}>
                        {format(new Date(policy.expiryDate), 'MMM d, yyyy')}
                      </td>
                      <td className="table-cell" data-testid={`policy-status-${policy.id}`}>{renderStatus(policy)}</td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(policy)}
                            className="text-gray-400 hover:text-blue-600 p-1 rounded"
                            title="Edit policy"
                            data-testid="edit-policy-btn"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => openClone(policy)}
                            className="text-gray-400 hover:text-green-600 p-1 rounded"
                            title="Clone policy"
                            data-testid="clone-policy-btn"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(policy)}
                            className="text-gray-400 hover:text-red-600 p-1 rounded"
                            title="Delete policy"
                            data-testid="delete-policy-btn"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create Modal ─────────────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <button className="absolute top-4 right-4 text-gray-400 hover:text-gray-600" onClick={() => setShowModal(false)}>
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {modalMode === 'edit' ? 'Edit Policy' : modalMode === 'clone' ? 'Clone Policy' : 'Create Policy'}
            </h3>
            <form onSubmit={form.handleSubmit(handleSubmit)} noValidate className="space-y-3">
              <div>
                <label className="form-label">Policy Name</label>
                <input type="text" className={`form-input ${form.formState.errors.name ? 'border-red-500' : ''}`} placeholder="e.g. Standard Health Plan" {...form.register('name')} />
                {form.formState.errors.name && <p className="form-error">{form.formState.errors.name.message}</p>}
              </div>
              <div>
                <label className="form-label">Description</label>
                <textarea rows={2} className="form-input resize-none" placeholder="Optional description..." {...form.register('description')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Type</label>
                  <select className="form-input" {...form.register('type')}>
                    <option value="BASIC">Basic</option>
                    <option value="STANDARD">Standard</option>
                    <option value="PREMIUM">Premium</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">{outOfNetworkEnabled ? 'In-Network Copay %' : 'Copay %'}</label>
                  <input type="number" step="1" min="0" max="100" className={`form-input ${form.formState.errors.copayPercentage ? 'border-red-500' : ''}`} {...form.register('copayPercentage')} />
                  {form.formState.errors.copayPercentage && <p className="form-error">{form.formState.errors.copayPercentage.message}</p>}
                </div>
              </div>
              {outOfNetworkEnabled && (
                <div>
                  <label className="form-label">Out-of-Network Copay %</label>
                  <input type="number" step="1" min="0" max="100" className={`form-input ${form.formState.errors.oonCopayPercent ? 'border-red-500' : ''}`} {...form.register('oonCopayPercent')} />
                  {form.formState.errors.oonCopayPercent && <p className="form-error">{form.formState.errors.oonCopayPercent.message}</p>}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Coverage Amount ($)</label>
                  <input type="number" step="0.01" min="0" className={`form-input ${form.formState.errors.coverageAmount ? 'border-red-500' : ''}`} {...form.register('coverageAmount')} />
                  {form.formState.errors.coverageAmount && <p className="form-error">{form.formState.errors.coverageAmount.message}</p>}
                </div>
                <div>
                  <label className="form-label">{outOfNetworkEnabled ? 'Deductible (both networks)' : 'Deductible'} ($)</label>
                  <input type="number" step="0.01" min="0" className={`form-input ${form.formState.errors.deductible ? 'border-red-500' : ''}`} {...form.register('deductible')} />
                  {form.formState.errors.deductible && <p className="form-error">{form.formState.errors.deductible.message}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Out-of-Pocket Maximum ($)</label>
                  <input type="number" step="0.01" min="0" className={`form-input ${form.formState.errors.oopMax ? 'border-red-500' : ''}`} {...form.register('oopMax')} />
                  {form.formState.errors.oopMax && <p className="form-error">{form.formState.errors.oopMax.message}</p>}
                </div>
                <div>
                  <label className="form-label">Filing Deadline (days)</label>
                  <input type="number" step="1" min="1" className={`form-input ${form.formState.errors.filingDeadlineDays ? 'border-red-500' : ''}`} {...form.register('filingDeadlineDays')} />
                  {form.formState.errors.filingDeadlineDays && <p className="form-error">{form.formState.errors.filingDeadlineDays.message}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Effective Date</label>
                  <input type="date" className={`form-input ${form.formState.errors.effectiveDate ? 'border-red-500' : ''}`} {...form.register('effectiveDate')} />
                  {form.formState.errors.effectiveDate && <p className="form-error">{form.formState.errors.effectiveDate.message}</p>}
                </div>
                <div>
                  <label className="form-label">Expiry Date</label>
                  <input type="date" className={`form-input ${form.formState.errors.expiryDate ? 'border-red-500' : ''}`} {...form.register('expiryDate')} />
                  {form.formState.errors.expiryDate && <p className="form-error">{form.formState.errors.expiryDate.message}</p>}
                </div>
              </div>
              <div>
                <label className="form-label">Per-Type Coverage Limits (optional)</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {[
                    { label: 'Hospitalization', field: 'limitHospitalization' },
                    { label: 'Outpatient', field: 'limitOutpatient' },
                    { label: 'Dental', field: 'limitDental' },
                    { label: 'Vision', field: 'limitVision' },
                    { label: 'Pharmacy', field: 'limitPharmacy' },
                  ].map(({ label, field }) => (
                    <div key={field}>
                      <label className="text-xs text-gray-500">{label} ($)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className="form-input text-sm"
                        placeholder="No limit"
                        {...form.register(field as keyof PolicyFormData)}
                      />
                    </div>
                  ))}
                </div>
                {showLimitsMismatch && (
                  <p className="text-xs text-red-600 mt-1.5">
                    Per-type limits sum ({formatCurrency(limitsSum)}) does not equal Coverage Amount ({formatCurrency(coverageNum)}). The limits should add up to the total coverage.
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={actionLoading} className="btn-primary" data-testid="save-policy-btn">
                  {actionLoading
                    ? 'Saving...'
                    : modalMode === 'edit'
                    ? 'Save Changes'
                    : modalMode === 'clone'
                    ? 'Clone Policy'
                    : 'Create Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete confirm ───────────────────────────────────────────────────────── */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Policy"
        message={`Are you sure you want to permanently delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={actionLoading}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

export default PolicyManagement
