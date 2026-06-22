'use client'

import { FormEvent, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Lock, Mail } from 'lucide-react'

export function LoginForm() {
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') ?? '/'
  const [email, setEmail] = useState('manager@demo.com')
  const [password, setPassword] = useState('Demo@1234')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
      callbackUrl,
    })

    setIsSubmitting(false)

    if (result?.error) {
      setError('Invalid email or password.')
      return
    }

    window.location.href = result?.url ?? callbackUrl
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-6 space-y-5">
      <label className="block">
        <span className="text-sm font-medium text-foreground">Email</span>
        <span className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            autoComplete="email"
            className="w-full bg-transparent text-sm outline-none"
            required
          />
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-foreground">Password</span>
        <span className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            className="w-full bg-transparent text-sm outline-none"
            required
          />
        </span>
      </label>

      {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  )
}
