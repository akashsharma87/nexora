'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowLeft, CheckSquare, Loader2, Save, Square } from 'lucide-react'

import { DashboardLayout } from '@/components/dashboard-layout'
import { formatCurrency, formatDate, platformLabels } from '@/lib/format'

type ChecklistItem = { label: string; done: boolean }

type PlatformListing = {
  id: string
  platform: string
  status: string
  tier?: string | null
  profileUrl?: string | null
  leadsGenerated: number
  revenueGenerated: string | number
  contentScore: number
  lastUpdatedAt?: string | null
  notes?: string | null
  contentChecklist?: { items: ChecklistItem[] } | null
}

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { label: 'Profile photo uploaded (min. 10 venue photos)', done: false },
  { label: 'Menu cards / packages listed with pricing', done: false },
  { label: 'Banquet hall capacity and layout specified', done: false },
  { label: 'Contact details and WhatsApp number verified', done: false },
  { label: 'Special offers / seasonal packages active', done: false },
  { label: 'Guest reviews / testimonials section live', done: false },
  { label: 'Response rate > 90% maintained', done: false },
  { label: 'Catering options (veg/non-veg/custom) listed', done: false },
  { label: 'Event types offered clearly described', done: false },
  { label: 'Social proof / awards / certifications added', done: false },
]

async function fetchPlatform(id: string): Promise<{ platform: PlatformListing }> {
  const response = await fetch(`/api/platforms/${id}`)
  if (!response.ok) throw new Error('Failed to load platform')
  return response.json()
}

export default function PlatformDetailPage() {
  const params = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [checklist, setChecklist] = useState<ChecklistItem[] | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['platform', params.id],
    queryFn: () => fetchPlatform(params.id),
  })

  useEffect(() => {
    if (data && checklist === null) {
      const existing = data.platform.contentChecklist?.items
      setChecklist(existing && existing.length > 0 ? existing : DEFAULT_CHECKLIST)
    }
  }, [data, checklist])

  const updatePlatform = useMutation({
    mutationFn: async (payload: unknown) => {
      const response = await fetch(`/api/platforms/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Failed to update platform')
      return response.json()
    },
    onSuccess: () => {
      toast.success('Platform updated')
      queryClient.invalidateQueries({ queryKey: ['platform', params.id] })
      queryClient.invalidateQueries({ queryKey: ['platforms'] })
    },
    onError: () => toast.error('Platform could not be updated'),
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    updatePlatform.mutate({
      status: form.get('status'),
      tier: form.get('tier'),
      profileUrl: form.get('profileUrl'),
      leadsGenerated: form.get('leadsGenerated'),
      revenueGenerated: form.get('revenueGenerated'),
      contentScore: form.get('contentScore'),
      lastUpdatedAt: form.get('lastUpdatedAt'),
      notes: form.get('notes'),
      contentChecklist: checklist ? { items: checklist } : undefined,
    })
  }

  function toggleItem(index: number) {
    setChecklist((prev) => {
      if (!prev) return prev
      return prev.map((item, i) => (i === index ? { ...item, done: !item.done } : item))
    })
  }

  const platform = data?.platform

  const effectiveChecklist = checklist ?? (platform?.contentChecklist?.items ?? DEFAULT_CHECKLIST)
  const doneCount = effectiveChecklist.filter((item) => item.done).length
  const scoreFromChecklist = Math.round((doneCount / effectiveChecklist.length) * 100)

  return (
    <DashboardLayout>
      <div className="max-w-5xl space-y-6">
        <Link href="/platforms" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to platforms
        </Link>

        {isLoading && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading platform...
          </div>
        )}
        {isError && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-destructive">Could not load platform.</div>}

        {platform && (
          <>
            <div>
              <h1 className="text-4xl font-bold text-foreground">{platformLabels[platform.platform] ?? platform.platform}</h1>
              <p className="mt-1 text-muted-foreground">{platform.tier ?? 'Standard'} · {platform.status.replaceAll('_', ' ')}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg border border-border bg-card p-5">
                <p className="text-xs text-muted-foreground">Leads</p>
                <p className="text-2xl font-bold text-foreground">{platform.leadsGenerated}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-5">
                <p className="text-xs text-muted-foreground">Revenue</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(Number(platform.revenueGenerated))}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-5">
                <p className="text-xs text-muted-foreground">Content Score</p>
                <div className="flex items-end gap-2">
                  <p className="text-2xl font-bold text-foreground">{platform.contentScore}</p>
                  <p className="text-sm text-muted-foreground mb-0.5">/ 100</p>
                </div>
                <div className="mt-2 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${platform.contentScore >= 80 ? 'bg-green-500' : platform.contentScore >= 50 ? 'bg-amber-500' : 'bg-destructive'}`}
                    style={{ width: `${platform.contentScore}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <form onSubmit={handleSubmit} className="xl:col-span-2 rounded-lg border border-border bg-card p-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <select name="status" defaultValue={platform.status} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    {['ACTIVE', 'INACTIVE', 'PENDING_SETUP', 'SUSPENDED'].map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <input name="tier" defaultValue={platform.tier ?? ''} placeholder="Tier" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  <input name="profileUrl" defaultValue={platform.profileUrl ?? ''} placeholder="Profile URL" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  <input name="leadsGenerated" type="number" defaultValue={platform.leadsGenerated} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  <input name="revenueGenerated" type="number" defaultValue={Number(platform.revenueGenerated)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  <input name="contentScore" type="number" min="0" max="100" defaultValue={scoreFromChecklist || platform.contentScore} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  <input name="lastUpdatedAt" type="date" defaultValue={platform.lastUpdatedAt?.slice(0, 10) ?? ''} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
                <textarea name="notes" defaultValue={platform.notes ?? ''} rows={4} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                <p className="text-xs text-muted-foreground">Current last update: {formatDate(platform.lastUpdatedAt)}</p>
                <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                  <Save className="h-4 w-4" />
                  Save Listing
                </button>
              </form>

              <div className="rounded-lg border border-border bg-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-foreground">Content Checklist</h2>
                  <span className="text-sm font-medium text-primary">{doneCount}/{effectiveChecklist.length}</span>
                </div>
                <div className="mb-3 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${scoreFromChecklist >= 80 ? 'bg-green-500' : scoreFromChecklist >= 50 ? 'bg-amber-500' : 'bg-primary'}`}
                    style={{ width: `${scoreFromChecklist}%` }}
                  />
                </div>
                <div className="space-y-2.5">
                  {effectiveChecklist.map((item, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => toggleItem(index)}
                      className="flex items-start gap-2.5 w-full text-left group"
                    >
                      {item.done
                        ? <CheckSquare className="h-4 w-4 mt-0.5 flex-shrink-0 text-green-500" />
                        : <Square className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground group-hover:text-foreground" />
                      }
                      <span className={`text-xs leading-relaxed ${item.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                        {item.label}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-4 text-xs text-muted-foreground">Checklist is saved with the listing.</p>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
