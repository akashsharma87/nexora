import OpenAI from 'openai'

let _client: OpenAI | null = null

function getClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _client
}

export async function generateProposalContent(params: {
  leadName: string
  eventType: string
  guestCount: number
  eventDate: string
  budgetRange: string
  propertyName: string
  notes?: string
}): Promise<string> {
  const client = getClient()

  if (!client) return getProposalFallback(params)

  const prompt = `You are a professional hotel banquet sales manager writing a formal event proposal for an Indian luxury hotel. Write a complete, personalized proposal for:

Client: ${params.leadName}
Event: ${params.eventType}
Guests: ${params.guestCount}
Date: ${params.eventDate}
Budget: ${params.budgetRange}
Venue: ${params.propertyName}
Notes: ${params.notes || 'None'}

Include: warm greeting, event summary, venue highlights for this event type, package inclusions (catering, décor, AV, parking), why this venue is right for them, and a call to action.
Keep it under 500 words. Use Indian hospitality tone. No pricing — that is added separately.`

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 700,
      temperature: 0.7,
    })
    return response.choices[0]?.message?.content || getProposalFallback(params)
  } catch {
    return getProposalFallback(params)
  }
}

function getProposalFallback(params: {
  leadName: string
  eventType: string
  guestCount: number
  eventDate: string
  propertyName: string
}): string {
  return `Dear ${params.leadName},

Thank you for considering ${params.propertyName} for your ${params.eventType}. We are delighted at the opportunity to host your special occasion on ${params.eventDate}.

Our banquet facilities are designed to accommodate ${params.guestCount} guests in an elegant setting, offering comprehensive packages including premium catering, customised décor, state-of-the-art audio-visual equipment, dedicated event coordination, and valet parking.

Our experienced banquet team will work closely with you to ensure every detail of your ${params.eventType} is executed to perfection. From initial planning to the final celebration, we are committed to making your event truly memorable.

We would be honoured to host your event and look forward to presenting our complete package options in detail.

Warm regards,
The Banquet Team
${params.propertyName}`
}

export async function generateSmartInsights(data: {
  totalLeads: number
  newLeads: number
  conversionRate: number
  avgResponseTime: number
  topSource: string
  overdueLeads: number
}): Promise<string[]> {
  const client = getClient()
  if (!client) return getRuleBasedInsights(data)

  const prompt = `You are a hotel revenue consultant. Provide 3 specific, actionable one-sentence insights for this banquet sales data. Return as JSON: {"insights": ["...", "...", "..."]}

Total Leads: ${data.totalLeads}
New This Period: ${data.newLeads}
Conversion Rate: ${data.conversionRate}%
Avg First Response: ${data.avgResponseTime} hours
Top Source: ${data.topSource}
Overdue Follow-ups: ${data.overdueLeads}`

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      response_format: { type: 'json_object' },
    })
    const parsed = JSON.parse(response.choices[0]?.message?.content || '{}')
    const insights = parsed.insights || parsed
    if (Array.isArray(insights) && insights.length > 0) return insights.slice(0, 3)
    return getRuleBasedInsights(data)
  } catch {
    return getRuleBasedInsights(data)
  }
}

function getRuleBasedInsights(data: {
  avgResponseTime: number
  overdueLeads: number
  conversionRate: number
  topSource: string
}): string[] {
  const insights: string[] = []
  if (data.avgResponseTime > 1) {
    insights.push(`Response time is ${data.avgResponseTime.toFixed(1)}h — the 90-second target can lift conversions by up to 40%.`)
  }
  if (data.overdueLeads > 0) {
    insights.push(`${data.overdueLeads} leads are overdue — contact them today before they go to a competitor.`)
  }
  if (data.conversionRate < 15) {
    insights.push(`Conversion at ${data.conversionRate}% is below the 28% benchmark — review proposal turnaround and negotiation velocity.`)
  }
  if (insights.length < 3) {
    insights.push(`${data.topSource} is your top channel — increasing budget here will compound lead volume fastest.`)
  }
  return insights.slice(0, 3)
}
