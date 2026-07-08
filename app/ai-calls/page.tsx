'use client'

import { useState, useEffect } from 'react'
import { Phone, PhoneCall, PhoneMissed, PhoneOff, CheckCircle, XCircle, Clock, RefreshCw, PhoneForwarded, Zap, ZapOff } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'

import { DashboardLayout } from '@/components/dashboard-layout'

type AiCall = {
  id: string
  status: string
  outcome: string | null
  qualifiedScore: number | null
  duration: number | null
  notes: string | null
  transcript: { role: string; content: string }[] | null
  scheduledAt: string | null
  callStartedAt: string | null
  callEndedAt: string | null
  attempts: number
  createdAt: string
  lead: { id: string; name: string; phone: string; eventType: string; stage: string }
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.FC<{ size: number }> }> = {
  PENDING: { label: 'Scheduled', color: 'text-yellow-600 bg-yellow-50', icon: Clock },
  DIALING: { label: 'Dialing', color: 'text-blue-600 bg-blue-50', icon: PhoneCall },
  IN_PROGRESS: { label: 'In Progress', color: 'text-blue-700 bg-blue-100', icon: PhoneCall },
  COMPLETED: { label: 'Completed', color: 'text-green-600 bg-green-50', icon: Phone },
  NO_ANSWER: { label: 'No Answer', color: 'text-orange-600 bg-orange-50', icon: PhoneMissed },
  BUSY: { label: 'Busy', color: 'text-orange-600 bg-orange-50', icon: PhoneMissed },
  FAILED: { label: 'Failed', color: 'text-red-600 bg-red-50', icon: PhoneOff },
  CANCELLED: { label: 'Cancelled', color: 'text-gray-500 bg-gray-50', icon: PhoneOff },
}

const OUTCOME_CONFIG: Record<string, { label: string; color: string }> = {
  QUALIFIED: { label: 'Qualified', color: 'text-green-700 bg-green-100' },
  NOT_QUALIFIED: { label: 'Not Interested', color: 'text-red-600 bg-red-50' },
  CALLBACK: { label: 'Callback', color: 'text-purple-600 bg-purple-50' },
  WRONG_NUMBER: { label: 'Wrong Number', color: 'text-gray-500 bg-gray-100' },
  VOICEMAIL: { label: 'Voicemail', color: 'text-yellow-600 bg-yellow-50' },
  UNKNOWN: { label: 'Incomplete', color: 'text-gray-500 bg-gray-100' },
}

