'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, BarChart3, Briefcase, Calendar, CheckSquare, ClipboardList, Loader2, TrendingUp, Users } from 'lucide-react'

import { AchievementBadge } from '@/components/achievement-badge'
import { DashboardLayout } from '@/components/dashboard-layout'
import { KPICard } from '@/components/kpi-card'
import { SmartInsights } from '@/components/smart-insights'
import { TrendChart } from '@/components/trend-chart'
import { eventTypeLabels, formatCurrency, formatDate, formatHoursAgo, leadStageLabels, sourceLabels } from '@/lib/format'

type DashboardData = {
  metrics: {
    newLeads: number
    proposalsSent: number
    bookingsConfirmed: number
    revenuePipelineLakhs: number
  }
  stageCounts: { stage: string; count: number }[]
  sourceCounts: { source: string; count: number }[]
  recentLeads: {
    id: string
    name: string
    email?: string | null
    phone: string
    eventDate?: string | null
    stage: string
    budgetMax?: string | number | null
    source: string
  }[]
}

type OverdueLead = {
  id: string
  name: string
  phone: string
  eventType: string
  stage: string
  createdAt: string
  updatedAt: string
}

type OverdueData = {
  newStale: OverdueLead[]
  followUpStale: OverdueLead[]
  proposalStale: OverdueLead[]
  totalOverdue: number
}

type MyTask = {
  id: string
  title: string
  priority: string
  dueDate?: string | null
  lead?: { id: string; name: string; stage: string } | null
}

type MyTasksData = {
  tasks: MyTask[]
  overdueCount: number
}

async function fetchDashboard(): Promise<DashboardData> {
  const response = await fetch('/api/analytics/dashboard')
  if (!response.ok) throw new Error('Failed to load dashboard')
  return response.json()
}

async function fetchOverdue(): Promise<OverdueData> {
  const response = await fetch('/api/analytics/overdue')
  if (!response.ok) throw new Error('Failed to load overdue leads')
  return response.json()
}

async function fetchMyTasks(): Promise<MyTasksData> {
  const response = await fetch('/api/tasks/my')
  if (!response.ok) throw new Error('Failed to load tasks')
  return response.json()
}

