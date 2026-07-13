'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Calendar, DollarSign, Loader2, Plus, Target, Users } from 'lucide-react'

import { DashboardLayout } from '@/components/dashboard-layout'
import { eventTypeLabels, formatCurrency, formatDate } from '@/lib/format'

type Campaign = {
  id: string
  name: string
  type: string
  platforms: string[]
  budgetAmount: string | number
  spentAmount: string | number
  leadsGenerated: number
  bookingsCount: number
  status: string
  startDate: string
  endDate?: string | null
  keywords: string[]
}

async function fetchCampaigns(): Promise<{ campaigns: Campaign[] }> {
  const response = await fetch('/api/campaigns')
  if (!response.ok) throw new Error('Failed to load campaigns')
  return response.json()
}

const statusBadgeClasses: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  DRAFT: 'bg-muted text-muted-foreground',
  PAUSED: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  COMPLETED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
}

const campaignBudgets: Record<string, number> = {
  SOCIAL_EVENTS: 80000,
  CORPORATE_EVENTS: 70000,
  BIRTHDAY_SOCIAL: 20000,
  PROMOTIONAL_EVENTS: 15000,
  ENTERTAINMENT_EVENTS: 10000,
  SEASONAL_THEMATIC: 5000,
}

export default function CampaignsPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [selectedType, setSelectedType] = useState('SOCIAL_EVENTS')
  const [budgetAmount, setBudgetAmount] = useState(campaignBudgets['SOCIAL_EVENTS'])
  const { data, isLoading, isError } = useQuery({ queryKey: ['campaigns'], queryFn: fetchCampaigns })

  const createMutation = useMutation({
    mutationFn: async (payload: unknown) => {
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Failed to create campaign')
      return response.json()
    },
    onSuccess: () => {
      toast.success('Campaign created')
      setShowForm(false)
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
    onError: () => toast.error('Campaign could not be created'),
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    createMutation.mutate({
      name: form.get('name'),
      type: form.get('type'),
      platforms: ['META', 'GOOGLE'],
      budgetAmount: form.get('budgetAmount'),
      spentAmount: 0,
      leadsGenerated: 0,
      bookingsCount: 0,
      status: 'ACTIVE',
      startDate: form.get('startDate'),
      endDate: form.get('endDate'),
      keywords: String(form.get('keywords') ?? '')
        .split(',')
        .map((keyword) => keyword.trim())
        .filter(Boolean),
    })
  }

  const campaigns = data?.campaigns ?? []

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-4xl font-bold text-foreground">Campaigns</h1>
            <p className="text-muted-foreground mt-1">Manage the six banquet campaign types and track budget, leads, and bookings.</p>
          </div>
          <button onClick={() => setShowForm((value) => !value)} className="w-fit px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity text-sm font-medium flex items-center gap-2">
            <Plus size={18} />
            Create Campaign
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <input name="name" required placeholder="Campaign name" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <select
              name="type"
              value={selectedType}
              onChange={(event) => {
                setSelectedType(event.target.value)
                setBudgetAmount(campaignBudgets[event.target.value] ?? 0)
              }}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              {Object.entries(eventTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              name="budgetAmount"
              type="number"
              value={budgetAmount}
              onChange={(event) => setBudgetAmount(Number(event.target.value))}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <input name="startDate" type="date" required className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <input name="endDate" type="date" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <input name="keywords" placeholder="keywords, comma separated" className="md:col-span-2 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <button disabled={createMutation.isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              {createMutation.isPending ? 'Creating...' : 'Save Campaign'}
            </button>
          </form>
        )}

        {isLoading && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading campaigns...
          </div>
        )}
        {isError && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-destructive">Could not load campaigns.</div>}

        {!isLoading && !isError && campaigns.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
            <p className="font-medium text-foreground">No campaigns yet.</p>
            <p className="mt-1 text-sm">
              Connect Meta or Google Ads under{' '}
              <Link href="/settings/integrations" className="text-primary hover:underline">
                Settings → Integrations
              </Link>{' '}
              and sync to pull in real campaigns, or create one manually above.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {campaigns.map((campaign) => {
            const budget = Number(campaign.budgetAmount)
            const spent = Number(campaign.spentAmount)
            const spendPercent = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0
            const cpl = campaign.leadsGenerated > 0 ? spent / campaign.leadsGenerated : 0

            return (
              <div key={campaign.id} className="bg-card rounded-lg border border-border overflow-hidden hover:shadow-lg transition-shadow">
                <div className="p-6 border-b border-border flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Link href={`/campaigns/${campaign.id}`} className="text-lg font-semibold text-foreground hover:underline">
                        {campaign.name}
                      </Link>
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${statusBadgeClasses[campaign.status] ?? 'bg-muted text-muted-foreground'}`}>{campaign.status}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{eventTypeLabels[campaign.type] ?? campaign.type} · {campaign.platforms.join(' + ')}</p>
                  </div>
                  <Target className="h-5 w-5 text-primary" />
                </div>

                <div className="p-6 space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <DollarSign size={14} />
                        Budget Spent
                      </span>
                      <span className="text-sm font-semibold text-foreground">{formatCurrency(spent)} / {formatCurrency(budget)}</span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-accent to-primary rounded-full" style={{ width: `${spendPercent}%` }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Leads</p>
                      <p className="text-xl font-bold text-foreground">{campaign.leadsGenerated}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">CPL</p>
                      <p className="text-xl font-bold text-foreground">{formatCurrency(cpl)}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Bookings</p>
                      <p className="text-xl font-bold text-foreground">{campaign.bookingsCount}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border">
                    <Calendar size={14} />
                    {formatDate(campaign.startDate)} - {formatDate(campaign.endDate)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </DashboardLayout>
  )
}
