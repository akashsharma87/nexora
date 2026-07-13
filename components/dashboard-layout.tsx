'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { AlertTriangle } from 'lucide-react'

import { Sidebar } from './sidebar'

type Profile = { phone?: string | null }

async function fetchProfile(): Promise<{ user: Profile }> {
  const response = await fetch('/api/settings/profile')
  if (!response.ok) throw new Error('Failed to load profile')
  return response.json()
}

// Anyone assigned a Task (mogul-1/2/3 auto-created seats, or a manually-added user who skipped
// the optional phone field) gets no WhatsApp ping for it until a number is on file — see
// notifyTaskAssigned in lib/automation.ts, which silently no-ops without one. Surfaced here, in
// the shared layout, so it follows the person across every page rather than only the dashboard.
function MissingPhoneBanner() {
  const { status } = useSession()
  const { data } = useQuery({
    queryKey: ['settings-profile'],
    queryFn: fetchProfile,
    enabled: status === 'authenticated',
    staleTime: 60000,
  })

  if (!data || data.user.phone) return null

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span>
          Add your WhatsApp number so you get notified when a task is assigned to you.
        </span>
      </div>
      <Link
        href="/settings"
        className="rounded-lg border border-amber-500/30 px-3 py-1 text-xs font-medium hover:bg-amber-500/10 flex-shrink-0"
      >
        Add number
      </Link>
    </div>
  )
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex bg-background">
      <Sidebar />
      <main className="flex-1 ml-64 min-h-screen">
        <div className="p-8">
          <MissingPhoneBanner />
          {children}
        </div>
      </main>
    </div>
  )
}
