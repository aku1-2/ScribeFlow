import React, { useState } from 'react'
import {
  LogIn,
  UserPlus,
  KeyRound,
  Mail,
  Lock,
  User as UserIcon,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
  Sparkles,
} from 'lucide-react'
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  sendPasswordResetEmail,
  UserProfile,
} from './supabaseClient'

interface AuthViewProps {
  onSuccess: (user: UserProfile, token: string) => void
  onCancel?: () => void
  initialMode?: 'signin' | 'signup' | 'reset'
  redirectMessage?: string
}

export const AuthView: React.FC<AuthViewProps> = ({
  onSuccess,
  onCancel,
  initialMode = 'signin',
  redirectMessage,
}) => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccessMessage(null)

    const cleanEmail = email.trim()
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }

    if (mode === 'reset') {
      setIsLoading(true)
      try {
        await sendPasswordResetEmail(cleanEmail)
        setSuccessMessage('Password reset link sent! Check your email inbox to reset your password.')
      } catch (err: any) {
        setError(err.message || 'Failed to send password reset email. Please try again.')
      } finally {
        setIsLoading(false)
      }
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }

    setIsLoading(true)
    try {
      if (mode === 'signup') {
        const res = await signUpWithEmail(cleanEmail, password, fullName.trim() || undefined)
        if (res.requiresEmailVerification) {
          setSuccessMessage(
            'Account created! We sent a confirmation link to your email. Please verify your address to sign in.'
          )
        } else if (res.user && res.token) {
          onSuccess(res.user, res.token)
        } else if (res.user) {
          setSuccessMessage('Sign up successful! Please sign in with your credentials.')
          setMode('signin')
        }
      } else {
        const res = await signInWithEmail(cleanEmail, password)
        if (res.user && res.token) {
          onSuccess(res.user, res.token)
        }
      }
    } catch (err: any) {
      console.error('Auth error:', err)
      setError(err.message || 'Authentication failed. Please check your credentials.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setError(null)
    setIsGoogleLoading(true)
    try {
      await signInWithGoogle()
    } catch (err: any) {
      console.error('Google sign-in error:', err)
      setError(
        err.message ||
          'Google Sign-In is unavailable. Ensure SUPABASE_URL and Google OAuth are configured in Supabase Console.'
      )
      setIsGoogleLoading(false)
    }
  }

  return (
    <div className="auth-overlay" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
      <div className="auth-card">
        {onCancel && (
          <button
            className="auth-close-btn"
            onClick={onCancel}
            aria-label="Close dialog and return to public page"
          >
            <X size={20} />
          </button>
        )}

        <div className="auth-header">
          <div className="auth-logo-badge">
            <Sparkles size={24} className="text-amber-500" />
          </div>
          <h2 id="auth-modal-title" className="auth-title">
            {mode === 'signin' && 'Sign in to ScribeFlow'}
            {mode === 'signup' && 'Create your ScribeFlow account'}
            {mode === 'reset' && 'Reset your password'}
          </h2>
          <p className="auth-subtitle">
            {redirectMessage ||
              (mode === 'signin'
                ? 'Access your saved study sets, flashcards, and lecture transcripts.'
                : mode === 'signup'
                ? 'Join ScribeFlow to create, save, and review AI-generated study sets.'
                : "Enter your account email and we'll send you a password reset link.")}
          </p>
        </div>

        {error && (
          <div className="auth-alert auth-alert-error" role="alert">
            <AlertCircle size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="auth-alert auth-alert-success" role="status">
            <CheckCircle2 size={18} className="shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {mode !== 'reset' && (
          <>
            <button
              type="button"
              className="google-btn"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading || isLoading}
            >
              {isGoogleLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <svg className="google-icon" viewBox="0 0 24 24" width="18" height="18">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span>Continue with Google</span>
            </button>

            <div className="auth-divider">
              <span>or continue with email</span>
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          {mode === 'signup' && (
            <div className="auth-field">
              <label htmlFor="auth-fullname">Full Name (optional)</label>
              <div className="auth-input-wrapper">
                <UserIcon size={18} className="auth-input-icon" />
                <input
                  id="auth-fullname"
                  type="text"
                  placeholder="Jane Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="auth-email">Email Address</label>
            <div className="auth-input-wrapper">
              <Mail size={18} className="auth-input-icon" />
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
          </div>

          {mode !== 'reset' && (
            <div className="auth-field">
              <div className="auth-field-header">
                <label htmlFor="auth-password">Password</label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    className="auth-link-btn"
                    onClick={() => {
                      setMode('reset')
                      setError(null)
                      setSuccessMessage(null)
                    }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="auth-input-wrapper">
                <Lock size={18} className="auth-input-icon" />
                <input
                  id="auth-password"
                  type="password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
            </div>
          )}

          <button type="submit" className="auth-submit-btn" disabled={isLoading || isGoogleLoading}>
            {isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Please wait...</span>
              </>
            ) : mode === 'signin' ? (
              <>
                <LogIn size={18} />
                <span>Sign In</span>
              </>
            ) : mode === 'signup' ? (
              <>
                <UserPlus size={18} />
                <span>Create Account</span>
              </>
            ) : (
              <>
                <KeyRound size={18} />
                <span>Send Reset Link</span>
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          {mode === 'signin' ? (
            <p>
              Don't have an account?{' '}
              <button
                type="button"
                className="auth-link-bold"
                onClick={() => {
                  setMode('signup')
                  setError(null)
                  setSuccessMessage(null)
                }}
              >
                Sign up
              </button>
            </p>
          ) : mode === 'signup' ? (
            <p>
              Already have an account?{' '}
              <button
                type="button"
                className="auth-link-bold"
                onClick={() => {
                  setMode('signin')
                  setError(null)
                  setSuccessMessage(null)
                }}
              >
                Sign in
              </button>
            </p>
          ) : (
            <p>
              Remembered your password?{' '}
              <button
                type="button"
                className="auth-link-bold"
                onClick={() => {
                  setMode('signin')
                  setError(null)
                  setSuccessMessage(null)
                }}
              >
                Back to Sign In
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