export default function Dashboard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
  })

  const { data: overdueData } = useQuery({
    queryKey: ['overdue'],
    queryFn: fetchOverdue,
    refetchInterval: 60000,
  })

  const { data: myTasksData } = useQuery({
    queryKey: ['my-tasks'],
    queryFn: fetchMyTasks,
    refetchInterval: 30000,
  })

  const totalStageCount = data?.stageCounts.reduce((total, row) => total + row.count, 0) ?? 0
  const topSource = data?.sourceCounts.sort((a, b) => b.count - a.count)[0]

  const insights = [
    {
      id: '1',
      type: 'opportunity' as const,
      title: 'Campaign focus',
      description: topSource
        ? `${sourceLabels[topSource.source] ?? topSource.source} is currently the top lead source with ${topSource.count} leads.`
        : 'Lead sources will appear here once data is available.',
      action: {
        label: 'View Campaigns',
        onClick: () => {
          window.location.href = '/campaigns'
        },
      },
    },
    {
      id: '2',
      type: 'alert' as const,
      title: 'Follow-up queue',
      description: `${data?.stageCounts.find((row) => row.stage === 'NEW')?.count ?? 0} leads are still new and need first contact.`,
    },
    {
      id: '3',
      type: 'tip' as const,
      title: 'Response discipline',
      description: 'Keep the first-response SLA under 90 seconds for every new banquet inquiry.',
    },
  ]

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-4xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground mt-1">Live banquet revenue overview from the local Postgres database.</p>
          </div>
          <div className="flex flex-col gap-4 lg:items-end">
            <button className="px-4 py-2 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors text-sm font-medium">
              <Calendar className="w-4 h-4 inline mr-2" />
              Last 30 Days
            </button>
            <div className="flex gap-3">
              <AchievementBadge type="firstLead" unlocked={(data?.metrics.newLeads ?? 0) > 0} />
              <AchievementBadge type="hotStreak" unlocked={(data?.metrics.newLeads ?? 0) >= 5} />
              <AchievementBadge type="superClose" unlocked={(data?.metrics.bookingsConfirmed ?? 0) >= 10} progress={data?.metrics.bookingsConfirmed ?? 0} maxProgress={10} />
              <AchievementBadge type="budgetMaster" unlocked={(data?.metrics.proposalsSent ?? 0) >= 3} progress={data?.metrics.proposalsSent ?? 0} maxProgress={3} />
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading dashboard metrics...
          </div>
        )}

        {isError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-destructive">
            Dashboard data could not be loaded. Confirm Docker Postgres is running and the database is seeded.
          </div>
        )}

        {data && (
          <>
            <SmartInsights insights={insights} />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <KPICard icon={Users} label="New Leads" value={data.metrics.newLeads} change="+ live" trend="up" subtext="Last 30 days" color="primary" clickable />
              <KPICard icon={TrendingUp} label="Proposals Sent" value={data.metrics.proposalsSent} change="+ live" trend="up" subtext="Tracked proposals" color="accent" clickable />
              <KPICard icon={Briefcase} label="Bookings Confirmed" value={data.metrics.bookingsConfirmed} change="+ live" trend="up" subtext="Booked leads" color="secondary" clickable />
              <KPICard
                icon={BarChart3}
                label="Revenue Pipeline"
                value={formatCurrency(data.metrics.revenuePipelineLakhs, 'lakhs')}
                change="+ live"
                trend="up"
                subtext="Open lead budget"
                color="primary"
                clickable
              />
            </div>

            {overdueData && overdueData.totalOverdue > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <h3 className="font-semibold text-foreground">
                    Needs Attention — {overdueData.totalOverdue} overdue lead{overdueData.totalOverdue !== 1 ? 's' : ''}
                  </h3>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {overdueData.newStale.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-amber-500 uppercase tracking-wider">No first contact (&gt;24h)</p>
                      {overdueData.newStale.map((lead) => {
                        const hoursOld = Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / 3600000)
                        return (
                          <Link key={lead.id} href={`/leads/${lead.id}`} className="flex items-center justify-between rounded-lg bg-card border border-border px-3 py-2 hover:bg-muted transition-colors">
                            <div>
                              <p className="text-sm font-medium text-foreground">{lead.name}</p>
                              <p className="text-xs text-muted-foreground">{eventTypeLabels[lead.eventType] ?? lead.eventType}</p>
                            </div>
                            <span className="text-xs font-semibold text-amber-500">{formatHoursAgo(hoursOld)} old</span>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                  {overdueData.followUpStale.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-orange-500 uppercase tracking-wider">No activity (&gt;72h)</p>
                      {overdueData.followUpStale.map((lead) => {
                        const hoursOld = Math.floor((Date.now() - new Date(lead.updatedAt).getTime()) / 3600000)
                        return (
                          <Link key={lead.id} href={`/leads/${lead.id}`} className="flex items-center justify-between rounded-lg bg-card border border-border px-3 py-2 hover:bg-muted transition-colors">
                            <div>
                              <p className="text-sm font-medium text-foreground">{lead.name}</p>
                              <p className="text-xs text-muted-foreground">{leadStageLabels[lead.stage]}</p>
                            </div>
                            <span className="text-xs font-semibold text-orange-500">{formatHoursAgo(hoursOld)} ago</span>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                  {overdueData.proposalStale.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-red-500 uppercase tracking-wider">Proposal follow-up needed (&gt;5d)</p>
                      {overdueData.proposalStale.map((lead) => {
                        const daysOld = Math.floor((Date.now() - new Date(lead.updatedAt).getTime()) / 86400000)
                        return (
                          <Link key={lead.id} href={`/leads/${lead.id}`} className="flex items-center justify-between rounded-lg bg-card border border-border px-3 py-2 hover:bg-muted transition-colors">
                            <div>
                              <p className="text-sm font-medium text-foreground">{lead.name}</p>
                              <p className="text-xs text-muted-foreground">{eventTypeLabels[lead.eventType] ?? lead.eventType}</p>
                            </div>
                            <span className="text-xs font-semibold text-red-500">{daysOld}d ago</span>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {myTasksData && myTasksData.tasks.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-foreground">My Tasks</h3>
                    {myTasksData.overdueCount > 0 && (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                        {myTasksData.overdueCount} overdue
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{myTasksData.tasks.length} open</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {myTasksData.tasks.map((task) => {
                    const isOverdue = task.dueDate && new Date(task.dueDate) < new Date()
                    const priorityColor: Record<string, string> = {
                      URGENT: 'border-l-destructive',
                      HIGH: 'border-l-orange-500',
                      MEDIUM: 'border-l-primary',
                      LOW: 'border-l-muted-foreground',
                    }
                    return (
                      <Link
                        key={task.id}
                        href={task.lead ? `/leads/${task.lead.id}` : '#'}
                        className={`rounded-lg border border-border border-l-4 ${priorityColor[task.priority] ?? 'border-l-border'} bg-muted/30 px-4 py-3 hover:bg-muted/60 transition-colors`}
                      >
                        <p className="text-sm font-medium text-foreground line-clamp-2">{task.title}</p>
                        {task.lead && (
                          <p className="text-xs text-primary mt-1 truncate">{task.lead.name}</p>
                        )}
                        {task.dueDate && (
                          <p className={`text-xs mt-1 ${isOverdue ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                            {isOverdue ? 'Overdue · ' : ''}{formatDate(task.dueDate)}
                          </p>
                        )}
                        <span className="mt-2 inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {task.priority}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <TrendChart />
              </div>
              <div className="bg-card rounded-xl border border-border p-6 h-full animate-fade-in-up">
                <h3 className="font-semibold text-foreground mb-6">Lead Stage Distribution</h3>
                <div className="space-y-4">
                  {data.stageCounts.map((item, index) => {
                    const percentage = totalStageCount > 0 ? Math.round((item.count / totalStageCount) * 100) : 0
                    return (
                      <div key={item.stage}>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm text-muted-foreground">{leadStageLabels[item.stage] ?? item.stage}</span>
                          <span className="text-sm font-semibold text-foreground">
                            {item.count} ({percentage}%)
                          </span>
                        </div>
                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full animate-slide-in-right"
                            style={{ width: `${percentage}%`, animationDelay: `${index * 0.1}s` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-semibold text-foreground">Recent Leads</h3>
                <Link href="/leads" className="text-sm text-primary hover:underline">
                  View All
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border">
                    <tr className="text-muted-foreground text-left">
                      <th className="pb-3 font-medium">Name</th>
                      <th className="pb-3 font-medium">Contact</th>
                      <th className="pb-3 font-medium">Event Date</th>
                      <th className="pb-3 font-medium">Budget</th>
                      <th className="pb-3 font-medium">Stage</th>
                      <th className="pb-3 font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentLeads.map((lead) => (
                      <tr key={lead.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                        <td className="py-4 font-medium text-foreground">
                          <Link href={`/leads/${lead.id}`} className="hover:underline">
                            {lead.name}
                          </Link>
                        </td>
                        <td className="py-4 text-muted-foreground">{lead.phone}</td>
                        <td className="py-4 text-muted-foreground">{formatDate(lead.eventDate)}</td>
                        <td className="py-4 text-muted-foreground">{lead.budgetMax ? formatCurrency(Number(lead.budgetMax), 'lakhs') : 'Not set'}</td>
                        <td className="py-4 text-muted-foreground">{leadStageLabels[lead.stage] ?? lead.stage}</td>
                        <td className="py-4 text-muted-foreground">{sourceLabels[lead.source] ?? lead.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
