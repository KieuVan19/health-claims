import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { User, Shield, Lock, Eye, EyeOff, Save, Bell, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { updateProfile, changePassword } from '../api/auth'
import { getNotificationPrefs, updateNotificationPrefs, exportMyData } from '../api/users'
import { useAuthStore } from '../store/authStore'
import { NotificationPrefs } from '../types'

const profileSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
})

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Must contain at least one number'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type ProfileFormData = z.infer<typeof profileSchema>
type PasswordFormData = z.infer<typeof passwordSchema>

const roleLabels: Record<string, string> = {
  PATIENT: 'Patient',
  ADJUSTER: 'Claims Adjuster',
  FINANCE_OFFICER: 'Finance Officer',
  ADMIN: 'Administrator',
}

const defaultPrefs: NotificationPrefs = {
  claimSubmitted: true,
  claimApproved: true,
  claimRejected: true,
  claimPaid: true,
  infoRequested: true,
  claimUnderReview: true,
  appealPending: true,
}

const Profile: React.FC = () => {
  const { user, setUser } = useAuthStore()
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [showCurrentPwd, setShowCurrentPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [prefs, setPrefs] = useState<NotificationPrefs>(defaultPrefs)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [exportingData, setExportingData] = useState(false)

  useEffect(() => {
    getNotificationPrefs()
      .then((p) => setPrefs({ ...defaultPrefs, ...p }))
      .catch(() => {})
  }, [])

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
    },
  })

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  })

  const handleProfileSubmit = async (data: ProfileFormData) => {
    setSavingProfile(true)
    try {
      const updatedUser = await updateProfile(data)
      setUser(updatedUser)
      toast.success('Profile updated successfully')
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Failed to update profile')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleTogglePref = async (key: keyof NotificationPrefs) => {
    const updated = { ...prefs, [key]: !prefs[key] }
    setPrefs(updated)
    setSavingPrefs(true)
    try {
      const saved = await updateNotificationPrefs(updated)
      setPrefs({ ...defaultPrefs, ...saved })
    } catch {
      setPrefs(prefs)
      toast.error('Failed to save preferences')
    } finally {
      setSavingPrefs(false)
    }
  }

  const handleExportData = async () => {
    setExportingData(true)
    try {
      const blob = await exportMyData()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'my-health-claims-data.json'
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Data exported successfully')
    } catch {
      toast.error('Failed to export data')
    } finally {
      setExportingData(false)
    }
  }

  const handlePasswordSubmit = async (data: PasswordFormData) => {
    setSavingPassword(true)
    try {
      await changePassword(data.currentPassword, data.newPassword)
      toast.success('Password changed successfully')
      passwordForm.reset()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Failed to change password. Check your current password.')
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-2xl bg-blue-600 flex items-center justify-center flex-shrink-0">
          <span className="text-2xl font-bold text-white">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {user?.firstName} {user?.lastName}
          </h1>
          <p className="text-sm text-gray-500">{user?.email}</p>
        </div>
      </div>

      {/* Role & Status */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-5 w-5 text-blue-600" />
          <h2 className="text-base font-semibold text-gray-900">Account Information</h2>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Role</label>
            <p className="mt-1 text-sm font-medium text-gray-900">
              {user?.role ? roleLabels[user.role] : '—'}
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Email</label>
            <p className="mt-1 text-sm font-medium text-gray-900">{user?.email}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Status</label>
            <div className="mt-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                user?.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {user?.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Member Since</label>
            <p className="mt-1 text-sm font-medium text-gray-900">
              {user?.createdAt
                ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Edit Profile */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <User className="h-5 w-5 text-blue-600" />
          <h2 className="text-base font-semibold text-gray-900">Edit Profile</h2>
        </div>
        <form onSubmit={profileForm.handleSubmit(handleProfileSubmit)} noValidate className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label" htmlFor="firstName">First Name</label>
              <input
                id="firstName"
                type="text"
                className={`form-input ${profileForm.formState.errors.firstName ? 'border-red-500' : ''}`}
                data-testid="profile-firstname-input"
                {...profileForm.register('firstName')}
              />
              {profileForm.formState.errors.firstName && (
                <p className="form-error">{profileForm.formState.errors.firstName.message}</p>
              )}
            </div>
            <div>
              <label className="form-label" htmlFor="lastName">Last Name</label>
              <input
                id="lastName"
                type="text"
                className={`form-input ${profileForm.formState.errors.lastName ? 'border-red-500' : ''}`}
                data-testid="profile-lastname-input"
                {...profileForm.register('lastName')}
              />
              {profileForm.formState.errors.lastName && (
                <p className="form-error">{profileForm.formState.errors.lastName.message}</p>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingProfile}
              className="btn-primary"
              data-testid="save-profile-btn"
            >
              <Save className="h-4 w-4" />
              {savingProfile ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      {/* Change Password */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="h-5 w-5 text-blue-600" />
          <h2 className="text-base font-semibold text-gray-900">Change Password</h2>
        </div>
        <form onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)} noValidate className="space-y-4">
          <div>
            <label className="form-label" htmlFor="currentPassword">Current Password</label>
            <div className="relative">
              <input
                id="currentPassword"
                type={showCurrentPwd ? 'text' : 'password'}
                className={`form-input pr-10 ${passwordForm.formState.errors.currentPassword ? 'border-red-500' : ''}`}
                placeholder="Your current password"
                data-testid="current-password-input"
                {...passwordForm.register('currentPassword')}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowCurrentPwd(!showCurrentPwd)}
                tabIndex={-1}
                data-testid="toggle-current-password-visibility"
                aria-label="toggle-current-password-visibility"
              >
                {showCurrentPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {passwordForm.formState.errors.currentPassword && (
              <p className="form-error">{passwordForm.formState.errors.currentPassword.message}</p>
            )}
          </div>

          <div>
            <label className="form-label" htmlFor="newPassword">New Password</label>
            <div className="relative">
              <input
                id="newPassword"
                type={showNewPwd ? 'text' : 'password'}
                className={`form-input pr-10 ${passwordForm.formState.errors.newPassword ? 'border-red-500' : ''}`}
                placeholder="Min. 8 chars, 1 uppercase, 1 number"
                data-testid="new-password-input"
                {...passwordForm.register('newPassword')}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowNewPwd(!showNewPwd)}
                tabIndex={-1}
                data-testid="toggle-new-password-visibility"
                aria-label="toggle-new-password-visibility"
              >
                {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {passwordForm.formState.errors.newPassword && (
              <p className="form-error">{passwordForm.formState.errors.newPassword.message}</p>
            )}
          </div>

          <div>
            <label className="form-label" htmlFor="confirmPassword">Confirm New Password</label>
            <input
              id="confirmPassword"
              type="password"
              className={`form-input ${passwordForm.formState.errors.confirmPassword ? 'border-red-500' : ''}`}
              placeholder="Repeat new password"
              data-testid="confirm-new-password-input"
              {...passwordForm.register('confirmPassword')}
            />
            {passwordForm.formState.errors.confirmPassword && (
              <p className="form-error">{passwordForm.formState.errors.confirmPassword.message}</p>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingPassword}
              className="btn-primary"
              data-testid="change-password-btn"
            >
              <Lock className="h-4 w-4" />
              {savingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>

      {/* Notification Preferences — hidden for ADMIN */}
      {user?.role !== 'ADMIN' && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900">Notification Preferences</h2>
          </div>
          <div className="space-y-3">
            {(
              user?.role === 'FINANCE_OFFICER'
                ? [
                    { key: 'claimApproved' as keyof NotificationPrefs, label: 'Claim approved', desc: 'When a claim is approved and awaiting payment' },
                  ]
                : user?.role === 'ADJUSTER'
                ? [
                    { key: 'claimSubmitted' as keyof NotificationPrefs, label: 'New claim in queue', desc: 'When a new claim or resubmission is submitted and needs assignment' },
                    { key: 'claimUnderReview' as keyof NotificationPrefs, label: 'Claim assigned to you', desc: 'When a claim or appeal is assigned to you for review' },
                    { key: 'infoRequested' as keyof NotificationPrefs, label: 'Patient responded', desc: 'When a patient responds to your information request' },
                    { key: 'appealPending' as keyof NotificationPrefs, label: 'Appeal activity', desc: 'When a patient appeals your decision, or an appeal needs a second adjudicator' },
                  ]
                : [
                    { key: 'claimSubmitted' as keyof NotificationPrefs, label: 'Claim submitted', desc: 'Confirmation when you submit a claim' },
                    { key: 'claimUnderReview' as keyof NotificationPrefs, label: 'Under review', desc: 'When your claim enters review' },
                    { key: 'infoRequested' as keyof NotificationPrefs, label: 'Information requests', desc: 'When an adjuster needs more information' },
                    { key: 'claimApproved' as keyof NotificationPrefs, label: 'Claim approved', desc: 'When your claim is approved' },
                    { key: 'claimRejected' as keyof NotificationPrefs, label: 'Claim rejected', desc: 'When your claim is rejected' },
                    { key: 'claimPaid' as keyof NotificationPrefs, label: 'Payment processed', desc: 'When a payment is issued for your claim' },
                  ]
            ).map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{label}</p>
                  <p className="text-xs text-gray-500">{desc}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs[key]}
                  disabled={savingPrefs}
                  onClick={() => handleTogglePref(key)}
                  data-testid={`notif-pref-${key}-toggle`}
                  aria-label={`toggle-${label}`}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                    prefs[key] ? 'bg-blue-600' : 'bg-gray-200'
                  } ${savingPrefs ? 'opacity-50' : ''}`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      prefs[key] ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data Export */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Export My Data</h2>
            <p className="text-sm text-gray-500 mt-0.5">Download a copy of all your personal data and claims history.</p>
          </div>
          <button
            type="button"
            onClick={handleExportData}
            disabled={exportingData}
            className="btn-secondary"
            data-testid="export-data-btn"
          >
            <Download className="h-4 w-4" />
            {exportingData ? 'Exporting...' : 'Download Data'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Profile
