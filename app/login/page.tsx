import { Suspense } from 'react'

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
          <p className="mt-2 text-sm text-muted-foreground">Use the demo hotel manager account to continue.</p>
        </div>

        <Suspense fallback={<div className="h-72 rounded-lg border border-border bg-card" />}>
          <LoginForm />
        </Suspense>

        <div className="mt-4 rounded-lg border border-border bg-card/60 p-4 text-sm text-muted-foreground">
          Demo accounts: <span className="text-foreground">owner@demo.com</span>,{' '}
          <span className="text-foreground">manager@demo.com</span>, <span className="text-foreground">exec@demo.com</span>.
          Password: <span className="text-foreground">Demo@1234</span>.
        </div>
      </div>
    </main>
  )
}
