'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'

import { DashboardLayout } from '@/components/dashboard-layout'
import { eventTypeLabels, sourceLabels } from '@/lib/format'

const eventTypes = Object.keys(eventTypeLabels)
const sources = Object.keys(sourceLabels)

export default function NewLeadPage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data: campaignData } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const response = await fetch('/api/campaigns')
      if (!response.ok) throw new Error('Failed')
      return response.json() as Promise<{ campaigns: { id: string; name: string; type: string }[] }>
    },
  })

  const campaigns = campaignData?.campaigns ?? []

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)

    const form = new FormData(event.currentTarget)
    const campaignId = form.get('campaignId')
    const payload = {
      name: form.get('name'),
      email: form.get('email'),
      phone: form.get('phone'),
      eventType: form.get('eventType'),
      eventDate: form.get('eventDate'),
      guestCount: form.get('guestCount'),
      budgetMin: form.get('budgetMin'),
      budgetMax: form.get('budgetMax'),
      source: form.get('source'),
      notes: form.get('notes'),
      ...(campaignId ? { campaignId } : {}),
    }

    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    setIsSubmitting(false)

    if (!response.ok) {
      toast.error('Lead could not be created')
      return
    }

    const data = await response.json()
    toast.success('Lead created — WhatsApp nurture sequence queued')
    router.push(`/leads/${data.lead.id}`)
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl space-y-6">
        <div>
          <Link href="/leads" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to leads
          </Link>
          <h1 className="text-4xl font-bold text-foreground">Add Lead</h1>
          <p className="text-muted-foreground mt-1">Capture a banquet inquiry and start the lifecycle timeline.</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-2">
              <span className="text-sm font-medium">Name</span>
              <input name="name" required className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Phone</span>
              <input name="phone" required className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Email</span>
              <input name="email" type="email" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Event Date</span>
              <input name="eventDate" type="date" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Event Type</span>
              <select name="eventType" required className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary">
                {eventTypes.map((eventType) => (
                  <option key={eventType} value={eventType}>
                    {eventTypeLabels[eventType]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Source</span>
              <select name="source" required className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary">
                {sources.map((source) => (
                  <option key={source} value={source}>
                    {sourceLabels[source]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Guest Count</span>
              <input name="guestCount" type="number" min="1" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-2">
                <span className="text-sm font-medium">Budget Min (L)</span>
                <input name="budgetMin" type="number" min="0" step="0.1" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium">Budget Max (L)</span>
                <input name="budgetMax" type="number" min="0" step="0.1" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
              </label>
            </div>
            {campaigns.length > 0 && (
              <label className="space-y-2">
                <span className="text-sm font-medium">Campaign <span className="text-muted-foreground font-normal">(optional)</span></span>
                <select name="campaignId" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary">
                  <option value="">No campaign</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <label className="space-y-2 block">
            <span className="text-sm font-medium">Notes</span>
            <textarea name="notes" rows={4} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {isSubmitting ? 'Saving...' : 'Create Lead'}
          </button>
        </form>
      </div>
    </DashboardLayout>
  )
}
