import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Heart, Eye, EyeOff, UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import { register as registerApi } from '../../api/auth'
import { useAuthStore } from '../../store/authStore'
import { useNotificationStore } from '../../store/notificationStore'

const schema = z
  .object({
    firstName: z.string().min(2, 'First name must be at least 2 characters'),
    lastName: z.string().min(2, 'Last name must be at least 2 characters'),
    email: z.string().email('Please enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Must contain at least one number'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type FormData = z.infer<typeof schema>

const Register: React.FC = () => {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const { startPolling } = useNotificationStore()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setIsLoading(true)
    try {
      const result = await registerApi({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        password: data.password,
      })
      setAuth(result.user, result.token)
      startPolling()
      toast.success('Account created successfully!')
      const dashboardMap: Record<string, string> = {
        PATIENT: '/patient/dashboard',
        ADJUSTER: '/adjuster/dashboard',
        FINANCE_OFFICER: '/finance/dashboard',
        ADMIN: '/admin/dashboard',
      }
      navigate(dashboardMap[result.user.role] || '/patient/dashboard')
    } catch (error: unknown) {
      const err = error as { response?: { status?: number; data?: { error?: string; message?: string } } }
      if (err.response?.status === 409) {
        setError('email', {
          type: 'manual',
          message: 'Email address is already registered',
        })
      } else {
        toast.error(err.response?.data?.error || err.response?.data?.message || 'Registration failed. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 rounded-xl mb-4">
            <Heart className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create Your Account</h1>
          <p className="mt-1 text-gray-500">Join the HealthClaims Portal</p>
        </div>

        {/* Card */}
        <div className="card p-6">
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label" htmlFor="firstName">First Name</label>
                <input
                  id="firstName"
                  type="text"
                  autoComplete="given-name"
                  className={`form-input ${errors.firstName ? 'border-red-500' : ''}`}
                  placeholder="John"
                  data-testid="firstname-input"
                  {...register('firstName')}
                />
                {errors.firstName && <p className="form-error">{errors.firstName.message}</p>}
              </div>
              <div>
                <label className="form-label" htmlFor="lastName">Last Name</label>
                <input
                  id="lastName"
                  type="text"
                  autoComplete="family-name"
                  className={`form-input ${errors.lastName ? 'border-red-500' : ''}`}
                  placeholder="Doe"
                  data-testid="lastname-input"
                  {...register('lastName')}
                />
                {errors.lastName && <p className="form-error">{errors.lastName.message}</p>}
              </div>
            </div>

            <div>
              <label className="form-label" htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className={`form-input ${errors.email ? 'border-red-500' : ''}`}
                placeholder="you@example.com"
                data-testid="email-input"
                {...register('email')}
              />
              {errors.email && <p className="form-error">{errors.email.message}</p>}
            </div>

            <div>
              <label className="form-label" htmlFor="password">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={`form-input pr-10 ${errors.password ? 'border-red-500' : ''}`}
                  placeholder="Min. 8 chars, 1 uppercase, 1 number"
                  data-testid="password-input"
                  {...register('password')}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  data-testid="toggle-register-password-visibility"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="form-error">{errors.password.message}</p>}
            </div>

            <div>
              <label className="form-label" htmlFor="confirmPassword">Confirm Password</label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                className={`form-input ${errors.confirmPassword ? 'border-red-500' : ''}`}
                placeholder="Repeat your password"
                data-testid="confirm-password-input"
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && <p className="form-error">{errors.confirmPassword.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full py-2.5"
              data-testid="register-submit-btn"
            >
              <UserPlus className="h-4 w-4" />
              {isLoading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium" data-testid="sign-in-link">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default Register
