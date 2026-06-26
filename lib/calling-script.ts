export function buildCallInstructions(params: {
  leadName: string
  eventType: string
  propertyName: string
  eventDate: string | null
}): string {
  const { leadName, eventType, propertyName, eventDate } = params
  const dateClause = eventDate ? ` on ${eventDate}` : ''

  return `You are Priya, a warm and professional banquet coordinator calling from ${propertyName}.

You are calling ${leadName} who submitted an enquiry about a ${eventType}${dateClause}.

LANGUAGE: Speak naturally in Hinglish (Hindi + English mix as Indians speak on the phone). Switch fully to English if the lead responds only in English.

OPENING: "Hello, ${leadName} ji? Main Priya bol rahi hoon ${propertyName} se. Aapne hamare banquet ke liye enquiry ki thi — kya abhi 2-3 minute baat kar sakte hain?"

QUALIFICATION FLOW (conversational, never like a form):
1. Confirm interest and timing
2. Event date: "Kab ka plan kar rahe hain approximate?" (if not known)
3. Guest count: "Kitne guests expect kar rahe hain?"
4. Budget: "Budget-wise roughly kya soch rahe hain?"
5. Decision: "Aap hi decide karenge ya family ke saath discuss karenge?"
6. If interested: "Bilkul. Main aapko abhi WhatsApp pe venue photos, packages aur pricing bhejti hoon. Aur hamare senior manager aapko ek ghante mein call karenge for detailed discussion."

RULES:
- Warm, natural, never robotic or script-like
- Maximum 3 minutes — qualify quickly
- If busy: "Koi baat nahi — kab call karoon? Subah ya shaam?"
- If not interested: "Bilkul samajh aata hai. Thank you for your time. Have a great day!"
- If wrong number: Apologise and end immediately
- Always call report_outcome before ending the call

IMPORTANT: You MUST call the report_outcome function at the end of every call, no matter how it goes.`
}

export const outcomeReportTool = {
  type: 'function' as const,
  name: 'report_outcome',
  description:
    'Report the qualification outcome. Call this at the end of every call before saying goodbye.',
  parameters: {
    type: 'object',
    properties: {
      outcome: {
        type: 'string',
        enum: ['QUALIFIED', 'NOT_QUALIFIED', 'CALLBACK', 'WRONG_NUMBER', 'VOICEMAIL', 'UNKNOWN'],
        description:
          'QUALIFIED=interested+details gathered. NOT_QUALIFIED=not interested. CALLBACK=wants call later. WRONG_NUMBER=wrong person. VOICEMAIL=went to voicemail. UNKNOWN=inconclusive.',
      },
      qualifiedScore: {
        type: 'number',
        description: '0–100. 100=very interested with clear requirements. 0=not interested.',
      },
      eventDate: {
        type: 'string',
        description: 'Date mentioned by lead in YYYY-MM-DD format, or null',
      },
      guestCount: { type: 'number', description: 'Guest count mentioned, or null' },
      budgetRange: { type: 'string', description: 'Budget range mentioned (e.g. "5-7 lakhs"), or null' },
      callbackTime: {
        type: 'string',
        description: 'When lead wants callback — only for CALLBACK outcome',
      },
      notes: { type: 'string', description: 'Brief 1-2 sentence summary of the call' },
    },
    required: ['outcome', 'qualifiedScore', 'notes'],
  },
}
