import React, { useEffect, useState, useCallback, FC } from 'react'
import { format } from 'date-fns'
import {
  Users,
  Search,
  Filter,
  PlusCircle,
  Edit,
  UserMinus,
  X,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { getUsers, createUser, updateUser, deactivateUser } from '../../api/admin'
import { User, Role } from '../../types'
import Pagination from '../../components/Pagination'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import ConfirmModal from '../../components/ConfirmModal'

const roleLabels: Record<Role, string> = {
  PATIENT: 'Patient',
  ADJUSTER: 'Adjuster',
  FINANCE_OFFICER: 'Finance Officer',
  ADMIN: 'Admin',
}

const roleBadge: Record<Role, string> = {
  PATIENT: 'bg-blue-100 text-blue-700',
  ADJUSTER: 'bg-purple-100 text-purple-700',
  FINANCE_OFFICER: 'bg-teal-100 text-teal-700',
  ADMIN: 'bg-red-100 text-red-700',
}

const createSchema = z.object({
  firstName: z.string().min(2, 'First name required'),
  lastName: z.string().min(2, 'Last name required'),
  email: z.string().email('Valid email required'),
  password: z.string().min(8, 'Min 8 characters'),
  role: z.enum(['PATIENT', 'ADJUSTER', 'FINANCE_OFFICER', 'ADMIN']),
})

const editSchema = z.object({
  firstName: z.string().min(2, 'Required'),
  lastName: z.string().min(2, 'Required'),
  role: z.enum(['PATIENT', 'ADJUSTER', 'FINANCE_OFFICER', 'ADMIN']),
  isActive: z.boolean(),
  specialty: z.string().max(100).optional(),
})

type CreateFormData = z.infer<typeof createSchema>
type EditFormData = z.infer<typeof editSchema>

interface EditUserFormProps {
  form: ReturnType<typeof useForm<EditFormData>>
  onSubmit: (data: EditFormData) => void
  onCancel: () => void
  actionLoading: boolean
}

const EditUserForm: FC<EditUserFormProps> = ({ form, onSubmit, onCancel, actionLoading }) => {
  const watchedRole = useWatch({ control: form.control, name: 'role' })
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="form-label">First Name</label>
          <input type="text" className="form-input" {...form.register('firstName')} />
        </div>
        <div>
          <label className="form-label">Last Name</label>
          <input type="text" className="form-input" {...form.register('lastName')} />
        </div>
      </div>
      <div>
        <label className="form-label">Role</label>
        <select className="form-input" {...form.register('role')}>
          <option value="PATIENT">Patient</option>
          <option value="ADJUSTER">Adjuster</option>
          <option value="FINANCE_OFFICER">Finance Officer</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>
      {watchedRole === 'ADJUSTER' && (
        <div>
          <label className="form-label">Specialty <span className="text-gray-400 font-normal">(optional)</span></label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. DENTAL, VISION — leave blank for general"
            {...form.register('specialty')}
          />
          <p className="text-xs text-gray-400 mt-1">Adjusters without a specialty receive any claim type.</p>
        </div>
      )}
      <div className="flex items-center gap-2">
        <input type="checkbox" id="isActive" {...form.register('isActive')} className="rounded border-gray-300 text-blue-600" />
        <label htmlFor="isActive" className="text-sm font-medium text-gray-700">Active</label>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={actionLoading} className="btn-primary" data-testid="save-user-btn">
          {actionLoading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  )
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const createForm = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
    defaultValues: { role: 'PATIENT' },
  })

  const editForm = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
  })

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getUsers({
        page,
        limit: 10,
        search: search || undefined,
        role: roleFilter || undefined,
      })
      setUsers(res.data ?? [])
      setTotal(res.pagination?.total ?? 0)
      setTotalPages(res.pagination?.totalPages ?? 1)
    } catch {
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [page, search, roleFilter])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleCreate = async (data: CreateFormData) => {
    setActionLoading(true)
    try {
      await createUser(data)
      toast.success('User created successfully')
      setShowCreateModal(false)
      createForm.reset()
      fetchUsers()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Failed to create user')
    } finally {
      setActionLoading(false)
    }
  }

  const handleEdit = async (data: EditFormData) => {
    if (!editUser) return
    setActionLoading(true)
    try {
      await updateUser(editUser.id, {
        ...data,
        specialty: data.role === 'ADJUSTER' ? (data.specialty || null) : null,
      })
      toast.success('User updated successfully')
      setEditUser(null)
      fetchUsers()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Failed to update user')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeactivate = async () => {
    if (!deactivateTarget) return
    setActionLoading(true)
    try {
      await deactivateUser(deactivateTarget.id)
      toast.success('User deactivated')
      setDeactivateTarget(null)
      fetchUsers()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Failed to deactivate user')
    } finally {
      setActionLoading(false)
    }
  }

  const openEditModal = (user: User) => {
    setEditUser(user)
    editForm.reset({
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive,
      specialty: user.specialty ?? '',
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} user{total !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => { createForm.reset({ role: 'PATIENT' }); setShowCreateModal(true) }}
          className="btn-primary"
          data-testid="create-user-btn"
        >
          <PlusCircle className="h-4 w-4" />
          Create User
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3">
          <form
            onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); setPage(1) }}
            className="flex gap-2 flex-1 min-w-52"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name or email..."
                className="form-input pl-9"
                data-testid="users-search-input"
              />
            </div>
            <button type="submit" className="btn-secondary px-3">
              <Search className="h-4 w-4" />
            </button>
          </form>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setPage(1) }}
              className="form-input text-sm"
              data-testid="role-filter"
            >
              <option value="">All Roles</option>
              <option value="PATIENT">Patient</option>
              <option value="ADJUSTER">Adjuster</option>
              <option value="FINANCE_OFFICER">Finance Officer</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48"><LoadingSpinner size="lg" /></div>
        ) : users.length === 0 ? (
          <EmptyState icon={Users} title="No users found" description="Try adjusting your search filters" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="table-header">Name</th>
                    <th className="table-header">Email</th>
                    <th className="table-header">Role</th>
                    <th className="table-header">Status</th>
                    <th className="table-header">Created</th>
                    <th className="table-header"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors" data-testid="user-row">
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-semibold text-blue-600">
                              {user.firstName[0]}{user.lastName[0]}
                            </span>
                          </div>
                          <span className="font-medium">{user.firstName} {user.lastName}</span>
                        </div>
                      </td>
                      <td className="table-cell text-gray-600">{user.email}</td>
                      <td className="table-cell">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${roleBadge[user.role]}`}>
                          {roleLabels[user.role]}
                        </span>
                      </td>
                      <td className="table-cell">
                        {user.isActive ? (
                          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                            <CheckCircle className="h-3 w-3" /> Active
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-gray-400 font-medium">
                            <XCircle className="h-3 w-3" /> Inactive
                          </span>
                        )}
                      </td>
                      <td className="table-cell text-gray-600">
                        {format(new Date(user.createdAt), 'MMM d, yyyy')}
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEditModal(user)}
                            className="text-gray-400 hover:text-blue-600 p-1 rounded"
                            data-testid="edit-user-btn"
                            title="Edit user"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          {user.isActive && (
                            <button
                              onClick={() => setDeactivateTarget(user)}
                              className="text-gray-400 hover:text-red-600 p-1 rounded"
                              data-testid="deactivate-user-btn"
                              title="Deactivate user"
                            >
                              <UserMinus className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-100">
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </>
        )}
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCreateModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <button className="absolute top-4 right-4 text-gray-400 hover:text-gray-600" onClick={() => setShowCreateModal(false)}>
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Create User</h3>
            <form onSubmit={createForm.handleSubmit(handleCreate)} noValidate className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">First Name</label>
                  <input type="text" className={`form-input ${createForm.formState.errors.firstName ? 'border-red-500' : ''}`} {...createForm.register('firstName')} />
                  {createForm.formState.errors.firstName && <p className="form-error">{createForm.formState.errors.firstName.message}</p>}
                </div>
                <div>
                  <label className="form-label">Last Name</label>
                  <input type="text" className={`form-input ${createForm.formState.errors.lastName ? 'border-red-500' : ''}`} {...createForm.register('lastName')} />
                  {createForm.formState.errors.lastName && <p className="form-error">{createForm.formState.errors.lastName.message}</p>}
                </div>
              </div>
              <div>
                <label className="form-label">Email</label>
                <input type="email" className={`form-input ${createForm.formState.errors.email ? 'border-red-500' : ''}`} {...createForm.register('email')} />
                {createForm.formState.errors.email && <p className="form-error">{createForm.formState.errors.email.message}</p>}
              </div>
              <div>
                <label className="form-label">Password</label>
                <input type="password" className={`form-input ${createForm.formState.errors.password ? 'border-red-500' : ''}`} {...createForm.register('password')} />
                {createForm.formState.errors.password && <p className="form-error">{createForm.formState.errors.password.message}</p>}
              </div>
              <div>
                <label className="form-label">Role</label>
                <select className="form-input" {...createForm.register('role')}>
                  <option value="PATIENT">Patient</option>
                  <option value="ADJUSTER">Adjuster</option>
                  <option value="FINANCE_OFFICER">Finance Officer</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={actionLoading} className="btn-primary" data-testid="create-user-submit-btn">
                  {actionLoading ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditUser(null)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <button className="absolute top-4 right-4 text-gray-400 hover:text-gray-600" onClick={() => setEditUser(null)}>
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit User</h3>
            <EditUserForm
              form={editForm}
              onSubmit={handleEdit}
              onCancel={() => setEditUser(null)}
              actionLoading={actionLoading}
            />
          </div>
        </div>
      )}

      {/* Deactivate confirm */}
      <ConfirmModal
        isOpen={!!deactivateTarget}
        title="Deactivate User"
        message={`Are you sure you want to deactivate ${deactivateTarget?.firstName} ${deactivateTarget?.lastName}? They will no longer be able to sign in.`}
        confirmLabel="Deactivate"
        variant="danger"
        isLoading={actionLoading}
        onConfirm={handleDeactivate}
        onCancel={() => setDeactivateTarget(null)}
      />
    </div>
  )
}

export default UserManagement
