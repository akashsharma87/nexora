'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { AlertCircle, CheckCircle, Eye, Loader2, Plus, Settings, TrendingUp } from 'lucide-react'

import { DashboardLayout } from '@/components/dashboard-layout'
import { formatCurrency, formatDate, platformLabels } from '@/lib/format'

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
}

async function fetchPlatforms(): Promise<{ platforms: PlatformListing[] }> {
  const response = await fetch('/api/platforms')
  if (!response.ok) throw new Error('Failed to load platforms')
  return response.json()
}

export default function PlatformsPage() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useQuery({ queryKey: ['platforms'], queryFn: fetchPlatforms })

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await fetch(`/api/platforms/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!response.ok) throw new Error('Failed to update listing')
      return response.json()
    },
    onSuccess: () => {
      toast.success('Listing updated')
      queryClient.invalidateQueries({ queryKey: ['platforms'] })
    },
    onError: () => toast.error('Listing could not be updated'),
  })

  const platforms = data?.platforms ?? []
  const connectedCount = platforms.filter((platform) => platform.status === 'ACTIVE').length
  const totalLeads = platforms.reduce((total, platform) => total + platform.leadsGenerated, 0)
  const issueCount = platforms.filter((platform) => platform.status !== 'ACTIVE').length

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-4xl font-bold text-foreground">Platform Listings</h1>
            <p className="text-muted-foreground mt-1">Manage discovery-platform visibility and lead attribution across the six venue channels.</p>
          </div>
          <button className="w-fit px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity text-sm font-medium flex items-center gap-2">
            <Plus size={18} />
            Add Platform
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: 'Connected Platforms', value: connectedCount, icon: CheckCircle, color: 'text-green-500' },
            { label: 'Total Leads', value: totalLeads, icon: TrendingUp, color: 'text-primary' },
            { label: 'Setup Issues', value: issueCount, icon: AlertCircle, color: 'text-orange-500' },
          ].map((stat) => {
            const Icon = stat.icon
            return (
              <div key={stat.label} className="bg-card rounded-lg border border-border p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
                    <p className="text-3xl font-bold text-foreground">{stat.value}</p>
                  </div>
                  <Icon className={`w-8 h-8 ${stat.color}`} />
                </div>
              </div>
            )
          })}
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading platform listings...
          </div>
        )}
        {isError && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-destructive">Could not load platform listings.</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {platforms.map((platform) => (
            <div key={platform.id} className="bg-card rounded-lg border border-border overflow-hidden hover:shadow-lg transition-shadow">
              <div className={`px-6 py-4 border-b border-border flex justify-between items-start ${platform.status === 'ACTIVE' ? 'bg-green-50 dark:bg-green-950' : 'bg-muted/50'}`}>
                <div>
                  <Link href={`/platforms/${platform.id}`} className="text-lg font-semibold text-foreground hover:underline">
                    {platformLabels[platform.platform] ?? platform.platform}
                  </Link>
                  <p className="text-xs text-muted-foreground">{platform.tier ?? 'Standard'} Plan</p>
                </div>
                <span className="px-2 py-1 bg-card text-foreground rounded text-xs font-semibold">{platform.status.replaceAll('_', ' ')}</span>
              </div>

              <div className="px-6 py-4 border-b border-border">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Leads</p>
                    <p className="text-xl font-bold text-foreground">{platform.leadsGenerated}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Revenue</p>
                    <p className="text-xl font-bold text-secondary">{formatCurrency(Number(platform.revenueGenerated))}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Score</p>
                    <p className="text-xl font-bold text-primary">{platform.contentScore}</p>
                  </div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${platform.contentScore}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-3">Last updated: {formatDate(platform.lastUpdatedAt)}</p>
              </div>

              <div className="px-6 py-4 flex gap-2">
                <button className="flex-1 px-3 py-2 text-accent hover:bg-accent/10 rounded text-sm font-medium border border-accent transition-colors flex items-center justify-center gap-1">
                  <Eye size={14} />
                  View Leads
                </button>
                <button
                  onClick={() => updateMutation.mutate({ id: platform.id, status: platform.status === 'ACTIVE' ? 'PENDING_SETUP' : 'ACTIVE' })}
                  className="flex-1 px-3 py-2 bg-muted text-foreground hover:bg-muted/80 rounded text-sm font-medium transition-colors flex items-center justify-center gap-1"
                >
                  <Settings size={14} />
                  {platform.status === 'ACTIVE' ? 'Pause' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  )
}