function formatDuration(sec: number | null) {
  if (!sec) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function AiCallsPage() {
  const [calls, setCalls] = useState<AiCall[]>([])
  const [stats, setStats] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState<string | null>(null)
  const [selectedCall, setSelectedCall] = useState<AiCall | null>(null)
  const [minDaysOld, setMinDaysOld] = useState(7)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [autoCallingEnabled, setAutoCallingEnabled] = useState<boolean | null>(null)
  const [autoToggleLoading, setAutoToggleLoading] = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/ai-calls')
    if (res.ok) {
      const data = await res.json()
      setCalls(data.calls)
      const s: Record<string, number> = {}
      for (const row of data.stats) s[row.status] = row._count
      setStats(s)
    }
    setLoading(false)
  }

  async function loadAutoCallingSetting() {
    const res = await fetch('/api/settings/property')
    if (res.ok) {
      const data = await res.json()
      setAutoCallingEnabled(!!data.property?.autoAiCallingEnabled)
    }
  }

  useEffect(() => { load(); loadAutoCallingSetting() }, [])

  async function toggleAutoCalling() {
    if (autoCallingEnabled === null) return
    const next = !autoCallingEnabled
    setAutoToggleLoading(true)
    try {
      const res = await fetch('/api/settings/property', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoAiCallingEnabled: next }),
      })
      if (!res.ok) {
        toast.error('Failed to update auto-calling setting')
        return
      }
      setAutoCallingEnabled(next)
      toast.success(
        next
          ? 'Auto AI calling turned ON — new leads will be called ~5 min after creation.'
          : 'Auto AI calling turned OFF — new leads will not be called automatically.'
      )
    } catch {
      toast.error('Failed to update auto-calling setting')
    } finally {
      setAutoToggleLoading(false)
    }
  }

  async function triggerCall(leadId: string) {
    setTriggering(leadId)
    await fetch('/api/ai-calls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, immediate: true }),
    })
    await load()
    setTriggering(null)
  }

  async function startBulkCalling() {
    setBulkLoading(true)
    try {
      const res = await fetch('/api/ai-calls/bulk-trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minDaysOld }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to start bulk calling')
        return
      }
      if (data.queued === 0) {
        toast.success(`No leads older than ${minDaysOld} day${minDaysOld === 1 ? '' : 's'} without a call — nothing to queue.`)
      } else {
        toast.success(
          `Queued ${data.queued} call${data.queued === 1 ? '' : 's'}, staggered ~90s apart.` +
            (data.overCap ? ` (capped at ${data.cappedAt} — more leads matched, run again after this batch finishes.)` : '')
        )
      }
      await load()
    } catch {
      toast.error('Failed to start bulk calling')
    } finally {
      setBulkLoading(false)
    }
  }

  const total = calls.length
  const connected = calls.filter((c) => ['COMPLETED', 'IN_PROGRESS'].includes(c.status)).length
  const qualified = calls.filter((c) => c.outcome === 'QUALIFIED').length
  const pending = calls.filter((c) => c.status === 'PENDING').length

  return (
    <DashboardLayout>
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Calling</h1>
          <p className="text-sm text-muted-foreground mt-1">Qualification calls to leads — automatic and manual</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium hover:bg-accent/20 transition"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {/* Section 1: ONGOING automatic behavior — applies to every future new lead, off by default */}
      <div
        className={`rounded-xl border p-4 ${autoCallingEnabled ? 'bg-green-50 border-green-200' : 'bg-muted/30'}`}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Automatic — applies to every new lead going forward
        </p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {autoCallingEnabled ? (
              <Zap size={20} className="text-green-600" />
            ) : (
              <ZapOff size={20} className="text-muted-foreground" />
            )}
            <div>
              <p className="text-sm font-medium text-foreground">
                Auto AI Calling — new leads called ~5 min after creation
              </p>
              <p className="text-xs text-muted-foreground">
                {autoCallingEnabled
                  ? 'ON — every new lead (manual, CSV import, Google Sheets sync) will get an automatic AI call, capped at 20/hour.'
                  : 'OFF — new leads will NOT be called automatically. Use the manual catch-up below, or the per-lead button, to call.'}
              </p>
            </div>
          </div>
          <button
            onClick={toggleAutoCalling}
            disabled={autoCallingEnabled === null || autoToggleLoading}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 ${
              autoCallingEnabled
                ? 'bg-green-600 text-white hover:opacity-90'
                : 'bg-card border hover:bg-accent/20'
            }`}
          >
            {autoCallingEnabled === null ? '…' : autoCallingEnabled ? 'Turn OFF' : 'Turn ON'}
          </button>
        </div>
      </div>

      {/* Section 2: ONE-TIME manual batch — catches up existing leads right now, regardless of the toggle above */}
      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Manual catch-up — call existing leads once, right now
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-background">
            <label htmlFor="minDaysOld" className="text-xs text-muted-foreground whitespace-nowrap">
              Leads older than
            </label>
            <input
              id="minDaysOld"
              type="number"
              min={0}
              value={minDaysOld}
              onChange={(e) => setMinDaysOld(Math.max(0, Number(e.target.value) || 0))}
              className="w-14 px-1.5 py-0.5 rounded border bg-background text-sm text-center"
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">days, never called</span>
          </div>
          <button
            onClick={startBulkCalling}
            disabled={bulkLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
          >
            <PhoneForwarded size={16} />
            {bulkLoading ? 'Starting…' : 'Start AI Calling'}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Queues up to 50 matching leads at once, dialed ~90s apart. Run again for more.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Calls', value: total, icon: Phone, color: 'text-blue-600' },
          { label: 'Pending', value: pending, icon: Clock, color: 'text-yellow-600' },
          { label: 'Connected', value: connected, icon: PhoneCall, color: 'text-green-600' },
          { label: 'Qualified', value: qualified, icon: CheckCircle, color: 'text-green-700' },
        ].map((s) => (
          <div key={s.label} className="bg-card border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-accent/20 ${s.color}`}>
                <s.icon size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Calls table */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold text-foreground">Call History</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
        ) : calls.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No calls yet. Turn on Auto AI Calling above, or use &quot;Start AI Calling&quot; / the per-lead call button.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  {['Lead', 'Phone', 'Status', 'Outcome', 'Score', 'Duration', 'Time', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {calls.map((call) => {
                  const st = STATUS_CONFIG[call.status] ?? STATUS_CONFIG.FAILED
                  const oc = call.outcome ? OUTCOME_CONFIG[call.outcome] : null
                  const StIcon = st.icon
                  return (
                    <tr key={call.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/leads/${call.lead.id}`} className="font-medium text-foreground hover:underline">
                          {call.lead.name}
                        </Link>
                        <p className="text-xs text-muted-foreground capitalize">
                          {call.lead.eventType.replace(/_/g, ' ').toLowerCase()}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{call.lead.phone}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${st.color}`}>
                          <StIcon size={12} />
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {oc ? (
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${oc.color}`}>
                            {oc.label}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {call.qualifiedScore != null ? (
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded-full"
                                style={{ width: `${call.qualifiedScore}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">{call.qualifiedScore}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDuration(call.duration)}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{formatTime(call.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {call.notes && (
                            <button
                              onClick={() => setSelectedCall(call)}
                              className="text-xs text-primary hover:underline"
                            >
                              Notes
                            </button>
                          )}
                          {['NO_ANSWER', 'BUSY', 'FAILED'].includes(call.status) && (
                            <button
                              onClick={() => triggerCall(call.lead.id)}
                              disabled={triggering === call.lead.id}
                              className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                            >
                              Retry
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Notes/Transcript modal */}
      {selectedCall && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedCall(null)}
        >
          <div
            className="bg-card rounded-xl border max-w-lg w-full p-6 space-y-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Call Notes — {selectedCall.lead.name}</h3>
              <button onClick={() => setSelectedCall(null)} className="text-muted-foreground hover:text-foreground">
                <XCircle size={20} />
              </button>
            </div>
            {selectedCall.notes && (
              <p className="text-sm text-foreground bg-muted/30 rounded-lg p-3">{selectedCall.notes}</p>
            )}
            {selectedCall.transcript && selectedCall.transcript.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Transcript</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {selectedCall.transcript.map((line, i) => (
                    <div key={i} className={`text-xs px-3 py-1.5 rounded-lg ${line.role === 'assistant' ? 'bg-primary/10 text-primary' : 'bg-muted/40 text-foreground'}`}>
                      <span className="font-medium capitalize">{line.role === 'assistant' ? 'Priya' : 'Lead'}:</span> {line.content}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Duration</span>
                <p className="font-medium">{formatDuration(selectedCall.duration)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Score</span>
                <p className="font-medium">{selectedCall.qualifiedScore ?? '—'}/100</p>
              </div>
              <div>
                <span className="text-muted-foreground">Outcome</span>
                <p className="font-medium">{selectedCall.outcome ?? '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Attempts</span>
                <p className="font-medium">{selectedCall.attempts}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </DashboardLayout>
  )
}
