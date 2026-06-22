'use client'

import Link from 'next/link'
import { FormEvent } from 'react'
import { useParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowLeft, Loader2, Save } from 'lucide-react'

import { DashboardLayout } from '@/components/dashboard-layout'
import { campaignBenchmarks } from '@/lib/campaign-benchmarks'
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
  notes?: string | null
}

async function fetchCampaign(id: string): Promise<{ campaign: Campaign }> {
  const response = await fetch(`/api/campaigns/${id}`)
  if (!response.ok) throw new Error('Failed to load campaign')
  return response.json()
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useQuery({ queryKey: ['campaign', params.id], queryFn: () => fetchCampaign(params.id) })

  const updateCampaign = useMutation({
    mutationFn: async (payload: unknown) => {
      const response = await fetch(`/api/campaigns/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Failed to update campaign')
      return response.json()
    },
    onSuccess: () => {
      toast.success('Campaign updated')
      queryClient.invalidateQueries({ queryKey: ['campaign', params.id] })
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
    onError: () => toast.error('Campaign could not be updated'),
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    updateCampaign.mutate({
      name: form.get('name'),
      status: form.get('status'),
      budgetAmount: form.get('budgetAmount'),
      spentAmount: form.get('spentAmount'),
      leadsGenerated: form.get('leadsGenerated'),
      bookingsCount: form.get('bookingsCount'),
      endDate: form.get('endDate'),
      keywords: String(form.get('keywords') ?? '')
        .split(',')
        .map((keyword) => keyword.trim())
        .filter(Boolean),
      notes: form.get('notes'),
    })
  }

  const campaign = data?.campaign
  const benchmark = campaign ? campaignBenchmarks[campaign.type] : undefined
  const actualCpl = campaign && Number(campaign.spentAmount) > 0 && campaign.leadsGenerated > 0
    ? Math.round(Number(campaign.spentAmount) / campaign.leadsGenerated)
    : null

  return (
    <DashboardLayout>
      <div className="max-w-5xl space-y-6">
        <Link href="/campaigns" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to campaigns
        </Link>

        {isLoading && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading campaign...
          </div>
        )}
        {isError && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-destructive">Could not load campaign.</div>}

        {campaign && (
          <>
            <div>
              <h1 className="text-4xl font-bold text-foreground">{campaign.name}</h1>
              <p className="mt-1 text-muted-foreground">
                {eventTypeLabels[campaign.type]} · {campaign.platforms.join(' + ')} · {formatDate(campaign.startDate)} - {formatDate(campaign.endDate)}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-lg border border-border bg-card p-5">
                <p className="text-xs text-muted-foreground">Budget</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(Number(campaign.budgetAmount))}</p>
                {benchmark && <p className="mt-1 text-xs text-muted-foreground">Benchmark: {formatCurrency(benchmark.monthlyBudget)}/mo</p>}
              </div>
              <div className="rounded-lg border border-border bg-card p-5">
                <p className="text-xs text-muted-foreground">Spent</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(Number(campaign.spentAmount))}</p>
                <div className="mt-1.5 w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${Math.min(100, Number(campaign.budgetAmount) > 0 ? (Number(campaign.spentAmount) / Number(campaign.budgetAmount)) * 100 : 0)}%` }}
                  />
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card p-5">
                <p className="text-xs text-muted-foreground">Leads Generated</p>
                <p className="text-2xl font-bold text-foreground">{campaign.leadsGenerated}</p>
                {actualCpl !== null && <p className="mt-1 text-xs text-muted-foreground">Actual CPL: ₹{actualCpl.toLocaleString('en-IN')}</p>}
                {benchmark && benchmark.cplMetaMin && <p className="text-xs text-muted-foreground">Benchmark: ₹{benchmark.cplMetaMin}–{benchmark.cplMetaMax}</p>}
              </div>
              <div className="rounded-lg border border-border bg-card p-5">
                <p className="text-xs text-muted-foreground">Bookings</p>
                <p className="text-2xl font-bold text-foreground">{campaign.bookingsCount}</p>
                {benchmark && benchmark.bookingConversionMin && (
                  <p className="mt-1 text-xs text-muted-foreground">Target: {benchmark.bookingConversionMin}–{benchmark.bookingConversionMax}% conversion</p>
                )}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input name="name" defaultValue={campaign.name} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                <select name="status" defaultValue={campaign.status} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  {['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED'].map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <input name="endDate" type="date" defaultValue={campaign.endDate?.slice(0, 10) ?? ''} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                <input name="budgetAmount" type="number" defaultValue={Number(campaign.budgetAmount)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                <input name="spentAmount" type="number" defaultValue={Number(campaign.spentAmount)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                <input name="leadsGenerated" type="number" defaultValue={campaign.leadsGenerated} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                <input name="bookingsCount" type="number" defaultValue={campaign.bookingsCount} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                <input name="keywords" defaultValue={campaign.keywords.join(', ')} className="md:col-span-2 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <textarea name="notes" defaultValue={campaign.notes ?? ''} rows={4} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                <Save className="h-4 w-4" />
                Save Campaign
              </button>
            </form>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
