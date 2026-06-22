// Wati WhatsApp Business API client — https://docs.wati.io/reference/
// Auth via Bearer token. Base URL configured via WATI_API_URL env var.
// Env vars required: WATI_API_KEY, WATI_API_URL

export interface WatiTemplateParameter {
  name: string
  value: string
}

function isConfigured(): boolean {
  return !!(process.env.WATI_API_KEY && process.env.WATI_API_URL)
}

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.WATI_API_KEY}`,
  }
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `91${digits}`
  return digits
}

// Send a WhatsApp template message (requires pre-approved Wati template)
export async function sendTemplateMessage(
  phone: string,
  templateName: string,
  parameters: WatiTemplateParameter[],
  broadcastName?: string
): Promise<{ success: boolean; error?: string }> {
  if (!isConfigured()) {
    console.log(`[WATI STUB] Template: ${templateName} → ${phone}`, parameters)
    return { success: true }
  }

  const normalizedPhone = normalizePhone(phone)
  const url = `${process.env.WATI_API_URL}/api/v1/sendtemplatemessage?whatsappNumber=${normalizedPhone}`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        template_name: templateName,
        broadcast_name: broadcastName || `nexora_${Date.now()}`,
        parameters,
      }),
    })

    const responseText = await response.text()
    if (!response.ok) {
      console.error(`[WATI ERROR] ${response.status} on POST ${url} → ${responseText}`)
      return { success: false, error: responseText }
    }

    console.log(`[WATI OK] Template sent to ${normalizedPhone}: ${responseText}`)
    return { success: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[WATI ERROR] ${error}`)
    return { success: false, error }
  }
}

// Send a free-form text message (works within 24-hr customer service window)
export async function sendSessionMessage(
  phone: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  if (!isConfigured()) {
    console.log(`[WATI STUB] Session → ${phone}: ${message.slice(0, 80)}`)
    return { success: true }
  }

  const normalizedPhone = normalizePhone(phone)
  const url = `${process.env.WATI_API_URL}/api/v1/sendsessionmessage/${normalizedPhone}`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ messageText: message }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error(`[WATI ERROR] Session send failed: ${error}`)
      return { success: false, error }
    }

    return { success: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[WATI ERROR] ${error}`)
    return { success: false, error }
  }
}

// Register a contact in Wati before sending the first message
export async function addWatiContact(
  phone: string,
  name: string,
  customParams?: WatiTemplateParameter[]
): Promise<void> {
  if (!isConfigured()) return

  const normalizedPhone = normalizePhone(phone)
  const url = `${process.env.WATI_API_URL}/api/v1/addcontact/${normalizedPhone}`

  await fetch(url, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      name,
      customParams: customParams || [],
    }),
  }).catch(() => {})
}

// Template names — must match approved templates in your Wati account
// Wati dashboard → Templates → Approved templates
export const WATI_TEMPLATES = {
  INITIAL_RESPONSE: 'nexora_initial_response',
  NURTURE_DAY3: 'nexora_nurture_day3',
  NURTURE_DAY5: 'nexora_nurture_day5',
  NURTURE_DAY7: 'nexora_nurture_day7',
  PROPOSAL_FOLLOWUP: 'nexora_proposal_followup',
  POST_EVENT_DAY3: 'nexora_post_event_day3',
  POST_EVENT_DAY30: 'nexora_post_event_day30',
  POST_EVENT_DAY90: 'nexora_post_event_day90',
  BROADCAST: 'nexora_broadcast_general',
} as const

export function buildTemplateParams(context: {
  leadName: string
  eventType?: string
  eventDate?: string
  propertyName?: string
  managerName?: string
  offerText?: string
}): WatiTemplateParameter[] {
  const params: WatiTemplateParameter[] = [
    { name: 'name', value: context.leadName },
    { name: 'hotel_name', value: context.propertyName || 'our venue' },
    { name: 'manager_name', value: context.managerName || 'our team' },
  ]
  if (context.eventType) params.push({ name: 'event_type', value: context.eventType })
  if (context.eventDate) params.push({ name: 'event_date', value: context.eventDate })
  if (context.offerText) params.push({ name: 'offer', value: context.offerText })
  return params
}
