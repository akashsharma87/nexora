'use client'

import { FormEvent, useState } from 'react'
import { signIn } from 'next-auth/react'
import { Building2, Lock, Mail, User } from 'lucide-react'

import { PRIYA_COUNTRY_SUGGESTIONS } from '@/lib/priya-country-suggestions'

export function RegisterForm() {
  const [name, setName] = useState('')
  const [hotelName, setHotelName] = useState('')
  const [country, setCountry] = useState('India')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, hotelName, country, email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Registration failed.')
        setIsSubmitting(false)
        return
      }

      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
        callbackUrl: '/',
      })

      if (result?.error) {
        setError('Account created but sign-in failed. Please log in manually.')
        setIsSubmitting(false)
        return
      }

      window.location.href = '/'
    } catch {
      setError('Something went wrong. Please try again.')
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-6 space-y-5">
      <label className="block">
        <span className="text-sm font-medium text-foreground">Your name</span>
        <span className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <User className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            type="text"
            autoComplete="name"
            placeholder="e.g. Rajesh Kumar"
            className="w-full bg-transparent text-sm outline-none"
            required
          />
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-foreground">Hotel / Property name</span>
        <span className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            value={hotelName}
            onChange={(e) => setHotelName(e.target.value)}
            type="text"
            placeholder="e.g. Grand Banquets Delhi"
            className="w-full bg-transparent text-sm outline-none"
            required
          />
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-foreground">Country</span>
        <span className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            type="text"
            list="priya-country-suggestions"
            placeholder="e.g. India"
            className="w-full bg-transparent text-sm outline-none"
            required
          />
        </span>
        <datalist id="priya-country-suggestions">
          {PRIYA_COUNTRY_SUGGESTIONS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <span className="mt-1 block text-xs text-muted-foreground">
          Where your leads are based — determines whether Priya (AI calling/WhatsApp) defaults to
          Hinglish or English (or an Indian-accented English for nearby countries).
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-foreground">Email</span>
        <span className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            placeholder="you@hotel.com"
            className="w-full bg-transparent text-sm outline-none"
            required
          />
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-foreground">Password</span>
        <span className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="new-password"
            placeholder="Minimum 6 characters"
            className="w-full bg-transparent text-sm outline-none"
            required
            minLength={6}
          />
        </span>
      </label>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Creating account...' : 'Create account'}
      </button>
    </form>
  )
}
