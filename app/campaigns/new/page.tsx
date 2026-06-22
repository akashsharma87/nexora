'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { ArrowLeft, Save, TrendingUp } from 'lucide-react'

import { DashboardLayout } from '@/components/dashboard-layout'
import { eventTypeLabels, formatCurrency } from '@/lib/format'

const CAMPAIGN_BUDGETS: Record<string, number> = {
  SOCIAL_EVENTS: 80000,
  CORPORATE_EVENTS: 70000,
  BIRTHDAY_SOCIAL: 20000,
  PROMOTIONAL_EVENTS: 15000,
  ENTERTAINMENT_EVENTS: 10000,
  SEASONAL_THEMATIC: 5000,
}

const CAMPAIGN_AUDIENCE: Record<string, string> = {
  SOCIAL_EVENTS: 'Age 24–56, 30 km radius, HNI, newly engaged',
  CORPORATE_EVENTS: 'Age 22–65, 200+ employee companies, CEO/Director/HR',
  BIRTHDAY_SOCIAL: 'Age 20–54, family decision-makers',
  PROMOTIONAL_EVENTS: 'Age 20–54, arts and media professionals',
  ENTERTAINMENT_EVENTS: 'Age 20–54, music and live events interests',
  SEASONAL_THEMATIC: 'Age 20–54, frequent travellers',
}

const CAMPAIGN_CPL: Record<string, { meta: string; google: string; conversion: string }> = {
  SOCIAL_EVENTS: { meta: '₹150–₹450', google: '₹200–₹600', conversion: '28–40%' },
  CORPORATE_EVENTS: { meta: '₹300–₹700', google: '₹300–₹700', conversion: '40–65%' },
  BIRTHDAY_SOCIAL: { meta: '₹80–₹200', google: '₹120–₹300', conversion: '25–35%' },
  PROMOTIONAL_EVENTS: { meta: '—', google: '—', conversion: '—' },
  ENTERTAINMENT_EVENTS: { meta: '₹100–₹300', google: '₹150–₹400', conversion: '22–35%' },
  SEASONAL_THEMATIC: { meta: '₹200–₹500', google: '₹250–₹600', conversion: '32–45%' },
}

const PLATFORMS = ['META', 'GOOGLE', 'INSTAGRAM', 'LINKEDIN', 'EMAIL', 'WHATSAPP']

const eventTypes = Object.keys(eventTypeLabels)

export default function NewCampaignPage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedType, setSelectedType] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['META', 'GOOGLE'])
  const [budget, setBudget] = useState('')

  function handleTypeChange(type: string) {
    setSelectedType(type)
    setBudget(CAMPAIGN_BUDGETS[type]?.toString() || '')
  }

  function togglePlatform(platform: string) {
    setSelectedPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedType) { toast.error('Please select a campaign type'); return }
    if (selectedPlatforms.length === 0) { toast.error('Select at least one platform'); return }

    setIsSubmitting(true)
    const form = new FormData(event.currentTarget)

    const payload = {
      name: form.get('name'),
      type: selectedType,
      platforms: selectedPlatforms,
      budgetAmount: Number(budget) || 0,
      startDate: form.get('startDate'),
      endDate: form.get('endDate') || null,
      keywords: (form.get('keywords') as string || '')
        .split(',').map((k) => k.trim()).filter(Boolean),
      targetAudience: {
        description: form.get('audienceNotes') || CAMPAIGN_AUDIENCE[selectedType] || '',
      },
      notes: form.get('notes') || null,
      status: 'ACTIVE',
    }

    try {
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) throw new Error('Failed to create campaign')
      const { campaign } = await response.json()
      toast.success('Campaign created')
      router.push(`/campaigns/${campaign.id}`)
    } catch {
      toast.error('Failed to create campaign')
      setIsSubmitting(false)
    }
  }

  const benchmark = selectedType ? CAMPAIGN_CPL[selectedType] : null

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/campaigns" className="text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Create Campaign</h1>
            <p className="text-zinc-400 text-sm mt-0.5">Set up a new demand-generation campaign</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Campaign Name */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wide">Campaign Details</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Campaign Name *</label>
                <input
                  name="name"
                  required
                  placeholder="e.g. Wedding Season Meta 2026"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Campaign Type *</label>
                <select
                  value={selectedType}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="">Select type...</option>
                  {eventTypes.map((t) => (
                    <option key={t} value={t}>{eventTypeLabels[t]}</option>
                  ))}
                </select>
              </div>

              {/* Benchmark hint */}
              {benchmark && (
                <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-3 flex items-start gap-2">
                  <TrendingUp className="h-4 w-4 text-violet-400 mt-0.5 shrink-0" />
                  <div className="text-xs text-violet-300 space-y-0.5">
                    <p><span className="text-zinc-400">Meta CPL benchmark:</span> {benchmark.meta}</p>
                    <p><span className="text-zinc-400">Google CPL benchmark:</span> {benchmark.google}</p>
                    <p><span className="text-zinc-400">Booking conversion target:</span> {benchmark.conversion}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Platforms */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wide">Platforms</h2>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePlatform(p)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    selectedPlatforms.includes(p)
                      ? 'bg-violet-500/20 border-violet-500 text-violet-300'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Budget & Dates */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wide">Budget & Schedule</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm text-zinc-400 mb-1.5">Monthly Budget (₹) *</label>
                <input
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  required
                  min={0}
                  placeholder="80000"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                />
                {selectedType && CAMPAIGN_BUDGETS[selectedType] && (
                  <p className="text-xs text-zinc-500 mt-1">
                    Benchmark: {formatCurrency(CAMPAIGN_BUDGETS[selectedType])} / month
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Start Date *</label>
                <input
                  type="date"
                  name="startDate"
                  required
                  defaultValue={new Date().toISOString().split('T')[0]}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">End Date</label>
                <input
                  type="date"
                  name="endDate"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>
          </div>

          {/* Targeting */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wide">Targeting</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Keywords (comma-separated)</label>
                <input
                  name="keywords"
                  placeholder="wedding venue Mumbai, banquet hall, marriage hall"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Target Audience Notes</label>
                <textarea
                  name="audienceNotes"
                  rows={2}
                  defaultValue={selectedType ? CAMPAIGN_AUDIENCE[selectedType] : ''}
                  placeholder="Describe your target audience..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Notes</label>
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="Any additional campaign notes..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 resize-none"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Link
              href="/campaigns"
              className="flex-1 py-2.5 rounded-lg border border-zinc-700 text-zinc-300 text-center text-sm hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? (
                <><span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating...</>
              ) : (
                <><Save className="h-4 w-4" />Create Campaign</>
              )}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  )
}
