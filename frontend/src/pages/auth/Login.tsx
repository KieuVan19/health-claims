import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Heart, Eye, EyeOff, LogIn } from 'lucide-react'
import toast from 'react-hot-toast'
import { login } from '../../api/auth'
import { useAuthStore } from '../../store/authStore'
import { useNotificationStore } from '../../store/notificationStore'

const schema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type FormData = z.infer<typeof schema>

const Login: React.FC = () => {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const { startPolling } = useNotificationStore()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const [selectedDemo, setSelectedDemo] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const demoAccounts = [
    { role: 'Admin', email: 'admin@healthclaims.com', password: 'Admin123!' },
    { role: 'Adjuster', email: 'adjuster1@healthclaims.com', password: 'Adjuster123!' },
    { role: 'Adjuster 2', email: 'adjuster2@healthclaims.com', password: 'Adjuster123!' },
    { role: 'Finance', email: 'finance@healthclaims.com', password: 'Finance123!' },
    { role: 'Patient', email: 'patient1@healthclaims.com', password: 'Patient123!' },
    { role: 'Patient 2', email: 'patient2@healthclaims.com', password: 'Patient123!' },
  ]

  const handleDemoSelect = (account: typeof demoAccounts[0]) => {
    if (selectedDemo === account.role) {
      setSelectedDemo(null)
      setValue('email', '')
      setValue('password', '')
    } else {
      setSelectedDemo(account.role)
      setValue('email', account.email, { shouldValidate: true })
      setValue('password', account.password, { shouldValidate: true })
    }
  }

  const onSubmit = async (data: FormData) => {
    setIsLoading(true)
    try {
      const result = await login(data.email, data.password)
      setAuth(result.user, result.token)
      if (result.user.role !== 'ADMIN') startPolling()
      navigate('/dashboard')
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Invalid email or password')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 rounded-xl mb-4">
            <Heart className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">HealthClaims Portal</h1>
          <p className="mt-1 text-gray-500">Sign in to your account</p>
        </div>

        {/* Card */}
        <div className="card p-6">
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div>
              <label className="form-label" htmlFor="email">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className={`form-input ${errors.email ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                placeholder="you@example.com"
                data-testid="email-input"
                {...register('email')}
              />
              {errors.email && <p className="form-error">{errors.email.message}</p>}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="form-label mb-0" htmlFor="password">
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className={`form-input pr-10 ${errors.password ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                  placeholder="••••••••"
                  data-testid="password-input"
                  {...register('password')}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="form-error">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full py-2.5"
              data-testid="login-submit-btn"
            >
              <LogIn className="h-4 w-4" />
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-600">
            Don't have an account?{' '}
            <Link to="/register" className="text-blue-600 hover:text-blue-700 font-medium">
              Create one
            </Link>
          </p>
        </div>

        {/* Demo credentials */}
        <div className="mt-4 card p-4 bg-amber-50 border-amber-200">
          <p className="text-xs font-semibold text-amber-800 mb-2">Quick Login — Demo Accounts</p>
          <div className="space-y-1.5">
            {demoAccounts.map((account) => (
              <label
                key={account.role}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={selectedDemo === account.role}
                  onChange={() => handleDemoSelect(account)}
                  className="w-3.5 h-3.5 rounded border-amber-400 text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <span className="text-xs text-amber-700 group-hover:text-amber-900">
                  <span className="font-medium">{account.role}</span>
                  {' — '}{account.email}{' / '}{account.password}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
