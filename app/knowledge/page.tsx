'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react'

import { DashboardLayout } from '@/components/dashboard-layout'
import { canManage } from '@/lib/roles'

type FactSource = 'scrape' | 'manual'
type KeyFact = { category: string; fact: string; source: FactSource }
type KnowledgeStatus = 'EMPTY' | 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED'
type PageInfo = { url: string; title: string | null; wordCount: number }

type KnowledgeResponse = {
  status: KnowledgeStatus
  websiteUrl: string | null
  sourceUrl: string | null
  pagesScraped: number
  factsCount: number
  lastScrapedAt: string | null
  error: string | null
  keyFacts: KeyFact[]
  pages: PageInfo[]
}

const MAX_SCRAPE_FACTS = 20

async function fetchKnowledge(): Promise<KnowledgeResponse> {
  const response = await fetch('/api/knowledge')
  if (!response.ok) throw new Error('Failed to load knowledge base')
  return response.json()
}

const statusLabels: Record<KnowledgeStatus, string> = {
  EMPTY: 'Not built yet',
  PENDING: 'Queued',
  PROCESSING: 'Scraping the website...',
  READY: 'Ready',
  FAILED: 'Failed',
}

export default function KnowledgePage() {
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const canEdit = canManage(session?.user?.role)

  const knowledgeQuery = useQuery({
    queryKey: ['knowledge'],
    queryFn: fetchKnowledge,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'PENDING' || status === 'PROCESSING' ? 3000 : false
    },
  })

  const data = knowledgeQuery.data
  const isBusy = data?.status === 'PENDING' || data?.status === 'PROCESSING'

  // Local editable copy of the facts list. Only re-synced from the server when the user
  // hasn't started editing (factsDirty), so an in-flight poll (every 3s while scraping)
  // never clobbers facts they're actively typing.
  const [facts, setFacts] = useState<KeyFact[]>([])
  const [factsDirty, setFactsDirty] = useState(false)
  const [pagesOpen, setPagesOpen] = useState(false)

  useEffect(() => {
    if (data && !factsDirty) setFacts(data.keyFacts)
  }, [data, factsDirty])

  const scrapeMutation = useMutation({
    mutationFn: async (websiteUrl: string) => {
      const response = await fetch('/api/knowledge/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteUrl }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error ?? 'Failed to start scrape')
      return body
    },
    onSuccess: () => {
      toast.success('Building knowledge base — this can take a few minutes.')
      queryClient.invalidateQueries({ queryKey: ['knowledge'] })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to start scrape'),
  })

  const recompileMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/knowledge/recompile', { method: 'POST' })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error ?? 'Failed to regenerate facts')
      return body
    },
    onSuccess: () => {
      toast.success('Regenerating facts from scraped pages...')
      setFactsDirty(false)
      queryClient.invalidateQueries({ queryKey: ['knowledge'] })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to regenerate facts'),
  })

  const saveFactsMutation = useMutation({
    mutationFn: async (payload: KeyFact[]) => {
      const response = await fetch('/api/knowledge', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyFacts: payload }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error ?? 'Failed to save facts')
      return body
    },
    onSuccess: () => {
      toast.success('Knowledge base saved')
      setFactsDirty(false)
      queryClient.invalidateQueries({ queryKey: ['knowledge'] })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to save facts'),
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/knowledge', { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete knowledge base')
      return response.json()
    },
    onSuccess: () => {
      toast.success('Knowledge base deleted')
      setFacts([])
      setFactsDirty(false)
      queryClient.invalidateQueries({ queryKey: ['knowledge'] })
    },
    onError: () => toast.error('Failed to delete knowledge base'),
  })

  function submitSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const websiteUrl = String(form.get('websiteUrl') ?? '').trim()
    if (!websiteUrl) {
      toast.error('Enter a website URL first')
      return
    }
    scrapeMutation.mutate(websiteUrl)
  }

  function updateFact(index: number, patch: Partial<KeyFact>) {
    setFacts((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)))
    setFactsDirty(true)
  }

  function removeFact(index: number) {
    setFacts((prev) => prev.filter((_, i) => i !== index))
    setFactsDirty(true)
  }

  function addManualFact() {
    setFacts((prev) => [...prev, { category: 'Team Notes', fact: '', source: 'manual' }])
    setFactsDirty(true)
  }

  function saveFacts() {
    const cleaned = facts.map((f) => ({ ...f, category: f.category.trim() || 'Overview', fact: f.fact.trim() }))
      .filter((f) => f.fact.length > 0)
    saveFactsMutation.mutate(cleaned)
  }

  const scrapeFactsCount = facts.filter((f) => f.source === 'scrape').length

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold text-foreground">Knowledge Base</h1>
          <p className="text-muted-foreground mt-1">
            Scrape the property&apos;s website into a set of key facts so Priya (AI calling) can talk
            confidently and specifically about the venue.
          </p>
        </div>

        {knowledgeQuery.isLoading && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading knowledge base...
          </div>
        )}

        {data && (
          <>
            <section className="rounded-lg border border-border bg-card p-6">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Globe className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">Website Source</h2>
                  <p className="text-sm text-muted-foreground">
                    The client&apos;s public website — crawled same-domain, bounded, respecting robots.txt.
                  </p>
                </div>
              </div>

              <form onSubmit={submitSource} className="flex flex-col sm:flex-row gap-3">
                <input
                  name="websiteUrl"
                  type="url"
                  defaultValue={data.websiteUrl ?? ''}
                  placeholder="https://venue.com"
                  disabled={!canEdit}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
                />
                {canEdit && (
                  <button
                    type="submit"
                    disabled={isBusy || scrapeMutation.isPending}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {(isBusy || scrapeMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
                    {data.status === 'EMPTY' ? 'Build Knowledge Base' : 'Rebuild Knowledge Base'}
                  </button>
                )}
              </form>

              <div className="mt-4 flex items-center gap-2 text-sm">
                <StatusBadge status={data.status} />
                {data.status === 'PROCESSING' && (
                  <span className="text-muted-foreground">{data.pagesScraped} pages scraped so far...</span>
                )}
                {data.status === 'READY' && data.lastScrapedAt && (
                  <span className="text-muted-foreground">
                    Last scraped {new Date(data.lastScrapedAt).toLocaleString()} · {data.pagesScraped} pages ·{' '}
                    {data.factsCount} facts
                  </span>
                )}
              </div>

              {data.status === 'FAILED' && data.error && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{data.error}</span>
                </div>
              )}
            </section>

            <section className="rounded-lg border border-border bg-card p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-foreground">Key Facts</h2>
                    <p className="text-sm text-muted-foreground">
                      What Priya knows about the venue. Scraped facts are regenerated on rebuild — facts
                      you add by hand are never touched.
                    </p>
                  </div>
                </div>
                <span
                  className={`text-xs font-medium rounded-full px-2 py-1 ${
                    scrapeFactsCount > MAX_SCRAPE_FACTS
                      ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {scrapeFactsCount} / {MAX_SCRAPE_FACTS} scraped facts
                </span>
              </div>

              {facts.length === 0 && (
                <p className="text-sm text-muted-foreground mb-4">
                  No facts yet. Build the knowledge base above, or add a fact by hand below.
                </p>
              )}

              <div className="space-y-2 mb-4">
                {facts.map((fact, index) => (
                  <div key={index} className="flex items-start gap-2 rounded-lg border border-border p-2">
                    <input
                      value={fact.category}
                      onChange={(e) => updateFact(index, { category: e.target.value })}
                      disabled={!canEdit}
                      placeholder="Category"
                      className="w-40 flex-shrink-0 rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-medium disabled:opacity-60"
                    />
                    <textarea
                      value={fact.fact}
                      onChange={(e) => updateFact(index, { fact: e.target.value })}
                      disabled={!canEdit}
                      rows={2}
                      placeholder="Fact"
                      className="flex-1 resize-none rounded-lg border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-60"
                    />
                    <span
                      className={`mt-1.5 flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        fact.source === 'manual'
                          ? 'bg-accent/10 text-accent'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {fact.source === 'manual' ? 'added by team' : 'scraped'}
                    </span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => removeFact(index)}
                        className="flex-shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-red-500"
                        aria-label="Remove fact"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {canEdit && (
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={addManualFact}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                  >
                    <Plus className="h-4 w-4" />
                    Add fact
                  </button>
                  <button
                    type="button"
                    onClick={saveFacts}
                    disabled={saveFactsMutation.isPending || !factsDirty}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {saveFactsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Save Facts
                  </button>
                  {data.pages.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm('Regenerate scraped facts from the stored pages? This replaces scraped facts but keeps facts your team added by hand.')) {
                          recompileMutation.mutate()
                        }
                      }}
                      disabled={isBusy || recompileMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
                    >
                      {recompileMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Regenerate Facts
                    </button>
                  )}
                </div>
              )}
            </section>

            {data.pages.length > 0 && (
              <section className="rounded-lg border border-border bg-card p-6">
                <button
                  type="button"
                  onClick={() => setPagesOpen((v) => !v)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <h2 className="font-semibold text-foreground">Scraped Pages ({data.pages.length})</h2>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${pagesOpen ? 'rotate-180' : ''}`} />
                </button>
                {pagesOpen && (
                  <div className="mt-4 space-y-1 max-h-96 overflow-y-auto">
                    {data.pages.map((page) => (
                      <div key={page.url} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-foreground">{page.title ?? page.url}</p>
                          <p className="truncate text-xs text-muted-foreground">{page.url}</p>
                        </div>
                        <span className="flex-shrink-0 text-xs text-muted-foreground">{page.wordCount} words</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {canEdit && data.status !== 'EMPTY' && (
              <section className="rounded-lg border border-red-500/30 bg-card p-6">
                <h2 className="font-semibold text-foreground mb-1">Delete Knowledge Base</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Removes all scraped pages and key facts for this property. Priya will fall back to
                  having no venue context on calls until it&apos;s rebuilt.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Delete the entire knowledge base for this property? This cannot be undone.')) {
                      deleteMutation.mutate()
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-60 dark:text-red-400"
                >
                  {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete Knowledge Base
                </button>
              </section>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

function StatusBadge({ status }: { status: KnowledgeStatus }) {
  const styles: Record<KnowledgeStatus, string> = {
    EMPTY: 'bg-muted text-muted-foreground',
    PENDING: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    PROCESSING: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    READY: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    FAILED: 'bg-red-500/10 text-red-600 dark:text-red-400',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${styles[status]}`}>
      {(status === 'PENDING' || status === 'PROCESSING') && <Loader2 className="h-3 w-3 animate-spin" />}
      {statusLabels[status]}
    </span>
  )
}
