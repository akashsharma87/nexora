'use client'

import { useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertCircle, Calendar, CheckCircle, Download, Loader2 } from 'lucide-react'

import { DashboardLayout } from '@/components/dashboard-layout'
import { eventTypeLabels, formatCurrency, leadStageLabels, sourceLabels } from '@/lib/format'

async function apiGet<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to load ${url}`)
  return response.json()
}

const colors = ['#8B5CF6', '#3B82F6', '#EC4899', '#10B981', '#F59E0B', '#6366F1', '#14B8A6', '#F97316']

type DashboardData = {
  metrics: {
    newLeads: number
    proposalsSent: number
    bookingsConfirmed: number
    revenuePipelineLakhs: number
  }
}

type FunnelData = {
  funnel: { stage: string; count: number; percentage: number }[]
  total: number
}

type SourcesData = {
  sources: { source: string; count: number; revenue: number }[]
  campaigns: {
    id: string
    name: string
    leadsGenerated: number
    budgetAmount: string | number
    spentAmount: string | number
    bookingsCount: number
    type: string
  }[]
  revenueByEventType: { eventType: string; revenue: number }[]
}

type AttributionRow = {
  id: string
  name: string
  type: string
  status: string
  platforms: string[]
  leadsGenerated: number
  bookingsCount: number
  budgetAmount: number
  spentAmount: number
  spendPct: number
  actualCpl: number | null
  benchmarkCplMin: number | null
  benchmarkCplMax: number | null
  benchmarkConversionMin: number | null
  benchmarkConversionMax: number | null
  cplStatus: 'good' | 'over' | 'under' | 'no-data'
}

type SourceRow = {
  source: string
  leads: number
  booked: number
  conversionRate: number
}

const CPL_STATUS_CHIP: Record<string, { label: string; className: string }> = {
  good: { label: 'Within benchmark', className: 'bg-green-500/10 text-green-500' },
  over: { label: 'Above benchmark', className: 'bg-destructive/10 text-destructive' },
  under: { label: 'Below benchmark', className: 'bg-blue-500/10 text-blue-500' },
  'no-data': { label: 'No data', className: 'bg-muted text-muted-foreground' },
}

type ActivityData = {
  calls: {
    placed: number
    byStatus: { status: string; count: number }[]
    byOutcome: { outcome: string; count: number }[]
  }
  whatsapp: {
    nurtureSent: { templateType: string; count: number }[]
    postCallSent: number
  }
  revenue: {
    pipelineValue: number
    bookedRevenue: number
  }
}

const CALL_OUTCOME_LABELS: Record<string, string> = {
  QUALIFIED: 'Qualified',
  NOT_QUALIFIED: 'Not Interested',
  CALLBACK: 'Callback Requested',
  WRONG_NUMBER: 'Wrong Number',
  VOICEMAIL: 'Voicemail',
  UNKNOWN: 'Incomplete',
}

const TEMPLATE_TYPE_LABELS: Record<string, string> = {
  INITIAL_RESPONSE: 'Initial Response',
  NURTURE_DAY1: 'Day 1 Nurture',
  NURTURE_DAY3: 'Day 3 Nurture',
  NURTURE_DAY5: 'Day 5 Nurture',
  NURTURE_DAY7: 'Day 7 Nurture',
  PROPOSAL_FOLLOWUP: 'Proposal Follow-Up',
  POST_EVENT_DAY3: 'Post-Event (Day 3)',
  POST_EVENT_DAY30: 'Post-Event (Day 30)',
  POST_EVENT_DAY90: 'Post-Event (Day 90)',
  BROADCAST: 'Broadcast',
  CUSTOM: 'Custom',
}

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'funnel' | 'campaigns' | 'revenue' | 'activity'>('overview')
  const [dashboardQuery, funnelQuery, sourcesQuery] = useQueries({
    queries: [
      { queryKey: ['dashboard'], queryFn: () => apiGet<DashboardData>('/api/analytics/dashboard') },
      { queryKey: ['analytics-funnel'], queryFn: () => apiGet<FunnelData>('/api/analytics/funnel') },
      { queryKey: ['analytics-sources'], queryFn: () => apiGet<SourcesData>('/api/analytics/sources') },
    ],
  })

  const attributionQuery = useQuery({
    queryKey: ['analytics-attribution'],
    queryFn: () => apiGet<{ attribution: AttributionRow[]; sources: SourceRow[] }>('/api/analytics/attribution'),
    enabled: activeTab === 'campaigns',
  })

  const activityQuery = useQuery({
    queryKey: ['analytics-activity'],
    queryFn: () => apiGet<ActivityData>('/api/analytics/activity'),
    enabled: activeTab === 'activity',
  })

  const dashboard = dashboardQuery.data
  const funnel = funnelQuery.data?.funnel ?? []
  const sourceData = sourcesQuery.data?.sources ?? []
  const revenueByEventType = sourcesQuery.data?.revenueByEventType ?? []
  const attribution = attributionQuery.data?.attribution ?? []
  const sourcesAttribution = attributionQuery.data?.sources ?? []

  const conversionRate = dashboard && dashboard.metrics.newLeads > 0 ? (dashboard.metrics.bookingsConfirmed / dashboard.metrics.newLeads) * 100 : 0
  const totalSpent = attribution.reduce((total, c) => total + c.spentAmount, 0)
  const totalRevenue = revenueByEventType.reduce((total, row) => total + row.revenue, 0)
  const roi = totalSpent > 0 ? Math.round((totalRevenue / totalSpent) * 100) : 0

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-4xl font-bold text-foreground">Analytics & Reporting</h1>
            <p className="text-muted-foreground mt-1">Real funnel, source, campaign, and revenue data from Postgres.</p>
          </div>
          <div className="flex gap-3">
            <button className="px-4 py-2 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors text-sm font-medium flex items-center gap-2">
              <Calendar size={18} />
              Last 30 Days
            </button>
            <button className="px-4 py-2 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors text-sm font-medium flex items-center gap-2">
              <Download size={18} />
              Export
            </button>
          </div>
        </div>

        {(dashboardQuery.isLoading || funnelQuery.isLoading || sourcesQuery.isLoading) && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading analytics...
          </div>
        )}

        <div className="flex gap-2 border-b border-border">
          {[
            ['overview', 'Overview'],
            ['funnel', 'Lead Funnel'],
            ['campaigns', 'Campaigns'],
            ['revenue', 'Revenue'],
            ['activity', 'Activity'],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setActiveTab(value as never)}
              className={`px-4 py-3 text-sm font-medium ${activeTab === value ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && dashboard && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Lead to Booking Conversion', value: `${conversionRate.toFixed(1)}%`, target: '28-40%' },
              { label: 'Revenue Pipeline', value: formatCurrency(dashboard.metrics.revenuePipelineLakhs, 'lakhs'), target: 'Rs 20-50L annual lift' },
              { label: 'Proposals Sent', value: dashboard.metrics.proposalsSent, target: 'Growing weekly' },
              { label: 'ROI Estimate', value: `${roi}%`, target: '300%+' },
            ].map((metric) => (
              <div key={metric.label} className="bg-card rounded-lg border border-border p-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">{metric.label}</h3>
                <p className="text-3xl font-bold text-foreground mb-2">{metric.value}</p>
                <p className="text-xs text-muted-foreground">Target: {metric.target}</p>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'funnel' && (
          <div className="bg-card rounded-lg border border-border p-6">
            <h3 className="text-lg font-semibold text-foreground mb-6">Conversion Funnel</h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={funnel}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey={(row) => leadStageLabels[row.stage] ?? row.stage} stroke="var(--color-muted-foreground)" />
                <YAxis stroke="var(--color-muted-foreground)" />
                <Tooltip />
                <Bar dataKey="count" fill="var(--color-primary)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {activeTab === 'campaigns' && (
          <div className="space-y-6">
            {attributionQuery.isLoading && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading attribution data...
              </div>
            )}

            {attribution.length > 0 && (
              <div className="bg-card rounded-lg border border-border overflow-hidden">
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <h3 className="font-semibold text-foreground">Campaign CPL vs Benchmark</h3>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-green-500" /> Within benchmark</span>
                    <span className="flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5 text-destructive" /> Over benchmark</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border text-left text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Campaign</th>
                        <th className="px-4 py-3 font-medium">Leads</th>
                        <th className="px-4 py-3 font-medium">Spent</th>
                        <th className="px-4 py-3 font-medium">Actual CPL</th>
                        <th className="px-4 py-3 font-medium">Benchmark CPL</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Bookings</th>
                        <th className="px-4 py-3 font-medium">Spend %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attribution.map((row) => {
                        const chip = CPL_STATUS_CHIP[row.cplStatus]
                        return (
                          <tr key={row.id} className="border-b border-border hover:bg-muted/30">
                            <td className="px-4 py-4">
                              <p className="font-medium text-foreground">{row.name}</p>
                              <p className="text-xs text-muted-foreground">{eventTypeLabels[row.type] ?? row.type}</p>
                            </td>
                            <td className="px-4 py-4 text-muted-foreground">{row.leadsGenerated}</td>
                            <td className="px-4 py-4 text-muted-foreground">{formatCurrency(row.spentAmount)}</td>
                            <td className="px-4 py-4 font-semibold text-foreground">
                              {row.actualCpl !== null ? formatCurrency(row.actualCpl) : '—'}
                            </td>
                            <td className="px-4 py-4 text-muted-foreground">
                              {row.benchmarkCplMin && row.benchmarkCplMax
                                ? `${formatCurrency(row.benchmarkCplMin)} – ${formatCurrency(row.benchmarkCplMax)}`
                                : '—'}
                            </td>
                            <td className="px-4 py-4">
                              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${chip.className}`}>{chip.label}</span>
                            </td>
                            <td className="px-4 py-4 text-muted-foreground">{row.bookingsCount}</td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${row.spendPct > 100 ? 'bg-destructive' : 'bg-primary'}`}
                                    style={{ width: `${Math.min(100, row.spendPct)}%` }}
                                  />
                                </div>
                                <span className="text-xs text-muted-foreground">{Math.round(row.spendPct)}%</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {attribution.length === 0 && !attributionQuery.isLoading && (
              <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
                No campaigns found. Create your first campaign to see attribution data.
              </div>
            )}

            {sourcesAttribution.length > 0 && (
              <div className="bg-card rounded-lg border border-border overflow-hidden">
                <div className="p-4 border-b border-border">
                  <h3 className="font-semibold text-foreground">Source Attribution</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border text-left text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Source</th>
                        <th className="px-4 py-3 font-medium">Total Leads</th>
                        <th className="px-4 py-3 font-medium">Booked</th>
                        <th className="px-4 py-3 font-medium">Conversion Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sourcesAttribution.map((row) => (
                        <tr key={row.source} className="border-b border-border hover:bg-muted/30">
                          <td className="px-4 py-4 font-medium text-foreground">{sourceLabels[row.source] ?? row.source}</td>
                          <td className="px-4 py-4 text-muted-foreground">{row.leads}</td>
                          <td className="px-4 py-4 text-muted-foreground">{row.booked}</td>
                          <td className="px-4 py-4">
                            <span className={`font-semibold ${row.conversionRate >= 30 ? 'text-green-500' : row.conversionRate >= 15 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                              {row.conversionRate}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'revenue' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-card rounded-lg border border-border p-6">
              <h3 className="text-lg font-semibold text-foreground mb-6">Revenue by Source</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={sourceData} dataKey="revenue" nameKey="source" outerRadius={100} label={({ name }) => sourceLabels[String(name)] ?? String(name)}>
                    {sourceData.map((entry, index) => (
                      <Cell key={entry.source} fill={colors[index % colors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-card rounded-lg border border-border p-6">
              <h3 className="text-lg font-semibold text-foreground mb-6">Revenue by Event Type</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={revenueByEventType}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey={(row) => eventTypeLabels[row.eventType] ?? row.eventType} stroke="var(--color-muted-foreground)" />
                  <YAxis stroke="var(--color-muted-foreground)" />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Bar dataKey="revenue" fill="var(--color-accent)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="space-y-6">
            {activityQuery.isLoading && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading activity...
              </div>
            )}

            {activityQuery.data && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-card rounded-lg border border-border p-6">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">AI Calls Placed (Priya)</h3>
                    <p className="text-3xl font-bold text-foreground">{activityQuery.data.calls.placed}</p>
                  </div>
                  <div className="bg-card rounded-lg border border-border p-6">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">WhatsApp Nurture Sent</h3>
                    <p className="text-3xl font-bold text-foreground">
                      {activityQuery.data.whatsapp.nurtureSent.reduce((sum, row) => sum + row.count, 0)}
                    </p>
                  </div>
                  <div className="bg-card rounded-lg border border-border p-6">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Revenue Pipeline (Open Leads)</h3>
                    <p className="text-3xl font-bold text-foreground">{formatCurrency(activityQuery.data.revenue.pipelineValue)}</p>
                  </div>
                  <div className="bg-card rounded-lg border border-border p-6">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Booked Revenue (Accepted)</h3>
                    <p className="text-3xl font-bold text-foreground">{formatCurrency(activityQuery.data.revenue.bookedRevenue)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-card rounded-lg border border-border overflow-hidden">
                    <div className="p-4 border-b border-border">
                      <h3 className="font-semibold text-foreground">AI Call Outcomes</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Completed calls only — outcome is set when Priya concludes a call.</p>
                    </div>
                    {activityQuery.data.calls.byOutcome.length === 0 ? (
                      <p className="p-6 text-sm text-muted-foreground">No completed calls yet.</p>
                    ) : (
                      <div className="p-4 space-y-3">
                        {activityQuery.data.calls.byOutcome.map((row) => (
                          <div key={row.outcome} className="flex items-center justify-between text-sm">
                            <span className="text-foreground">{CALL_OUTCOME_LABELS[row.outcome] ?? row.outcome}</span>
                            <span className="font-semibold text-foreground">{row.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-card rounded-lg border border-border overflow-hidden">
                    <div className="p-4 border-b border-border">
                      <h3 className="font-semibold text-foreground">WhatsApp Messages Sent</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Delivered sends only (status = SENT), by sequence stage.</p>
                    </div>
                    {activityQuery.data.whatsapp.nurtureSent.length === 0 && activityQuery.data.whatsapp.postCallSent === 0 ? (
                      <p className="p-6 text-sm text-muted-foreground">No WhatsApp messages sent yet.</p>
                    ) : (
                      <div className="p-4 space-y-3">
                        {activityQuery.data.whatsapp.nurtureSent.map((row) => (
                          <div key={row.templateType} className="flex items-center justify-between text-sm">
                            <span className="text-foreground">{TEMPLATE_TYPE_LABELS[row.templateType] ?? row.templateType}</span>
                            <span className="font-semibold text-foreground">{row.count}</span>
                          </div>
                        ))}
                        {activityQuery.data.whatsapp.postCallSent > 0 && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-foreground">Post-Call (after Priya's call)</span>
                            <span className="font-semibold text-foreground">{activityQuery.data.whatsapp.postCallSent}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
