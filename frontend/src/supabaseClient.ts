import { createClient, SupabaseClient, Session } from '@supabase/supabase-js'
import { clearLocalUserData } from './offline'

export interface UserProfile {
  id: string
  email: string
  fullName?: string
  avatarUrl?: string
}

export interface AuthConfig {
  supabaseUrl: string
  supabaseAnonKey: string
  isConfigured: boolean
}

let supabaseInstance: SupabaseClient | null = null
let authConfig: AuthConfig = {
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL || '').trim(),
  supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim(),
  isConfigured: false,
}

if (authConfig.supabaseUrl && authConfig.supabaseAnonKey) {
  try {
    supabaseInstance = createClient(authConfig.supabaseUrl, authConfig.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
    authConfig.isConfigured = true
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err)
  }
}

export async function initSupabase(): Promise<SupabaseClient | null> {
  if (supabaseInstance) return supabaseInstance

  try {
    const res = await fetch('/api/auth/config')
    if (res.ok) {
      const data = await res.json()
      if (data.supabase_url && data.supabase_anon_key) {
        authConfig = {
          supabaseUrl: data.supabase_url.trim(),
          supabaseAnonKey: data.supabase_anon_key.trim(),
          isConfigured: true,
        }
        supabaseInstance = createClient(authConfig.supabaseUrl, authConfig.supabaseAnonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        })
        return supabaseInstance
      }
    }
  } catch (err) {
    console.warn('Could not fetch backend auth config:', err)
  }

  return supabaseInstance
}

export function getSupabase(): SupabaseClient | null {
  return supabaseInstance
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseInstance && authConfig.isConfigured)
}

// Dev mode storage helpers
const DEV_TOKEN_KEY = 'scribeflow_dev_auth_token'
const DEV_USER_KEY = 'scribeflow_dev_auth_user'

export function getDevAuth(): { token: string; user: UserProfile } | null {
  const token = localStorage.getItem(DEV_TOKEN_KEY)
  const userJson = localStorage.getItem(DEV_USER_KEY)
  if (!token || !userJson) return null
  try {
    return { token, user: JSON.parse(userJson) }
  } catch {
    return null
  }
}

export function setDevAuth(token: string, user: UserProfile) {
  localStorage.setItem(DEV_TOKEN_KEY, token)
  localStorage.setItem(DEV_USER_KEY, JSON.stringify(user))
}

export function clearDevAuth() {
  localStorage.removeItem(DEV_TOKEN_KEY)
  localStorage.removeItem(DEV_USER_KEY)
}

/**
 * Perform Google Sign-In using Supabase OAuth.
 * Strict scopes: only 'email profile' (Never requests YouTube scopes).
 */
export async function signInWithGoogle() {
  const client = await initSupabase()
  if (!client) {
    throw new Error('Supabase is not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY in .env.')
  }

  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      scopes: 'email profile',
    },
  })

  if (error) throw error
}

/**
 * Sign up with email and password.
 */
export async function signUpWithEmail(email: string, password: string, fullName?: string) {
  const client = await initSupabase()
  if (client) {
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName || '' },
        emailRedirectTo: window.location.origin,
      },
    })
    if (error) throw error
    return {
      user: data.user
        ? {
            id: data.user.id,
            email: data.user.email || email,
            fullName: data.user.user_metadata?.full_name || fullName,
          }
        : null,
      session: data.session,
      requiresEmailVerification: !data.session,
    }
  }

  // Development fallback
  const res = await fetch('/api/auth/dev-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: fullName, is_signup: true }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Sign up failed')
  }
  const data = await res.json()
  const user: UserProfile = {
    id: data.user.id,
    email: data.user.email,
    fullName: data.user.user_metadata?.full_name || fullName,
  }
  setDevAuth(data.access_token, user)
  return {
    user,
    session: null,
    token: data.access_token,
    requiresEmailVerification: false,
  }
}

/**
 * Sign in with email and password.
 */
export async function signInWithEmail(email: string, password: string) {
  const client = await initSupabase()
  if (client) {
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    return {
      user: data.user
        ? {
            id: data.user.id,
            email: data.user.email || email,
            fullName: data.user.user_metadata?.full_name,
            avatarUrl: data.user.user_metadata?.avatar_url,
          }
        : null,
      session: data.session,
      token: data.session?.access_token || null,
    }
  }

  // Development fallback
  const res = await fetch('/api/auth/dev-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, is_signup: false }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Sign in failed')
  }
  const data = await res.json()
  const user: UserProfile = {
    id: data.user.id,
    email: data.user.email,
    fullName: data.user.user_metadata?.full_name,
  }
  setDevAuth(data.access_token, user)
  return {
    user,
    session: null,
    token: data.access_token,
  }
}

/**
 * Request password reset email.
 */
export async function sendPasswordResetEmail(email: string) {
  const client = await initSupabase()
  if (client) {
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}#reset-password`,
    })
    if (error) throw error
    return true
  }

  // Dev fallback
  await new Promise((resolve) => setTimeout(resolve, 600))
  return true
}

/**
 * Update user password (used after password reset recovery).
 */
export async function updateUserPassword(newPassword: string) {
  const client = await initSupabase()
  if (client) {
    const { error } = await client.auth.updateUser({ password: newPassword })
    if (error) throw error
    return true
  }
  return true
}

/**
 * Sign out and clear local cached study sets, drafts, and session.
 */
export async function signOutUser(userId?: string) {
  const client = await initSupabase()
  if (client) {
    try {
      await client.auth.signOut()
    } catch (e) {
      console.warn('Supabase signOut warning:', e)
    }
  }
  clearDevAuth()
  await clearLocalUserData(userId)
}
