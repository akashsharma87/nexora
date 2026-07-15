'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FileText, Loader2 } from 'lucide-react'

import { useActiveProject } from '@/components/active-project-provider'
import { DashboardLayout } from '@/components/dashboard-layout'
import { eventTypeLabels, formatCurrency, formatDate } from '@/lib/format'

type Proposal = {
  id: string
  title: string
  amount?: string | number | null
  status: string
  sentAt?: string | null
  createdAt: string
  lead: {
    id: string
    name: string
    eventType: string
    stage: string
  }
}

async function fetchProposals(status: string): Promise<{ proposals: Proposal[] }> {
  const params = new URLSearchParams()
  if (status !== 'ALL') params.set('status', status)
  const response = await fetch(`/api/proposals?${params.toString()}`)
  if (!response.ok) throw new Error('Failed to load proposals')
  return response.json()
}

const statuses = ['ALL', 'DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED']

export default function ProposalsPage() {
  const { activeProject } = useActiveProject()
  const currency = activeProject?.currency ?? 'INR'
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('ALL')
  const { data, isLoading, isError } = useQuery({ queryKey: ['proposals', status], queryFn: () => fetchProposals(status) })

  const updateStatus = useMutation({
    mutationFn: async ({ id, nextStatus }: { id: string; nextStatus: string }) => {
      const response = await fetch(`/api/proposals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      if (!response.ok) throw new Error('Failed to update proposal')
      return response.json()
    },
    onSuccess: () => {
      toast.success('Proposal updated')
      queryClient.invalidateQueries({ queryKey: ['proposals'] })
    },
    onError: () => toast.error('Proposal could not be updated'),
  })

  const proposals = data?.proposals ?? []

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold text-foreground">Proposals</h1>
          <p className="text-muted-foreground mt-1">Track proposal drafts, sends, views, acceptances, and declines across all leads.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {statuses.map((item) => (
            <button
              key={item}
              onClick={() => setStatus(item)}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${status === item ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-foreground hover:bg-muted'}`}
            >
              {item === 'ALL' ? 'All' : item}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading proposals...
          </div>
        )}
        {isError && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-destructive">Could not load proposals.</div>}

        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr className="text-muted-foreground text-left">
                  <th className="p-4 font-medium">Proposal</th>
                  <th className="p-4 font-medium">Lead</th>
                  <th className="p-4 font-medium">Event</th>
                  <th className="p-4 font-medium">Amount</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium">Created</th>
                  <th className="p-4 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((proposal) => (
                  <tr key={proposal.id} className="border-b border-border hover:bg-muted/50">
                    <td className="p-4 font-medium text-foreground">
                      <Link href={`/proposals/${proposal.id}`} className="inline-flex items-center gap-2 hover:underline">
                        <FileText className="h-4 w-4 text-primary" />
                        {proposal.title}
                      </Link>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      <Link href={`/leads/${proposal.lead.id}`} className="hover:underline">
                        {proposal.lead.name}
                      </Link>
                    </td>
                    <td className="p-4 text-muted-foreground">{eventTypeLabels[proposal.lead.eventType] ?? proposal.lead.eventType}</td>
                    <td className="p-4 text-muted-foreground">{proposal.amount ? formatCurrency(Number(proposal.amount), 'rupees', currency) : 'Not set'}</td>
                    <td className="p-4">
                      <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{proposal.status}</span>
                    </td>
                    <td className="p-4 text-muted-foreground">{formatDate(proposal.createdAt)}</td>
                    <td className="p-4">
                      <select
                        value={proposal.status}
                        onChange={(event) => updateStatus.mutate({ id: proposal.id, nextStatus: event.target.value })}
                        className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                      >
                        {statuses.filter((item) => item !== 'ALL').map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!isLoading && proposals.length === 0 && <div className="p-10 text-center text-muted-foreground">No proposals found.</div>}
        </div>
      </div>
    </DashboardLayout>
  )
}
