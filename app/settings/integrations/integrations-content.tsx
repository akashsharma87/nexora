'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Check, ChevronDown, ChevronRight, Loader2, Plug, Plus, RefreshCw, Search, Sheet, Trash2, X, Zap } from 'lucide-react'

import { DashboardLayout } from '@/components/dashboard-layout'
import { sourceLabels, formatDate } from '@/lib/format'

type AdAccount = {
  id: string
  name: string
  accountStatus?: number
  currency?: string
  businessName?: string | null
}

function AdPlatformCard({
  label,
  connectHref,
  accountsQueryKey,
  accountsUrl,
  syncUrl,
  selectedId,
  selectedName,
  onSelect,
}: {
  label: string
  connectHref: string
  accountsQueryKey: string
  accountsUrl: string
  syncUrl?: string
  selectedId: string | null | undefined
  selectedName: string | null | undefined
  onSelect: (account: AdAccount) => void
}) {
  const [search, setSearch] = useState('')
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: [accountsQueryKey],
    queryFn: async () => {
      const r = await fetch(accountsUrl)
      return r.json() as Promise<{ connected: boolean; accounts: AdAccount[]; error?: string }>
    },
  })

  const syncMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(syncUrl!, { method: 'POST' })
      const result = await r.json()
      if (!r.ok) throw new Error(result.error || 'Sync failed')
      return result as { synced: number }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success(`Synced ${result.synced} campaign${result.synced === 1 ? '' : 's'} from ${label}`)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Sync failed'),
  })

  const connected = data?.connected ?? false
  const accounts = data?.accounts ?? []
  const filtered = search
    ? accounts.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))
    : accounts

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-white font-medium text-sm">{label}</h3>
          {connected ? (
            <p className="text-xs text-green-400 mt-0.5">Master account connected</p>
          ) : (
            <p className="text-xs text-zinc-500 mt-0.5">Not connected</p>
          )}
        </div>
        <a
          href={connectHref}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors"
        >
          <Plug className="h-3.5 w-3.5" />
          {connected ? 'Reconnect' : 'Connect'}
        </a>
      </div>

      {connected && (
        <>
          {selectedId && (
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-zinc-400">
                Selected account: <span className="text-white font-medium">{selectedName}</span>
              </p>
              {syncUrl && (
                <button
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50 shrink-0 ml-2"
                >
                  {syncMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Zap className="h-3.5 w-3.5" />
                  )}
                  Sync Campaigns
                </button>
              )}
            </div>
          )}
          <div className="relative mb-2">
            <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ad accounts..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-violet-500"
            />
          </div>
          <div className="max-h-56 overflow-y-auto space-y-1">
            {isLoading ? (
              <p className="text-xs text-zinc-500 py-2">Loading ad accounts...</p>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-zinc-500 py-2">No ad accounts found</p>
            ) : (
              filtered.map((a) => (
                <button
                  key={a.id}
                  onClick={() => onSelect(a)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    a.id === selectedId
                      ? 'bg-violet-600/20 border border-violet-500/40 text-white'
                      : 'bg-zinc-800/60 border border-transparent text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate">{a.name}</span>
                    {a.id === selectedId && <Check className="h-3.5 w-3.5 text-violet-400 shrink-0 ml-2" />}
                  </div>
                  {a.businessName && <span className="text-xs text-zinc-500">{a.businessName}</span>}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

type Connection = {
  id: string
  name: string
  provider: string
  source: string
  sheetId: string | null
  tabName: string | null
  headerRow: number
  columnMap: Record<string, string>
  status: string
  lastSyncedAt: string | null
  lastSyncCount: number
  lastSyncStatus: string | null
  lastSyncError: string | null
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Name *',
  phone: 'Phone *',
  email: 'Email',
  eventType: 'Event Type',
  eventDate: 'Event Date',
  guestCount: 'Guest Count',
  budgetMin: 'Budget Min (L)',
  budgetMax: 'Budget Max (L)',
  notes: 'Notes',
}

const SOURCES = Object.keys(sourceLabels)

export function IntegrationsPageContent() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showForm, setShowForm] = useState(false)
  const [testResult, setTestResult] = useState<{ headers: string[]; sampleRows: string[][]; suggestedMap: Record<string, string> } | null>(null)
  const [columnMap, setColumnMap] = useState<Record<string, string>>({})
  const [isTesting, setIsTesting] = useState(false)
  const [availableTabs, setAvailableTabs] = useState<string[]>([])
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', provider: 'GOOGLE_SHEETS', source: 'DIRECT',
    sheetId: '', tabName: 'Sheet1', headerRow: 1, allTabs: false,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const r = await fetch('/api/integrations')
      return r.json() as Promise<{ connections: Connection[] }>
    },
  })

  const { data: propertyData } = useQuery({
    queryKey: ['settings-property'],
    queryFn: async () => {
      const r = await fetch('/api/settings/property')
      return r.json() as Promise<{
        property: {
          metaAdAccountId: string | null
          metaAdAccountName: string | null
          googleAdsCustomerId: string | null
          googleAdsAccountName: string | null
        }
      }>
    },
  })

  const selectAdAccountMutation = useMutation({
    mutationFn: async (body: Record<string, string>) => {
      const r = await fetch('/api/settings/property', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error('Failed to save')
      return r.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-property'] })
      toast.success('Ad account linked to this property')
    },
    onError: () => toast.error('Failed to link ad account'),
  })

  useEffect(() => {
    const metaConnected = searchParams.get('meta_connected')
    const metaError = searchParams.get('meta_error')
    const googleAdsConnected = searchParams.get('google_ads_connected')
    const googleAdsError = searchParams.get('google_ads_error')
    if (metaConnected) toast.success(`Meta connected as ${metaConnected}`)
    if (metaError) toast.error(metaError)
    if (googleAdsConnected) toast.success(`Google Ads connected as ${googleAdsConnected}`)
    if (googleAdsError) toast.error(googleAdsError)
    if (metaConnected || metaError || googleAdsConnected || googleAdsError) router.replace('/settings/integrations')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, columnMap }),
      })
      if (!r.ok) throw new Error('Failed to save')
      return r.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      toast.success('Integration saved')
      setShowForm(false)
      setTestResult(null)
      setColumnMap({})
      setAvailableTabs([])
      setForm({ name: '', provider: 'GOOGLE_SHEETS', source: 'DIRECT', sheetId: '', tabName: 'Sheet1', headerRow: 1, allTabs: false })
    },
    onError: () => toast.error('Failed to save integration'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/integrations/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Failed to delete')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      toast.success('Integration removed')
    },
    onError: () => toast.error('Failed to remove integration'),
  })

  async function handleTest() {
    if (!form.sheetId) { toast.error('Enter a Sheet ID or URL first'); return }
    if (!form.name) { toast.error('Give this connection a name first'); return }

    setIsTesting(true)
    try {
      const testRes = await fetch('/api/integrations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetId: form.sheetId, tabName: form.tabName, headerRow: form.headerRow }),
      })
      const result = await testRes.json()

      if (!testRes.ok) {
        if (result.availableTabs?.length) {
          setAvailableTabs(result.availableTabs)
          toast.error(`Tab not found. Select from the dropdown below.`, { duration: 5000 })
        } else {
          toast.error(result.error || 'Test failed')
        }
        return
      }
      setAvailableTabs([])

      setTestResult(result)
      setColumnMap(result.suggestedMap || {})
      toast.success(`Found ${result.headers.length} columns. Confirm the mapping below.`)
    } catch {
      toast.error('Test failed — check the Sheet ID and access permissions')
    } finally {
      setIsTesting(false)
    }
  }

  async function handleSync(connectionId: string) {
    setSyncingId(connectionId)
    try {
      const r = await fetch('/api/integrations/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId }),
      })
      const result = await r.json()
      if (!r.ok) { toast.error(result.error || 'Sync failed'); return }
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      toast.success(`Sync complete: ${result.created} new leads imported, ${result.skipped} duplicates skipped`)
    } catch {
      toast.error('Sync failed')
    } finally {
      setSyncingId(null)
    }
  }

  const connections = data?.connections || []

  return (
    <DashboardLayout>
      <div className="px-4 py-6 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-0.5">Ad Platform Connections</h1>
          <p className="text-zinc-400 text-sm mb-4">
            Connect the agency&apos;s master Meta Business Manager / Google Ads MCC once, then pick which ad account
            feeds this property.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <AdPlatformCard
              label="Meta Ads"
              connectHref="/api/integrations/meta/connect"
              accountsQueryKey="meta-ad-accounts"
              accountsUrl="/api/integrations/meta/accounts"
              syncUrl="/api/integrations/meta/sync-campaigns"
              selectedId={propertyData?.property?.metaAdAccountId}
              selectedName={propertyData?.property?.metaAdAccountName}
              onSelect={(a) =>
                selectAdAccountMutation.mutate({ metaAdAccountId: a.id, metaAdAccountName: a.name })
              }
            />
            <AdPlatformCard
              label="Google Ads"
              connectHref="/api/integrations/google-ads/connect"
              accountsQueryKey="google-ads-accounts"
              accountsUrl="/api/integrations/google-ads/accounts"
              syncUrl="/api/integrations/google-ads/sync-campaigns"
              selectedId={propertyData?.property?.googleAdsCustomerId}
              selectedName={propertyData?.property?.googleAdsAccountName}
              onSelect={(a) =>
                selectAdAccountMutation.mutate({ googleAdsCustomerId: a.id, googleAdsAccountName: a.name })
              }
            />
          </div>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Lead Integrations</h2>
            <p className="text-zinc-400 text-sm mt-0.5">Import leads from Google Sheets — one connection per source</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Sheet Source
          </button>
        </div>

        {/* Service account instruction */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6 text-sm text-blue-300">
          <p className="font-medium mb-1">Setup Instructions</p>
          <p className="text-blue-400">Share your Google Sheet with the service account email configured in your environment variables. Give it <strong>Viewer</strong> access.</p>
        </div>

        {/* Add form */}
        {showForm && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">New Sheet Connection</h2>
              <button onClick={() => { setShowForm(false); setTestResult(null) }} className="text-zinc-500 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="col-span-2">
                <label className="block text-xs text-zinc-400 mb-1">Connection Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Website Leads — Mumbai"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Lead Source *</label>
                <select
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                >
                  {SOURCES.map((s) => <option key={s} value={s}>{sourceLabels[s]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  {form.allTabs ? 'Preview Tab (for column detection)' : 'Tab Name'}
                </label>
                {availableTabs.length > 0 ? (
                  <select
                    value={form.tabName}
                    onChange={(e) => { setForm({ ...form, tabName: e.target.value }); setAvailableTabs([]) }}
                    className="w-full bg-zinc-800 border border-amber-500/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                  >
                    {availableTabs.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                ) : (
                  <input
                    value={form.tabName}
                    onChange={(e) => setForm({ ...form, tabName: e.target.value })}
                    placeholder="Sheet1"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                  />
                )}
                {availableTabs.length > 0 && (
                  <p className="text-xs text-amber-400 mt-1">Select the correct tab and test again.</p>
                )}
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-zinc-400 mb-1">Google Sheet URL or ID *</label>
                <input
                  value={form.sheetId}
                  onChange={(e) => setForm({ ...form, sheetId: e.target.value })}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                />
              </div>
              <label className="col-span-2 flex items-start gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={form.allTabs}
                  onChange={(e) => setForm({ ...form, allTabs: e.target.checked })}
                  className="mt-0.5 accent-violet-600"
                />
                <span>
                  Sync every tab in this sheet (e.g. each tab is a different campaign). All tabs must share the
                  same columns — the mapping below is applied to all of them. Each imported lead will show which
                  tab it came from.
                </span>
              </label>
            </div>

            {!testResult ? (
              <button
                onClick={handleTest}
                disabled={isTesting}
                className="w-full py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {isTesting ? <><Loader2 className="h-4 w-4 animate-spin" />Testing connection...</> : <><Sheet className="h-4 w-4" />Test Connection</>}
              </button>
            ) : (
              <div>
                <p className="text-xs text-green-400 font-medium mb-3 flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" />
                  Sheet connected — {testResult.headers.length} columns detected. Map your fields:
                </p>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {Object.entries(FIELD_LABELS).map(([field, label]) => (
                    <div key={field}>
                      <label className="block text-xs text-zinc-400 mb-1">{label}</label>
                      <select
                        value={columnMap[field] || ''}
                        onChange={(e) => setColumnMap({ ...columnMap, [field]: e.target.value })}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-violet-500"
                      >
                        <option value="">— not mapped —</option>
                        {testResult.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>

                {/* Sample rows preview */}
                {testResult.sampleRows.length > 0 && (
                  <div className="mb-4 overflow-x-auto">
                    <p className="text-xs text-zinc-500 mb-1.5">Sample rows:</p>
                    <table className="text-xs text-zinc-400 w-full">
                      <thead>
                        <tr>{testResult.headers.map((h) => <th key={h} className="text-left pr-3 py-1 text-zinc-500">{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {testResult.sampleRows.slice(0, 2).map((row, i) => (
                          <tr key={i}>{row.map((cell, j) => <td key={j} className="pr-3 py-1 truncate max-w-[120px]">{cell}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <button
                  onClick={() => createMutation.mutate()}
                  disabled={createMutation.isPending || !columnMap.name || !columnMap.phone}
                  className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Save & Confirm Mapping
                </button>
              </div>
            )}
          </div>
        )}

        {/* Connections list */}
        {isLoading ? (
          <div className="text-center py-12 text-zinc-500">Loading integrations...</div>
        ) : connections.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-zinc-800 rounded-xl">
            <Sheet className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400">No sheet connections yet</p>
            <p className="text-zinc-600 text-sm mt-1">Add your first Google Sheet source above</p>
          </div>
        ) : (
          <div className="space-y-3">
            {connections.map((conn) => (
              <div key={conn.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-white font-medium text-sm">{conn.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${
                        conn.status === 'ACTIVE' ? 'bg-green-500/10 border-green-500/30 text-green-400' :
                        conn.status === 'ERROR' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                        'bg-zinc-700 border-zinc-600 text-zinc-400'
                      }`}>
                        {conn.status}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      {conn.provider.replaceAll('_', ' ')} · Source: {sourceLabels[conn.source] || conn.source} ·{' '}
                      {conn.tabName ? `Tab: ${conn.tabName}` : 'All tabs'}
                    </p>
                    {conn.lastSyncedAt && (
                      <p className="text-xs text-zinc-600 mt-1">
                        Last sync: {formatDate(conn.lastSyncedAt)} · {conn.lastSyncCount} leads imported
                        {conn.lastSyncStatus === 'ok' ? ' ✓' : conn.lastSyncError ? ` · Error: ${conn.lastSyncError.slice(0, 60)}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <button
                      onClick={() => handleSync(conn.id)}
                      disabled={syncingId === conn.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {syncingId === conn.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      Sync Now
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(conn.id)}
                      className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
