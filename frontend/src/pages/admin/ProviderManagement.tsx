import React, { useEffect, useState } from 'react'
import { Plus, Search, Edit2, Wifi, WifiOff, X, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getProviders,
  createProvider,
  updateProvider,
  ProvidersResponse,
  CreateProviderData,
  UpdateProviderData,
} from '../../api/providers'
import { getSystemSettings } from '../../api/admin'
import { Provider, ProviderType } from '../../types'
import LoadingSpinner from '../../components/LoadingSpinner'
import Pagination from '../../components/Pagination'
import EmptyState from '../../components/EmptyState'

const PROVIDER_TYPES: ProviderType[] = ['PHYSICIAN', 'HOSPITAL', 'CLINIC', 'OTHER']

const typeLabel: Record<ProviderType, string> = {
  PHYSICIAN: 'Physician',
  HOSPITAL: 'Hospital',
  CLINIC: 'Clinic',
  OTHER: 'Other',
}

interface ProviderFormState {
  npi: string
  name: string
  providerType: ProviderType
  inNetwork: boolean
  specialty: string
}

const emptyForm: ProviderFormState = {
  npi: '',
  name: '',
  providerType: 'PHYSICIAN',
  inNetwork: false,
  specialty: '',
}

const ProviderManagement: React.FC = () => {
  const [data, setData] = useState<ProvidersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Provider | null>(null)
  const [form, setForm] = useState<ProviderFormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [outOfNetworkEnabled, setOutOfNetworkEnabled] = useState(false)

  const fetchProviders = (p = page, q = search) => {
    setLoading(true)
    Promise.all([
      getProviders({ search: q || undefined, page: p, limit: 20 }),
      getSystemSettings(),
    ])
      .then(([providers, settings]) => {
        setData(providers)
        setOutOfNetworkEnabled(settings.outOfNetworkEnabled === 'true')
      })
      .catch(() => toast.error('Failed to load providers'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchProviders(page, search)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchProviders(1, search)
  }

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
    setShowModal(true)
  }

  const openEdit = (provider: Provider) => {
    setEditing(provider)
    setForm({
      npi: provider.npi,
      name: provider.name,
      providerType: provider.providerType,
      inNetwork: provider.inNetwork,
      specialty: provider.specialty ?? '',
    })
    setFormError(null)
    setShowModal(true)
  }

  const handleToggleNetwork = async (provider: Provider) => {
    try {
      await updateProvider(provider.id, { inNetwork: !provider.inNetwork })
      toast.success(`${provider.name} marked as ${provider.inNetwork ? 'Out-of-Network' : 'In-Network'}`)
      fetchProviders(page, search)
    } catch {
      toast.error('Failed to update network status')
    }
  }

  const handleSave = async () => {
    setFormError(null)
    if (!form.npi || !form.name) {
      setFormError('NPI and Name are required')
      return
    }
    if (!/^\d{10}$/.test(form.npi)) {
      setFormError('NPI must be exactly 10 digits')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        const patch: UpdateProviderData = {
          name: form.name,
          providerType: form.providerType,
          inNetwork: form.inNetwork,
          specialty: form.specialty || null,
        }
        await updateProvider(editing.id, patch)
        toast.success('Provider updated')
      } else {
        const payload: CreateProviderData = {
          npi: form.npi,
          name: form.name,
          providerType: form.providerType,
          inNetwork: form.inNetwork,
          specialty: form.specialty || undefined,
        }
        await createProvider(payload)
        toast.success('Provider created')
      }
      setShowModal(false)
      fetchProviders(page, search)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setFormError(e.response?.data?.error ?? 'Failed to save provider')
    } finally {
      setSaving(false)
    }
  }

  if (!outOfNetworkEnabled) {
    return (
      <EmptyState
        icon={Plus}
        title="Out-of-Network Feature Disabled"
        description="Provider management is only available when out-of-network support is enabled. Enable it in System Settings to manage providers and network status."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Provider Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage NPI-keyed treating providers and network status</p>
        </div>
        <button onClick={openCreate} className="btn-primary" data-testid="create-provider-btn">
          <Plus className="h-4 w-4" /> Add Provider
        </button>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="card p-4 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            className="form-input pl-9"
            placeholder="Search by name, NPI, or specialty..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="provider-search"
          />
        </div>
        <button type="submit" className="btn-secondary">Search</button>
        {search && (
          <button type="button" className="btn-secondary" onClick={() => { setSearch(''); setPage(1); fetchProviders(1, '') }}>
            <X className="h-4 w-4" />
          </button>
        )}
      </form>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><LoadingSpinner /></div>
        ) : !data || data.providers.length === 0 ? (
          <div className="py-12 text-center text-gray-500">No providers found.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">NPI</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Specialty</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Network</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.providers.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{p.npi}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                      <td className="px-4 py-3 text-gray-600">{typeLabel[p.providerType]}</td>
                      <td className="px-4 py-3 text-gray-600">{p.specialty ?? '—'}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggleNetwork(p)}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                            p.inNetwork
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                          }`}
                          title={p.inNetwork ? 'Click to mark Out-of-Network' : 'Click to mark In-Network'}
                          data-testid={`toggle-network-${p.id}`}
                        >
                          {p.inNetwork ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                          {p.inNetwork ? 'In-Network' : 'Out-of-Network'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openEdit(p)}
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium"
                          data-testid={`edit-provider-${p.id}`}
                        >
                          <Edit2 className="h-3 w-3" /> Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-200">
                <Pagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{editing ? 'Edit Provider' : 'Add Provider'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{formError}</div>
            )}

            <div className="space-y-3">
              <div>
                <label className="form-label">NPI *</label>
                <input
                  type="text"
                  className="form-input font-mono"
                  maxLength={10}
                  placeholder="10-digit NPI"
                  value={form.npi}
                  onChange={(e) => setForm((f) => ({ ...f, npi: e.target.value.replace(/\D/g, '') }))}
                  disabled={!!editing}
                  data-testid="provider-npi-input"
                />
                {editing && <p className="text-xs text-gray-400 mt-1">NPI cannot be changed after creation.</p>}
              </div>

              <div>
                <label className="form-label">Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Provider or organization name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  data-testid="provider-name-input"
                />
              </div>

              <div>
                <label className="form-label">Provider Type *</label>
                <select
                  className="form-input"
                  value={form.providerType}
                  onChange={(e) => setForm((f) => ({ ...f, providerType: e.target.value as ProviderType }))}
                  data-testid="provider-type-select"
                >
                  {PROVIDER_TYPES.map((t) => (
                    <option key={t} value={t}>{typeLabel[t]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Specialty</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Internal Medicine, Dentistry"
                  value={form.specialty}
                  onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value }))}
                  data-testid="provider-specialty-input"
                />
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, inNetwork: !f.inNetwork }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    form.inNetwork ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                  data-testid="provider-innetwork-toggle"
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      form.inNetwork ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-sm text-gray-700">In-Network</span>
                {form.inNetwork && <Check className="h-4 w-4 text-green-500" />}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary" disabled={saving}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="btn-primary"
                disabled={saving}
                data-testid="save-provider-btn"
              >
                {saving ? 'Saving…' : (editing ? 'Save Changes' : 'Create Provider')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProviderManagement
