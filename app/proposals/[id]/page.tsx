'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowLeft, Download, Loader2, Mail, MessageSquare, Sparkles } from 'lucide-react'

import { useActiveProject } from '@/components/active-project-provider'
import { DashboardLayout } from '@/components/dashboard-layout'
import { eventTypeLabels, formatCurrency, formatDate } from '@/lib/format'

type ProposalDetail = {
  id: string
  title: string
  content: string
  amount?: string | number | null
  eventDate?: string | null
  guestCount?: number | null
  validUntil?: string | null
  status: string
  sentAt?: string | null
  viewedAt?: string | null
  acceptedAt?: string | null
  declinedAt?: string | null
  lead: {
    id: string
    name: string
    phone: string
    email?: string | null
    eventType: string
    source: string
  }
}

async function fetchProposal(id: string): Promise<{ proposal: ProposalDetail }> {
  const response = await fetch(`/api/proposals/${id}`)
  if (!response.ok) throw new Error('Failed to load proposal')
  return response.json()
}

export default function ProposalDetailPage() {
  const { activeProject } = useActiveProject()
  const currency = activeProject?.currency ?? 'INR'
  const params = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useQuery({ queryKey: ['proposal', params.id], queryFn: () => fetchProposal(params.id) })

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const response = await fetch(`/api/proposals/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!response.ok) throw new Error('Failed to update proposal')
      return response.json()
    },
    onSuccess: () => {
      toast.success('Proposal updated')
      queryClient.invalidateQueries({ queryKey: ['proposal', params.id] })
      queryClient.invalidateQueries({ queryKey: ['proposals'] })
    },
    onError: () => toast.error('Proposal could not be updated'),
  })

  const generateAI = useMutation({
    mutationFn: async () => {
      if (!proposal) return
      const genRes = await fetch('/api/proposals/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: proposal.lead.id }),
      })
      if (!genRes.ok) throw new Error('Failed to generate content')
      const { content } = await genRes.json()

      const patchRes = await fetch(`/api/proposals/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!patchRes.ok) throw new Error('Failed to save content')
      return patchRes.json()
    },
    onSuccess: () => {
      toast.success('AI content generated and saved')
      queryClient.invalidateQueries({ queryKey: ['proposal', params.id] })
    },
    onError: () => toast.error('Could not generate AI content'),
  })

  const sendEmail = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/proposals/${params.id}/send-email`, { method: 'POST' })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'Failed to send email')
      }
      return response.json()
    },
    onSuccess: () => {
      toast.success('Email sent to lead')
      queryClient.invalidateQueries({ queryKey: ['proposal', params.id] })
      queryClient.invalidateQueries({ queryKey: ['proposals'] })
    },
    onError: (err: Error) => toast.error(err.message || 'Could not send email'),
  })

  const sendWhatsApp = useMutation({
    mutationFn: async () => {
      if (!proposal) return
      const message = `Hi ${proposal.lead.name}, your ${proposal.title} is ready. Amount: ₹${Number(proposal.amount ?? 0).toLocaleString('en-IN')}. Please review and let us know if you have any questions.`
      const response = await fetch(`/api/leads/${proposal.lead.id}/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, phone: proposal.lead.phone }),
      })
      if (!response.ok) throw new Error('Failed to send')
      return response.json()
    },
    onSuccess: () => {
      toast.success('WhatsApp message sent')
      if (proposal?.status === 'DRAFT') {
        updateStatus.mutate('SENT')
      }
    },
    onError: () => toast.error('Could not send WhatsApp message'),
  })

  const proposal = data?.proposal

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <style>{`@media print { .no-print { display: none !important; } body { background: white !important; color: black !important; } .print-content { max-width: 100% !important; } }`}</style>

        <Link href="/proposals" className="no-print inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to proposals
        </Link>

        {isLoading && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading proposal...
          </div>
        )}
        {isError && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-destructive">Could not load proposal.</div>}

        {proposal && (
          <>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h1 className="text-4xl font-bold text-foreground">{proposal.title}</h1>
                <p className="text-muted-foreground mt-1">
                  <Link href={`/leads/${proposal.lead.id}`} className="hover:underline">
                    {proposal.lead.name}
                  </Link>{' '}
                  · {eventTypeLabels[proposal.lead.eventType] ?? proposal.lead.eventType}
                </p>
              </div>
              <div className="no-print flex flex-wrap gap-2">
                <button
                  onClick={() => generateAI.mutate()}
                  disabled={generateAI.isPending}
                  className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/20 disabled:opacity-60"
                >
                  <Sparkles className="h-4 w-4" />
                  {generateAI.isPending ? 'Generating...' : 'Generate with AI'}
                </button>
                <button
                  onClick={() => sendEmail.mutate()}
                  disabled={sendEmail.isPending || !proposal.lead.email}
                  title={!proposal.lead.email ? 'Lead has no email address' : undefined}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
                >
                  <Mail className="h-4 w-4" />
                  {sendEmail.isPending ? 'Sending...' : 'Send Email'}
                </button>
                <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted">
                  <Download className="h-4 w-4" />
                  Download PDF
                </button>
                <button
                  onClick={() => sendWhatsApp.mutate()}
                  disabled={sendWhatsApp.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  <MessageSquare className="h-4 w-4" />
                  {sendWhatsApp.isPending ? 'Sending...' : 'Send via WhatsApp'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 print-content">
              <section className="xl:col-span-2 rounded-lg border border-border bg-card p-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="rounded-lg bg-muted/50 p-4">
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="text-xl font-bold text-foreground">{proposal.amount ? formatCurrency(Number(proposal.amount), 'rupees', currency) : 'Not set'}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-4">
                    <p className="text-xs text-muted-foreground">Guests</p>
                    <p className="text-xl font-bold text-foreground">{proposal.guestCount ?? 'Not set'}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-4">
                    <p className="text-xs text-muted-foreground">Event Date</p>
                    <p className="text-lg font-bold text-foreground">{formatDate(proposal.eventDate)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-4">
                    <p className="text-xs text-muted-foreground">Valid Until</p>
                    <p className="text-lg font-bold text-foreground">{formatDate(proposal.validUntil)}</p>
                  </div>
                </div>
                <div className="prose prose-invert max-w-none whitespace-pre-wrap text-sm text-foreground leading-relaxed">{proposal.content}</div>
              </section>

              <aside className="no-print rounded-lg border border-border bg-card p-6">
                <h2 className="mb-4 font-semibold text-foreground">Status Timeline</h2>
                <select value={proposal.status} onChange={(event) => updateStatus.mutate(event.target.value)} className="mb-5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  {['DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED'].map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <div className="space-y-3 text-sm">
                  {[
                    ['Draft', proposal.status === 'DRAFT' ? 'Current' : 'Created'],
                    ['Sent', proposal.sentAt ? formatDate(proposal.sentAt) : 'Pending'],
                    ['Viewed', proposal.viewedAt ? formatDate(proposal.viewedAt) : 'Pending'],
                    ['Accepted', proposal.acceptedAt ? formatDate(proposal.acceptedAt) : 'Pending'],
                    ['Declined', proposal.declinedAt ? formatDate(proposal.declinedAt) : 'Pending'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between border-b border-border pb-2">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium text-foreground">{value}</span>
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
