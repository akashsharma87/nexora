'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowLeft, Send, Sparkles } from 'lucide-react'

import { DashboardLayout } from '@/components/dashboard-layout'
import { eventTypeLabels } from '@/lib/format'

type LeadSummary = {
  id: string
  name: string
  eventType: string
  eventDate?: string | null
}

async function fetchLead(id: string): Promise<{ lead: LeadSummary }> {
  const response = await fetch(`/api/leads/${id}`)
  if (!response.ok) throw new Error('Failed to load lead')
  return response.json()
}

function getProposalTemplate(eventType: string, name: string): string {
  switch (eventType) {
    case 'SOCIAL_EVENTS':
      return `Dear ${name}, We are delighted to present this wedding/social event proposal for your consideration. Our banquet venue offers a capacity of 300–500 guests with premium décor, in-house catering, and full event coordination. Package includes: Venue (8 hours), Customized Décor, Multi-Cuisine Buffet (Veg/Non-Veg), Sound & AV, Dedicated Event Manager. We look forward to making your occasion truly memorable.`
    case 'CORPORATE_EVENTS':
      return `Dear ${name}, Thank you for considering our venue for your corporate event. We offer state-of-the-art conference facilities for 50–200 delegates including: Fully Equipped Conference Hall, AV & Projector Setup, Hi-Speed WiFi, Business Lunch/Dinner Catering, Secretarial Support, Ample Parking. Please review the attached details and pricing.`
    case 'BIRTHDAY_SOCIAL':
      return `Dear ${name}, We would be thrilled to host your birthday celebration! Our birthday packages include: Venue Decoration, Birthday Cake, DJ & Sound System, Customized Menu, Photography Setup Area, Complimentary Welcome Drinks.`
    default:
      return `Dear ${name}, We are pleased to present this banquet proposal for your consideration. Our venue offers a customized package with venue, catering, décor, service inclusions, and flexible payment milestones tailored to your event requirements.`
  }
}

export default function NewProposalPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  const { data } = useQuery({
    queryKey: ['lead', params.id],
    queryFn: () => fetchLead(params.id),
  })

  const lead = data?.lead

  useEffect(() => {
    if (!lead) return
    const label = eventTypeLabels[lead.eventType] ?? lead.eventType
    setTitle(`${label} Proposal — ${lead.name}`)
    setContent(getProposalTemplate(lead.eventType, lead.name))
    if (lead.eventDate) {
      setEventDate(new Date(lead.eventDate).toISOString().split('T')[0])
    }
  }, [lead])

  async function handleGenerate() {
    if (!lead) return
    setIsGenerating(true)
    try {
      const response = await fetch('/api/proposals/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: params.id }),
      })
      if (!response.ok) throw new Error('Failed to generate')
      const { content: generated } = await response.json()
      setContent(generated)
      toast.success('AI content generated')
    } catch {
      toast.error('Could not generate AI content — using template')
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    const form = new FormData(event.currentTarget)
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const status = submitter?.value === 'send' ? 'SENT' : 'DRAFT'

    const response = await fetch('/api/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId: params.id,
        title: form.get('title'),
        content: form.get('content'),
        amount: form.get('amount'),
        eventDate: form.get('eventDate'),
        guestCount: form.get('guestCount'),
        validUntil: form.get('validUntil'),
        status,
      }),
    })

    setIsSubmitting(false)

    if (!response.ok) {
      toast.error('Proposal could not be created')
      return
    }

    const responseData = await response.json()
    toast.success(status === 'SENT' ? 'Proposal sent' : 'Proposal saved')
    router.push(`/proposals/${responseData.proposal.id}`)
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl space-y-6">
        <Link href={`/leads/${params.id}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to lead
        </Link>
        <div>
          <h1 className="text-4xl font-bold text-foreground">Create Proposal</h1>
          <p className="text-muted-foreground mt-1">Prepare a banquet proposal and optionally mark it as sent.</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              name="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Proposal title"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <input name="amount" type="number" min="0" placeholder="Amount in rupees" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <input
              name="eventDate"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <input name="guestCount" type="number" min="1" placeholder="Guest count" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <input name="validUntil" type="date" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Proposal Content</span>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating || !lead}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-60"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {isGenerating ? 'Generating...' : 'Generate with AI'}
              </button>
            </div>
            <textarea
              name="content"
              required
              rows={10}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              value="draft"
              disabled={isSubmitting}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
            >
              Save Draft
            </button>
            <button
              type="submit"
              value="send"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              Send Now
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  )
}
