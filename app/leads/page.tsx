'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Download, Filter, LayoutGrid, Loader2, Plus, Search, Upload } from 'lucide-react'

import { DashboardLayout } from '@/components/dashboard-layout'
import { formatCurrency, formatDate, formatHoursAgo, eventTypeLabels, leadStageLabels, sourceLabels } from '@/lib/format'

const sources = ['ALL', ...Object.keys(sourceLabels)]

type Lead = {
  id: string
  name: string
  email?: string | null
  phone: string
  eventType: string
  eventDate?: string | null
  guestCount?: number | null
  budgetMin?: string | number | null
  budgetMax?: string | number | null
  source: string
  stage: string
  leadScore: number
  createdAt: string
}

async function fetchLeads(params: URLSearchParams): Promise<{ leads: Lead[] }> {
  const response = await fetch(`/api/leads?${params.toString()}`)
  if (!response.ok) throw new Error('Failed to load leads')
  return response.json()
}

const stages = ['ALL', 'NEW', 'CONTACTED', 'FOLLOW_UP', 'SITE_VISIT', 'PROPOSAL_SENT', 'NEGOTIATION', 'BOOKED', 'LOST']
const eventTypes = ['ALL', 'SOCIAL_EVENTS', 'CORPORATE_EVENTS', 'BIRTHDAY_SOCIAL', 'PROMOTIONAL_EVENTS', 'ENTERTAINMENT_EVENTS', 'SEASONAL_THEMATIC']

export default function LeadsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStage, setSelectedStage] = useState('ALL')
  const [selectedEventType, setSelectedEventType] = useState('ALL')
  const [selectedSource, setSelectedSource] = useState('ALL')
  const [isExporting, setIsExporting] = useState(false)

  const queryParams = useMemo(() => {
    const params = new URLSearchParams()
    if (searchQuery) params.set('search', searchQuery)
    if (selectedStage !== 'ALL') params.set('stage', selectedStage)
    if (selectedEventType !== 'ALL') params.set('eventType', selectedEventType)
    if (selectedSource !== 'ALL') params.set('source', selectedSource)
    return params
  }, [searchQuery, selectedStage, selectedEventType, selectedSource])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['leads', searchQuery, selectedStage, selectedEventType, selectedSource],
    queryFn: () => fetchLeads(queryParams),
  })

  const leads = data?.leads ?? []

  async function handleExportCSV() {
    setIsExporting(true)
    try {
      const response = await fetch(`/api/leads/export?${queryParams.toString()}`)
      if (!response.ok) throw new Error('Export failed')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Leads exported')
    } catch {
      toast.error('Export failed')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-4xl font-bold text-foreground">Leads</h1>
            <p className="text-muted-foreground mt-1">Manage banquet leads with full lifecycle stages and timeline tracking. {leads.length} lead(s) found.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/leads/import" className="w-fit px-4 py-2 bg-card border border-border text-foreground rounded-lg hover:bg-muted transition-colors text-sm font-medium flex items-center gap-2">
              <Upload size={18} />
              Import CSV
            </Link>
            <Link href="/leads/new" className="w-fit px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity text-sm font-medium flex items-center gap-2 hover-lift">
              <Plus size={18} />
              Add Lead
            </Link>
          </div>
        </div>

        <div className="flex gap-3 flex-wrap items-center">
          <div className="flex-1 min-w-64">
            <div className="relative">
              <Search className="absolute left-3 top-3 text-muted-foreground" size={18} />
              <input
                type="text"
                placeholder="Search by name, email, phone..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-smooth"
              />
            </div>
          </div>

          <select
            value={selectedStage}
            onChange={(event) => setSelectedStage(event.target.value)}
            className="px-3 py-2 bg-card border border-border text-foreground rounded-lg text-sm"
          >
            {stages.map((stage) => (
              <option key={stage} value={stage}>
                {stage === 'ALL' ? 'All stages' : leadStageLabels[stage]}
              </option>
            ))}
          </select>

          <select
            value={selectedEventType}
            onChange={(event) => setSelectedEventType(event.target.value)}
            className="px-3 py-2 bg-card border border-border text-foreground rounded-lg text-sm"
          >
            {eventTypes.map((eventType) => (
              <option key={eventType} value={eventType}>
                {eventType === 'ALL' ? 'All event types' : eventTypeLabels[eventType]}
              </option>
            ))}
          </select>

          <select
            value={selectedSource}
            onChange={(event) => setSelectedSource(event.target.value)}
            className="px-3 py-2 bg-card border border-border text-foreground rounded-lg text-sm"
          >
            {sources.map((source) => (
              <option key={source} value={source}>
                {source === 'ALL' ? 'All sources' : sourceLabels[source]}
              </option>
            ))}
          </select>

          <button className="px-3 py-2 bg-card border border-border text-foreground rounded-lg hover:bg-muted transition-colors text-sm font-medium flex items-center gap-2 hover-lift">
            <Filter size={18} />
          </button>
          <button
            onClick={handleExportCSV}
            disabled={isExporting}
            title="Export current view as CSV"
            className="px-3 py-2 bg-card border border-border text-foreground rounded-lg hover:bg-muted transition-colors text-sm font-medium flex items-center gap-2 hover-lift disabled:opacity-60"
          >
            {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
          </button>
          <button className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium">
            <LayoutGrid size={16} />
          </button>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card rounded-lg border border-border p-5 animate-pulse">
                <div className="h-5 bg-muted rounded w-2/3 mb-3" />
                <div className="h-3 bg-muted rounded w-1/3 mb-4" />
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="h-10 bg-muted rounded" />
                  <div className="h-10 bg-muted rounded" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-destructive">
            Could not load leads. Check that the local Postgres container is running.
          </div>
        )}

        {!isLoading && leads.length === 0 && (
          <div className="text-center py-12 rounded-lg border border-border bg-card">
            <p className="text-muted-foreground mb-4">No leads found</p>
            <Link href="/leads/new" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90">
              Add your first lead
            </Link>
          </div>
        )}

        {!isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {leads.map((lead, index) => {
              const hoursOld = (Date.now() - new Date(lead.createdAt).getTime()) / 3600000
              const showSlaWarning = lead.stage === 'NEW' && hoursOld > 24

              return (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  style={{ animationDelay: `${index * 0.05}s` }}
                  className="bg-card rounded-lg border border-border p-5 transition-smooth hover-lift animate-fade-in-up"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <h3 className="font-semibold text-foreground text-lg">{lead.name}</h3>
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                          {leadStageLabels[lead.stage] ?? lead.stage}
                        </span>
                        {showSlaWarning && (
                          <span className="px-2 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-500">
                            &#9888; {formatHoursAgo(Math.floor(hoursOld))} old
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{eventTypeLabels[lead.eventType] ?? lead.eventType}</p>
                    </div>
                    <div className="text-sm font-semibold text-accent">{lead.leadScore}</div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                    <div className="bg-muted/50 rounded p-2">
                      <span className="text-muted-foreground text-xs">Guests</span>
                      <p className="font-semibold text-foreground">{lead.guestCount ?? 'Not set'}</p>
                    </div>
                    <div className="bg-muted/50 rounded p-2">
                      <span className="text-muted-foreground text-xs">Budget</span>
                      <p className="font-semibold text-foreground">{lead.budgetMax ? formatCurrency(Number(lead.budgetMax), 'lakhs') : 'Not set'}</p>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>{lead.phone}</p>
                    <p>{formatDate(lead.eventDate)}</p>
                    <p>{sourceLabels[lead.source] ?? lead.source}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
