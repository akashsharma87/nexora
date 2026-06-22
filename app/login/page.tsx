import { Suspense } from 'react'
import Link from 'next/link'

import { LoginForm } from './login-form'

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-xl">
            N
          </div>
          <h1 className="text-3xl font-bold">Sign in to NEXORA</h1>
          <p className="mt-2 text-sm text-muted-foreground">Enter your credentials to continue.</p>
        </div>

        <Suspense fallback={<div className="h-72 rounded-lg border border-border bg-card" />}>
          <LoginForm />
        </Suspense>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          No account yet?{' '}
          <Link href="/register" className="text-primary underline underline-offset-4">
            Create one
          </Link>
        </p>
      </div>
    </main>
  )
}
