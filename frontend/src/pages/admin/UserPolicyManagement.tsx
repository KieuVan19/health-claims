import React, { useEffect, useState, useCallback } from 'react'
import { format, addMonths } from 'date-fns'
import {
  Shield,
  PlusCircle,
  Calendar,
  X,
  CheckCircle,
  XCircle,
  Search,
  Trash2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { getUserPolicies, getUsers, updateUserPolicyPayerOrder } from '../../api/admin'
import { getPolicies, assignPolicy, updatePolicy } from '../../api/policies'
import { UserPolicy, Policy, User, PolicyType, PayerOrder } from '../../types'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import ConfirmModal from '../../components/ConfirmModal'
import apiClient from '../../api/client'
import { formatCurrency } from '../../utils/formatting'

function computePlanYearStart(up: UserPolicy): Date {
  const now = new Date()
  if (up.planYearType === 'ANNIVERSARY') {
    const start = new Date(up.startDate)
    let candidate = new Date(now.getFullYear(), start.getMonth(), start.getDate())
    if (candidate > now) {
      candidate = new Date(now.getFullYear() - 1, start.getMonth(), start.getDate())
    }
    return candidate
  }
  return new Date(now.getFullYear(), 0, 1)
}

const policyTypeColors: Record<PolicyType, string> = {
  BASIC: 'bg-gray-100 text-gray-700',
  STANDARD: 'bg-blue-100 text-blue-700',
  PREMIUM: 'bg-purple-100 text-purple-700',
}

const today = () => new Date().toISOString().split('T')[0]

const UserPolicyManagement: React.FC = () => {
  const [userPolicies, setUserPolicies] = useState<UserPolicy[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_USE' | 'EXPIRED'>('ALL')
  const [actionLoading, setActionLoading] = useState(false)

  // Assign modal
  const [showAssign, setShowAssign] = useState(false)
  const [patients, setPatients] = useState<User[]>([])
  const [allPolicies, setAllPolicies] = useState<Policy[]>([])
  const [patientSearch, setPatientSearch] = useState('')
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [selectedPolicyId, setSelectedPolicyId] = useState('')
  const [loadingAssignData, setLoadingAssignData] = useState(false)

  // Extend modal
  const [extendTarget, setExtendTarget] = useState<UserPolicy | null>(null)
  const [extendDate, setExtendDate] = useState('')

  // Remove confirm
  const [removeTarget, setRemoveTarget] = useState<UserPolicy | null>(null)

  const fetchUserPolicies = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getUserPolicies()
      setUserPolicies(data)
    } catch {
      setUserPolicies([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUserPolicies() }, [fetchUserPolicies])

  const filtered = userPolicies.filter((up) => {
    const q = search.toLowerCase()
    const matchesText =
      `${up.user.firstName} ${up.user.lastName}`.toLowerCase().includes(q) ||
      up.user.email.toLowerCase().includes(q) ||
      up.policy.name.toLowerCase().includes(q)

    if (!matchesText) return false

    if (statusFilter !== 'ALL') {
      const isExpired = new Date(up.policy.expiryDate) < new Date()
      if (statusFilter === 'IN_USE' && isExpired) return false
      if (statusFilter === 'EXPIRED' && !isExpired) return false
    }

    return true
  })

  // ─── Assign ───────────────────────────────────────────────────────────────────

  const openAssign = async () => {
    setShowAssign(true)
    setSelectedPatientId('')
    setSelectedPolicyId('')
    setPatientSearch('')
    setLoadingAssignData(true)
    try {
      const [patientsRes, policiesRes] = await Promise.all([
        getUsers({ role: 'PATIENT', limit: 200 }),
        getPolicies(),
      ])
      setPatients(patientsRes.users)
      const now = new Date()
      setAllPolicies(policiesRes.filter((p) => p.isActive && new Date(p.expiryDate) >= now))
    } catch {
      toast.error('Failed to load data')
    } finally {
      setLoadingAssignData(false)
    }
  }

  const handleAssign = async () => {
    if (!selectedPatientId || !selectedPolicyId) return
    setActionLoading(true)
    try {
      await assignPolicy(selectedPolicyId, selectedPatientId)
      toast.success('Policy assigned to patient')
      setShowAssign(false)
      fetchUserPolicies()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Failed to assign policy')
    } finally {
      setActionLoading(false)
    }
  }

  const filteredPatients = patients.filter((p) =>
    `${p.firstName} ${p.lastName} ${p.email}`.toLowerCase().includes(patientSearch.toLowerCase())
  )

  // ─── Extend ───────────────────────────────────────────────────────────────────

  const openExtend = (up: UserPolicy) => {
    setExtendTarget(up)
    setExtendDate(up.policy.expiryDate.split('T')[0])
  }

  const applyQuickExtend = (months: number) => {
    if (!extendTarget) return
    setExtendDate(addMonths(new Date(extendTarget.policy.expiryDate), months).toISOString().split('T')[0])
  }

  const handleExtend = async () => {
    if (!extendTarget || !extendDate) return
    setActionLoading(true)
    try {
      await updatePolicy(extendTarget.policyId, { expiryDate: extendDate })
      toast.success('Policy expiry extended')
      setExtendTarget(null)
      fetchUserPolicies()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Failed to extend policy')
    } finally {
      setActionLoading(false)
    }
  }

  // ─── Remove assignment ────────────────────────────────────────────────────────

  const handleRemove = async () => {
    if (!removeTarget) return
    setActionLoading(true)
    try {
      await apiClient.delete(`/admin/user-policies/${removeTarget.id}`)
      toast.success('Policy unassigned')
      setRemoveTarget(null)
      fetchUserPolicies()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Failed to remove assignment')
    } finally {
      setActionLoading(false)
    }
  }

  // ─── JSX ──────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Policies</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage policy assignments for patients</p>
        </div>
        <button onClick={openAssign} className="btn-primary">
          <PlusCircle className="h-4 w-4" />
          Assign Policy
        </button>
      </div>

      {/* Search + filter */}
      <div className="card p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by patient or policy name..."
              className="form-input pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="form-input text-sm w-40 shrink-0"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            data-testid="status-filter"
          >
            <option value="ALL">All Statuses</option>
            <option value="IN_USE">In-use</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48"><LoadingSpinner size="lg" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Shield} title="No policy assignments found" description="Assign a policy to a patient to get started" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">Patient</th>
                  <th className="table-header">Policy</th>
                  <th className="table-header">Coverage</th>
                  <th className="table-header">Payer Order</th>
                  <th className="table-header">Plan Year Start</th>
                  <th className="table-header">Effective</th>
                  <th className="table-header">Expires</th>
                  <th className="table-header">Status</th>
                  <th className="table-header"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((up) => {
                  const isExpired = new Date(up.policy.expiryDate) < new Date()
                  return (
                    <tr key={up.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-semibold text-blue-600">
                              {up.user.firstName[0]}{up.user.lastName[0]}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900">{up.user.firstName} {up.user.lastName}</p>
                            <p className="text-xs text-gray-500 truncate">{up.user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="table-cell">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{up.policy.name}</p>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${policyTypeColors[up.policy.type]}`}>
                            {up.policy.type}
                          </span>
                        </div>
                      </td>
                      <td className="table-cell font-medium text-sm">
                        {formatCurrency(up.policy.coverageAmount ?? up.policy.coverageLimit ?? 0)}
                      </td>
                      <td className="table-cell">
                        <select
                          value={up.payerOrder ?? 'PRIMARY'}
                          onChange={async (e) => {
                            const newOrder = e.target.value as PayerOrder
                            try {
                              await updateUserPolicyPayerOrder(up.id, newOrder)
                              toast.success('Payer order updated')
                              fetchUserPolicies()
                            } catch {
                              toast.error('Failed to update payer order')
                            }
                          }}
                          className="form-input text-xs py-1 px-2"
                          data-testid={`payer-order-select-${up.id}`}
                        >
                          <option value="PRIMARY">Primary</option>
                          <option value="SECONDARY">Secondary</option>
                        </select>
                      </td>
                      <td className="table-cell text-sm text-gray-600">
                        {format(computePlanYearStart(up), 'MMM d, yyyy')}
                      </td>
                      <td className="table-cell text-sm text-gray-600">
                        {format(new Date(up.policy.effectiveDate), 'MMM d, yyyy')}
                      </td>
                      <td className={`table-cell text-sm font-medium ${isExpired ? 'text-red-500' : 'text-gray-600'}`}>
                        {format(new Date(up.policy.expiryDate), 'MMM d, yyyy')}
                        {isExpired && <span className="ml-1 text-xs font-normal">(Expired)</span>}
                      </td>
                      <td className="table-cell">
                        {!isExpired ? (
                          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                            <CheckCircle className="h-3 w-3" /> In-use
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-red-400 font-medium">
                            <XCircle className="h-3 w-3" /> Expired
                          </span>
                        )}
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openExtend(up)}
                            className="text-gray-400 hover:text-blue-600 p-1 rounded"
                            title="Extend expiry"
                          >
                            <Calendar className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setRemoveTarget(up)}
                            className="text-gray-400 hover:text-red-600 p-1 rounded"
                            title="Remove assignment"
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

      {/* ── Assign Modal ────────────────────────────────────────────────────────── */}
      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAssign(false)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] flex flex-col">
            <button className="absolute top-4 right-4 text-gray-400 hover:text-gray-600" onClick={() => setShowAssign(false)}>
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Assign Policy to Patient</h3>

            {loadingAssignData ? (
              <div className="flex items-center justify-center h-32"><LoadingSpinner size="sm" /></div>
            ) : (
              <>
                {/* Policy select */}
                <div className="mb-4">
                  <label className="form-label">Policy</label>
                  <select
                    className="form-input"
                    value={selectedPolicyId}
                    onChange={(e) => setSelectedPolicyId(e.target.value)}
                  >
                    <option value="">Select a policy...</option>
                    {allPolicies.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.type})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Patient search + list */}
                <label className="form-label">Patient</label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search patient..."
                    className="form-input pl-9"
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                  />
                </div>
                <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-52">
                  {filteredPatients.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-6">No patients found</p>
                  ) : (
                    filteredPatients.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPatientId(p.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                          selectedPatientId === p.id ? 'bg-blue-50 border-l-2 border-blue-600' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-blue-600">{p.firstName[0]}{p.lastName[0]}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900">{p.firstName} {p.lastName}</p>
                          <p className="text-xs text-gray-500 truncate">{p.email}</p>
                        </div>
                        {selectedPatientId === p.id && <CheckCircle className="h-4 w-4 text-blue-600 flex-shrink-0" />}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}

            <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-gray-100">
              <button type="button" onClick={() => setShowAssign(false)} className="btn-secondary">Cancel</button>
              <button
                type="button"
                onClick={handleAssign}
                disabled={!selectedPatientId || !selectedPolicyId || actionLoading}
                className="btn-primary"
              >
                {actionLoading ? 'Assigning...' : 'Assign Policy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Extend Modal ─────────────────────────────────────────────────────────── */}
      {extendTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setExtendTarget(null)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <button className="absolute top-4 right-4 text-gray-400 hover:text-gray-600" onClick={() => setExtendTarget(null)}>
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Extend Policy</h3>
            <p className="text-sm text-gray-500 mb-1">{extendTarget.policy.name}</p>
            <p className="text-xs text-gray-400 mb-4">
              Patient: {extendTarget.user.firstName} {extendTarget.user.lastName}
            </p>
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 mb-4 text-sm">
              <span className="text-gray-500">Current expiry: </span>
              <span className="font-medium">{format(new Date(extendTarget.policy.expiryDate), 'MMM d, yyyy')}</span>
            </div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Quick extend</p>
            <div className="flex gap-2 mb-4">
              {[3, 6, 12].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => applyQuickExtend(m)}
                  className="flex-1 py-1.5 text-sm font-medium rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  +{m === 12 ? '1 yr' : `${m} mo`}
                </button>
              ))}
            </div>
            <div className="mb-4">
              <label className="form-label">New Expiry Date</label>
              <input
                type="date"
                className="form-input"
                min={today()}
                value={extendDate}
                onChange={(e) => setExtendDate(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setExtendTarget(null)} className="btn-secondary">Cancel</button>
              <button type="button" onClick={handleExtend} disabled={!extendDate || actionLoading} className="btn-primary">
                {actionLoading ? 'Saving...' : 'Extend Policy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Remove confirm ────────────────────────────────────────────────────────── */}
      <ConfirmModal
        isOpen={!!removeTarget}
        title="Remove Policy Assignment"
        message={`Remove ${removeTarget?.policy.name} from ${removeTarget?.user.firstName} ${removeTarget?.user.lastName}? This does not delete the policy itself.`}
        confirmLabel="Remove"
        variant="danger"
        isLoading={actionLoading}
        onConfirm={handleRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  )
}

export default UserPolicyManagement
