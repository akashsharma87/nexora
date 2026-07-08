'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { CheckCircle, Clock, Loader2, MessageCircle, Play, Plus, Send, Zap, ZapOff } from 'lucide-react'

import { DashboardLayout } from '@/components/dashboard-layout'
import { eventTypeLabels, formatDate, leadStageLabels } from '@/lib/format'

type Template = {
  id: string
  name: string
  type: string
  content: string
  isActive: boolean
  sentCount: number
  openRate: string | number
}

type Flow = {
  id: string
  name: string
  trigger: string
  isActive: boolean
  steps: unknown[]
}

type Broadcast = {
  id: string
  name: string
  message: string
  status: string
  recipients: number
  delivered: number
  opened: number
  responded: number
  scheduledAt?: string | null
  sentAt?: string | null
}

type ScheduledMessage = {
  id: string
  phone: string
  templateType: string
  status: string
  scheduledAt: string
  sentAt?: string | null
  error?: string | null
  lead: { id: string; name: string }
}

async function apiGet<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to load ${url}`)
  return response.json()
}

const STAGE_OPTIONS = ['NEW', 'CONTACTED', 'FOLLOW_UP', 'SITE_VISIT', 'PROPOSAL_SENT', 'NEGOTIATION', 'BOOKED', 'LOST']
const EVENT_TYPE_OPTIONS = ['SOCIAL_EVENTS', 'CORPORATE_EVENTS', 'BIRTHDAY_SOCIAL', 'PROMOTIONAL_EVENTS', 'ENTERTAINMENT_EVENTS', 'SEASONAL_THEMATIC']

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-500/10 text-amber-500',
  SENT: 'bg-green-500/10 text-green-500',
  FAILED: 'bg-destructive/10 text-destructive',
  CANCELLED: 'bg-muted text-muted-foreground',
  SKIPPED: 'bg-muted text-muted-foreground',
}

export default function WhatsAppPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'templates' | 'automation' | 'broadcasts'>('templates')
  const [showTemplateForm, setShowTemplateForm] = useState(false)
  const [showBroadcastForm, setShowBroadcastForm] = useState(false)
  const [segmentStage, setSegmentStage] = useState('')
  const [segmentEventType, setSegmentEventType] = useState('')

  const countParams = new URLSearchParams()
  if (segmentStage) countParams.set('stage', segmentStage)
  if (segmentEventType) countParams.set('eventType', segmentEventType)

  const { data: countData } = useQuery({
    queryKey: ['leads-count', segmentStage, segmentEventType],
    queryFn: async () => {
      const response = await fetch(`/api/leads/count?${countParams.toString()}`)
      if (!response.ok) throw new Error('Failed')
      return response.json() as Promise<{ count: number }>
    },
    enabled: showBroadcastForm,
  })

  const scheduledQuery = useQuery({
    queryKey: ['whatsapp-scheduled'],
    queryFn: () => apiGet<{ messages: ScheduledMessage[]; pendingCount: number }>('/api/whatsapp/scheduled'),
    enabled: activeTab === 'automation',
    refetchInterval: activeTab === 'automation' ? 30000 : false,
  })

  const propertyQuery = useQuery({
    queryKey: ['settings-property'],
    queryFn: () => apiGet<{ property: { autoWhatsappNurtureEnabled: boolean } }>('/api/settings/property'),
  })

  const toggleAutoNurture = useMutation({
    mutationFn: async (next: boolean) => {
      const response = await fetch('/api/settings/property', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoWhatsappNurtureEnabled: next }),
      })
      if (!response.ok) throw new Error('Failed to update auto-nurture setting')
      return next
    },
    onSuccess: (next) => {
      queryClient.invalidateQueries({ queryKey: ['settings-property'] })
      toast.success(
        next
          ? 'Auto WhatsApp nurturing turned ON — new leads will get the nurture sequence automatically.'
          : 'Auto WhatsApp nurturing turned OFF — new leads will not be nurtured automatically.'
      )
    },
    onError: () => toast.error('Failed to update auto-nurture setting'),
  })

  const [templatesQuery, flowsQuery, broadcastsQuery] = useQueries({
    queries: [
      { queryKey: ['whatsapp-templates'], queryFn: () => apiGet<{ templates: Template[] }>('/api/whatsapp/templates') },
      { queryKey: ['whatsapp-flows'], queryFn: () => apiGet<{ flows: Flow[] }>('/api/whatsapp/automation') },
      { queryKey: ['whatsapp-broadcasts'], queryFn: () => apiGet<{ broadcasts: Broadcast[] }>('/api/whatsapp/broadcasts') },
    ],
  })

  const createTemplate = useMutation({
    mutationFn: async (payload: unknown) => {
      const response = await fetch('/api/whatsapp/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Failed to create template')
      return response.json()
    },
    onSuccess: () => {
      toast.success('Template created')
      setShowTemplateForm(false)
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] })
    },
    onError: () => toast.error('Template could not be created'),
  })

  const createBroadcast = useMutation({
    mutationFn: async (payload: unknown) => {
      const response = await fetch('/api/whatsapp/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Failed to create broadcast')
      return response.json()
    },
    onSuccess: () => {
      toast.success('Broadcast saved')
      setShowBroadcastForm(false)
      queryClient.invalidateQueries({ queryKey: ['whatsapp-broadcasts'] })
    },
    onError: () => toast.error('Broadcast could not be saved'),
  })

  const sendBroadcast = useMutation({
    mutationFn: async (broadcastId: string) => {
      const response = await fetch(`/api/whatsapp/broadcasts/${broadcastId}/send`, { method: 'POST' })
      if (!response.ok) throw new Error('Failed to send broadcast')
      return response.json()
    },
    onSuccess: (data) => {
      toast.success(`Broadcast sent to ${(data as { sent?: number }).sent ?? 0} recipients`)
      queryClient.invalidateQueries({ queryKey: ['whatsapp-broadcasts'] })
    },
    onError: () => toast.error('Could not send broadcast'),
  })

  function submitTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    createTemplate.mutate({
      name: form.get('name'),
      type: form.get('type'),
      content: form.get('content'),
      variables: String(form.get('variables') ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      isActive: true,
    })
  }

  function submitBroadcast(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    createBroadcast.mutate({
      name: form.get('name'),
      message: form.get('message'),
      scheduledAt: form.get('scheduledAt') || undefined,
      recipients: countData?.count ?? 0,
    })
  }

  const templates = templatesQuery.data?.templates ?? []
  const flows = flowsQuery.data?.flows ?? []
  const broadcasts = broadcastsQuery.data?.broadcasts ?? []
  const scheduledMessages = scheduledQuery.data?.messages ?? []
  const pendingCount = scheduledQuery.data?.pendingCount ?? 0
  const monthlyMessages = templates.reduce((total, template) => total + template.sentCount, 0)
  const avgEngagement = templates.length > 0 ? Math.round(templates.reduce((total, template) => total + Number(template.openRate), 0) / templates.length) : 0

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-4xl font-bold text-foreground">WhatsApp Automation</h1>
            <p className="text-muted-foreground mt-1">Manage templates, nurture flows, and scheduled broadcasts.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => toggleAutoNurture.mutate(!propertyQuery.data?.property?.autoWhatsappNurtureEnabled)}
              disabled={!propertyQuery.data || toggleAutoNurture.isPending}
              title="When on, new leads automatically get the WhatsApp nurture sequence a few minutes after creation. Off by default so bulk imports/syncs never mass-message leads."
              className={`w-fit px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 border transition-colors disabled:opacity-50 ${
                propertyQuery.data?.property?.autoWhatsappNurtureEnabled
                  ? 'bg-green-500/10 border-green-500/30 text-green-600'
                  : 'bg-card border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {propertyQuery.data?.property?.autoWhatsappNurtureEnabled ? <Zap size={16} /> : <ZapOff size={16} />}
              Auto Nurture: {propertyQuery.data?.property?.autoWhatsappNurtureEnabled ? 'ON' : 'OFF'}
            </button>
            <button onClick={() => setShowTemplateForm((value) => !value)} className="w-fit px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity text-sm font-medium flex items-center gap-2">
              <Plus size={18} />
              Create Template
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card rounded-lg border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground">Messages This Month</h3>
              <MessageCircle className="w-5 h-5 text-primary" />
            </div>
            <p className="text-3xl font-bold text-foreground">{monthlyMessages}</p>
          </div>
          <div className="bg-card rounded-lg border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground">Pending in Queue</h3>
              <Clock className="w-5 h-5 text-accent" />
            </div>
            <p className="text-3xl font-bold text-foreground">{pendingCount}</p>
          </div>
          <div className="bg-card rounded-lg border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground">Avg Engagement</h3>
              <CheckCircle className="w-5 h-5 text-secondary" />
            </div>
            <p className="text-3xl font-bold text-foreground">{avgEngagement}%</p>
          </div>
        </div>

        <div className="flex gap-2 border-b border-border">
          {[
            ['templates', 'Templates'],
            ['automation', 'Automation'],
            ['broadcasts', 'Broadcast'],
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

        {showTemplateForm && (
          <form onSubmit={submitTemplate} className="rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input name="name" required placeholder="Template name" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <select name="type" className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {['INITIAL_RESPONSE', 'NURTURE_DAY1', 'NURTURE_DAY3', 'NURTURE_DAY5', 'NURTURE_DAY7', 'PROPOSAL_FOLLOWUP', 'BROADCAST', 'CUSTOM'].map((type) => (
                  <option key={type} value={type}>
                    {type.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
              <input name="variables" placeholder="name,eventType,hotelName" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <textarea name="content" required rows={4} placeholder="Message content with {{variables}}" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Save Template</button>
          </form>
        )}

        {(templatesQuery.isLoading || flowsQuery.isLoading || broadcastsQuery.isLoading) && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading WhatsApp workspace...
          </div>
        )}

        {activeTab === 'templates' && (
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            {templates.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">No templates yet. Create your first template above.</div>
            )}
            {templates.map((template) => (
              <div key={template.id} className="p-6 border-b border-border hover:bg-muted/50 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">{template.name}</h3>
                    <p className="text-sm text-muted-foreground mb-3">{template.content}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Type: {template.type.replaceAll('_', ' ')}</span>
                      <span>Sent: {template.sentCount}</span>
                      <span>Engagement: {Number(template.openRate).toFixed(0)}%</span>
                    </div>
                  </div>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{template.isActive ? 'Active' : 'Off'}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'automation' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {flows.map((flow) => (
                <div key={flow.id} className="bg-card rounded-lg border border-border p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-foreground">{flow.name}</h3>
                      <p className="text-sm text-muted-foreground">{flow.trigger.replaceAll('_', ' ')}</p>
                    </div>
                    <span className="rounded-full bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-500">{flow.isActive ? 'Active' : 'Draft'}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{Array.isArray(flow.steps) ? flow.steps.length : 0} automated step(s)</p>
                </div>
              ))}
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground">Scheduled Message Queue</h3>
                {scheduledQuery.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              <div className="bg-card rounded-lg border border-border overflow-hidden">
                {scheduledMessages.length === 0 && !scheduledQuery.isLoading && (
                  <div className="p-8 text-center text-muted-foreground">No scheduled messages in queue.</div>
                )}
                {scheduledMessages.map((msg) => (
                  <div key={msg.id} className="flex items-center justify-between p-4 border-b border-border hover:bg-muted/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Link href={`/leads/${msg.lead.id}`} className="text-sm font-medium text-foreground hover:underline truncate">
                          {msg.lead.name}
                        </Link>
                        <span className="text-xs text-muted-foreground">· {msg.phone}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{msg.templateType.replaceAll('_', ' ')} · {msg.status === 'SENT' ? `Sent ${formatDate(msg.sentAt)}` : `Scheduled ${formatDate(msg.scheduledAt)}`}</p>
                      {msg.error && <p className="text-xs text-destructive mt-0.5">{msg.error}</p>}
                    </div>
                    <span className={`ml-4 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLORS[msg.status] ?? 'bg-muted text-muted-foreground'}`}>
                      {msg.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'broadcasts' && (
          <div className="space-y-4">
            <button onClick={() => setShowBroadcastForm((value) => !value)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              <Send className="h-4 w-4" />
              New Broadcast
            </button>
            {showBroadcastForm && (
              <form onSubmit={submitBroadcast} className="rounded-lg border border-border bg-card p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input name="name" required placeholder="Broadcast name (e.g. Diwali 2026 Offer)" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  <input name="scheduledAt" type="datetime-local" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  <p className="text-sm font-medium text-foreground">Segment targeting</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">By Stage</label>
                      <select value={segmentStage} onChange={(e) => setSegmentStage(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                        <option value="">All stages</option>
                        {STAGE_OPTIONS.map((s) => (
                          <option key={s} value={s}>{leadStageLabels[s] ?? s}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">By Event Type</label>
                      <select value={segmentEventType} onChange={(e) => setSegmentEventType(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                        <option value="">All event types</option>
                        {EVENT_TYPE_OPTIONS.map((et) => (
                          <option key={et} value={et}>{eventTypeLabels[et] ?? et}</option>
                        ))}
                      </select>
                    </div>
                    <div className="rounded-lg bg-primary/10 border border-primary/20 px-4 py-2 text-center">
                      <p className="text-xs text-muted-foreground">Estimated recipients</p>
                      <p className="text-2xl font-bold text-primary">{countData?.count ?? '—'}</p>
                    </div>
                  </div>
                </div>
                <div>
                  <input
                    name="message"
                    required
                    maxLength={40}
                    placeholder="Short offer phrase, e.g. &quot;10% off d&eacute;cor&quot; (max 40 chars)"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Sent inside the approved nexora_broadcast_general template — keep it a short phrase, not a full message. WhatsApp templates can&apos;t carry free-form marketing text as a variable.
                  </p>
                </div>
                <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60" disabled={createBroadcast.isPending}>
                  <Send className="h-4 w-4" />
                  {createBroadcast.isPending ? 'Saving...' : 'Schedule Broadcast'}
                </button>
              </form>
            )}
            <div className="bg-card rounded-lg border border-border overflow-hidden">
              {broadcasts.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">No broadcasts yet. Create your first broadcast above.</div>
              )}
              {broadcasts.map((broadcast) => (
                <div key={broadcast.id} className="p-5 border-b border-border">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground">{broadcast.name}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">{broadcast.message}</p>
                      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{broadcast.scheduledAt ? `Scheduled: ${formatDate(broadcast.scheduledAt)}` : 'Draft broadcast'}</span>
                        {broadcast.sentAt && <span>Sent: {formatDate(broadcast.sentAt)}</span>}
                        <span>{broadcast.recipients} recipients</span>
                        {broadcast.delivered > 0 && <span>{broadcast.delivered} delivered</span>}
                      </div>
                    </div>
                    <div className="ml-4 flex items-center gap-2">
                      <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">{broadcast.status}</span>
                      {(broadcast.status === 'DRAFT' || broadcast.status === 'SCHEDULED') && (
                        <button
                          onClick={() => sendBroadcast.mutate(broadcast.id)}
                          disabled={sendBroadcast.isPending && sendBroadcast.variables === broadcast.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                        >
                          <Play className="h-3 w-3" />
                          Send Now
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
