import React, { useEffect, useState } from 'react'
import { Settings } from 'lucide-react'
import { getSystemSettings, updateSystemSetting } from '../../api/admin'
import LoadingSpinner from '../../components/LoadingSpinner'

interface ToggleRowProps {
  label: string
  description: string
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}

const ToggleRow: React.FC<ToggleRowProps> = ({ label, description, checked, disabled, onChange }) => (
  <div className="flex items-start justify-between gap-4">
    <div>
      <p className="text-sm font-medium text-gray-800">{label}</p>
      <p className="text-sm text-gray-500 mt-0.5">{description}</p>
    </div>
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 ${
        checked ? 'bg-blue-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  </div>
)

interface SectionProps {
  icon?: React.ReactNode
  title: string
  children: React.ReactNode
  savedMsg?: string
}

const Section: React.FC<SectionProps> = ({ icon, title, children, savedMsg }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
    <div className="flex items-center gap-3 mb-6">
      {icon && <div className="p-2 bg-blue-50 rounded-lg">{icon}</div>}
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
    </div>
    <div className="space-y-6">{children}</div>
    {savedMsg && (
      <p
        className={`mt-3 text-xs font-medium ${
          savedMsg === 'Saved' ? 'text-green-600' : 'text-red-600'
        }`}
      >
        {savedMsg}
      </p>
    )}
  </div>
)

const SystemSettings: React.FC = () => {
  const [autoAssign, setAutoAssign] = useState(true)
  const [diagnosisCodes, setDiagnosisCodes] = useState(true)
  const [cptCodes, setCptCodes] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<Record<string, string>>({})

  useEffect(() => {
    getSystemSettings()
      .then((s) => {
        setAutoAssign(s.autoAssignEnabled === 'true')
        setDiagnosisCodes(s.diagnosisCodesEnabled !== 'false')
        setCptCodes(s.cptCodesEnabled !== 'false')
      })
      .finally(() => setLoading(false))
  }, [])

  const handleToggle = async (key: string, checked: boolean, setter: (v: boolean) => void) => {
    setter(checked)
    setSaving(key)
    setSavedMsg((prev) => ({ ...prev, [key]: '' }))
    try {
      await updateSystemSetting(key, checked ? 'true' : 'false')
      setSavedMsg((prev) => ({ ...prev, [key]: 'Saved' }))
    } catch {
      setter(!checked)
      setSavedMsg((prev) => ({ ...prev, [key]: 'Failed to save' }))
    } finally {
      setSaving(null)
      setTimeout(() => setSavedMsg((prev) => ({ ...prev, [key]: '' })), 2000)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Section
        icon={<Settings className="h-5 w-5 text-blue-600" />}
        title="Claim Assignment"
        savedMsg={savedMsg['autoAssignEnabled']}
      >
        <ToggleRow
          label="Auto-assign submitted claims"
          description="When enabled, each submitted claim is automatically assigned to the adjuster with the fewest open claims (specialty-aware). When disabled, claims remain unassigned until manually picked up."
          checked={autoAssign}
          disabled={saving === 'autoAssignEnabled'}
          onChange={(v) => handleToggle('autoAssignEnabled', v, setAutoAssign)}
        />
      </Section>

      <Section
        icon={<Settings className="h-5 w-5 text-blue-600" />}
        title="Medical Coding"
        savedMsg={savedMsg['diagnosisCodesEnabled'] || savedMsg['cptCodesEnabled']}
      >
        <ToggleRow
          label="ICD-10 diagnosis codes"
          description="Require patients to enter at least one ICD-10 diagnosis code when submitting a claim. When disabled, the diagnosis code field is hidden and claims submit without codes."
          checked={diagnosisCodes}
          disabled={saving === 'diagnosisCodesEnabled'}
          onChange={(v) => handleToggle('diagnosisCodesEnabled', v, setDiagnosisCodes)}
        />
        <div className="border-t border-gray-100 pt-6">
          <ToggleRow
            label="CPT procedure codes &amp; line items"
            description="Enable line-item claim entry with CPT codes, units, and per-line adjudication. When disabled, claims use the simple single-amount form."
            checked={cptCodes}
            disabled={saving === 'cptCodesEnabled'}
            onChange={(v) => handleToggle('cptCodesEnabled', v, setCptCodes)}
          />
        </div>
      </Section>
    </div>
  )
}

export default SystemSettings
