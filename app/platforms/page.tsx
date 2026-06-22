'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { AlertCircle, CheckCircle, ExternalLink, Eye, Loader2, Plus, TrendingUp } from 'lucide-react'

import { DashboardLayout } from '@/components/dashboard-layout'
import { formatCurrency, formatDate, platformLabels } from '@/lib/format'

const PLATFORM_URLS: Record<string, string> = {
  WEDMEGOOD: 'https://www.wedmegood.com/vendor/signup',
  WEDDINGZ: 'https://www.weddingz.in/vendor-signup.html',
  VENUELOOK: 'https://www.venuelook.com/list-venue',
  WEDDINGBAZAAR: 'https://www.weddingbazaar.com/list-your-business',
  GOOGLE_BUSINESS: 'https://business.google.com',
  JUSTDIAL: 'https://www.justdial.com/business',
}

const PLATFORM_DESCRIPTIONS: Record<string, string> = {
  WEDMEGOOD: 'Premium wedding discovery — 10,000+ venues, high-intent wedding audience',
  WEDDINGZ: 'OYO-backed platform — strong in destination weddings & vendor marketplace',
  VENUELOOK: 'Free quote system — 50+ cities, all event types, high-volume top-of-funnel',
  WEDDINGBAZAAR: 'Pan-India reach — dedicated account management, verified listing',
  GOOGLE_BUSINESS: 'Google Search & Maps — essential local SEO, where all discovery starts',
  JUSTDIAL: 'B2B & local — high call volume, strong for corporate and local searches',
}

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
  const { data, isLoading, isError } = useQuery({ queryKey: ['platforms'], queryFn: fetchPlatforms })

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
          {platforms.map((platform) => {
            const isActive = platform.status === 'ACTIVE'
            const isPending = platform.status === 'PENDING_SETUP'
            const externalUrl = PLATFORM_URLS[platform.platform]
            const description = PLATFORM_DESCRIPTIONS[platform.platform]

            return (
              <div key={platform.id} className="bg-card rounded-lg border border-border overflow-hidden hover:shadow-lg transition-shadow flex flex-col">
                <div className={`px-6 py-4 border-b border-border flex justify-between items-start ${isActive ? 'bg-green-50 dark:bg-green-950' : isPending ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-muted/50'}`}>
                  <div className="flex-1 min-w-0 pr-2">
                    <Link href={`/platforms/${platform.id}`} className="text-lg font-semibold text-foreground hover:underline">
                      {platformLabels[platform.platform] ?? platform.platform}
                    </Link>
                    <p className="text-xs text-muted-foreground mt-0.5">{platform.tier ?? 'Standard'} Plan</p>
                  </div>
                  <span className={`shrink-0 px-2 py-1 rounded text-xs font-semibold ${isActive ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : isPending ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' : 'bg-muted text-muted-foreground'}`}>
                    {platform.status.replaceAll('_', ' ')}
                  </span>
                </div>

                {description && (
                  <div className="px-6 pt-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
                  </div>
                )}

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
                      <p className={`text-xl font-bold ${platform.contentScore >= 80 ? 'text-green-600' : platform.contentScore >= 50 ? 'text-amber-600' : 'text-foreground'}`}>{platform.contentScore}</p>
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${platform.contentScore >= 80 ? 'bg-green-500' : platform.contentScore >= 50 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${Math.max(platform.contentScore, 3)}%` }} />
                  </div>
                  {platform.lastUpdatedAt && (
                    <p className="text-xs text-muted-foreground mt-2">Last updated: {formatDate(platform.lastUpdatedAt)}</p>
                  )}
                </div>

                <div className="px-6 py-4 flex gap-2 mt-auto">
                  {externalUrl && (
                    <a
                      href={externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 px-3 py-2 bg-primary text-primary-foreground hover:opacity-90 rounded text-sm font-medium transition-opacity flex items-center justify-center gap-1.5"
                    >
                      <ExternalLink size={13} />
                      {isActive ? 'Manage Listing' : 'Set Up Listing'}
                    </a>
                  )}
                  <Link
                    href={`/platforms/${platform.id}`}
                    className="flex-1 px-3 py-2 text-accent hover:bg-accent/10 rounded text-sm font-medium border border-accent transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Eye size={13} />
                    Checklist
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </DashboardLayout>
  )
}
