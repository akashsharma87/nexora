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
  const key = process.env.WATI_API_KEY || ''
  const token = key.startsWith('Bearer ') ? key : `Bearer ${key}`
  return {
    'Content-Type': 'application/json',
    Authorization: token,
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
  // WATI_API_URL includes tenant ID: https://live-mt-server.wati.io/102339
  // v2 returns richer error info; falls back to v1
  const urlV2 = `${process.env.WATI_API_URL}/api/v2/sendTemplateMessage?whatsappNumber=${normalizedPhone}`
  const urlV1 = `${process.env.WATI_API_URL}/api/v1/sendTemplateMessage?whatsappNumber=${normalizedPhone}`

  const body = JSON.stringify({
    template_name: templateName,
    broadcast_name: broadcastName || `nexora_${Date.now()}`,
    parameters,
  })

  console.log(`[WATI] Sending template "${templateName}" to ${normalizedPhone}`)

  try {
    const resV2 = await fetch(urlV2, { method: 'POST', headers: getHeaders(), body })
    const textV2 = await resV2.text()
    console.log(`[WATI v2] ${resV2.status} → ${textV2}`)

    if (resV2.ok) return { success: true }

    // v2 gave us a real JSON error — parse and surface it
    if (!textV2.startsWith('<')) {
      try {
        const json = JSON.parse(textV2)
        const msg = json.error || json.info || textV2
        return { success: false, error: msg }
      } catch {}
    }

    // Fall back to v1
    const resV1 = await fetch(urlV1, { method: 'POST', headers: getHeaders(), body })
    const textV1 = await resV1.text()
    console.log(`[WATI v1] ${resV1.status} → ${textV1}`)

    if (resV1.ok) return { success: true }
    try {
      const json = JSON.parse(textV1)
      return { success: false, error: json.info || json.error || textV1 }
    } catch {}
    return { success: false, error: textV1 }
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
  const url = `${process.env.WATI_API_URL}/api/v1/sendSessionMessage/${normalizedPhone}`

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
  const url = `${process.env.WATI_API_URL}/api/v1/addContact/${normalizedPhone}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name, customParams: customParams || [] }),
    })
    const text = await res.text()
    console.log(`[WATI addContact] ${res.status} → ${text}`)
  } catch (err) {
    console.warn(`[WATI addContact] failed:`, err)
  }
}

// Template names — must match approved templates in your Wati account exactly.
// Override any template via env vars (e.g. WATI_TEMPLATE_INITIAL_RESPONSE=my_template_name).
// Wati dashboard → Templates → Your templates
export const WATI_TEMPLATES = {
  INITIAL_RESPONSE: process.env.WATI_TEMPLATE_INITIAL_RESPONSE || 'nexora_initial_response',
  // Fired immediately after a successful AI call (QUALIFIED/CALLBACK) — the warm "Priya just
  // spoke with you" follow-up. Replaces the cold INITIAL_RESPONSE for leads that were called.
  POST_CALL: process.env.WATI_TEMPLATE_POST_CALL || 'nexora_post_call',
  NURTURE_DAY1: process.env.WATI_TEMPLATE_NURTURE_DAY1 || 'nexora_nurture_day1',
  NURTURE_DAY3: process.env.WATI_TEMPLATE_NURTURE_DAY3 || 'nexora_nurture_day3',
  NURTURE_DAY5: process.env.WATI_TEMPLATE_NURTURE_DAY5 || 'nexora_nurture_day5',
  NURTURE_DAY7: process.env.WATI_TEMPLATE_NURTURE_DAY7 || 'nexora_nurture_day7',
  PROPOSAL_FOLLOWUP: process.env.WATI_TEMPLATE_PROPOSAL_FOLLOWUP || 'nexora_proposal_followup',
  POST_EVENT_DAY3: process.env.WATI_TEMPLATE_POST_EVENT_DAY3 || 'nexora_post_event_day3',
  POST_EVENT_DAY30: process.env.WATI_TEMPLATE_POST_EVENT_DAY30 || 'nexora_post_event_day30',
  POST_EVENT_DAY90: process.env.WATI_TEMPLATE_POST_EVENT_DAY90 || 'nexora_post_event_day90',
  BROADCAST: process.env.WATI_TEMPLATE_BROADCAST || 'nexora_broadcast_general',
}

// --- Source-aware nurture helpers -----------------------------------------------------------
// One 4-variable template family ({{1}}=name, {{2}}=property, {{3}}=enquiry label, {{4}}=value
// hook) serves every campaign tab and both tracks — see WHATSAPP_NURTURE_TEMPLATE_PLAN.md.

export type NurtureTrack = 'EVENT' | 'STAY'

// Mirror calling-server/server.js's isRoomStayInquiry EXACTLY so a lead is branched the same way
// on WhatsApp as on the AI voice call. It's a separate Node service — the function can't be
// shared, so keep the keyword list identical by hand (suite / room / stay / accommodation).
export function isRoomStayInquiry(sourceTab?: string | null): boolean {
  if (!sourceTab) return false
  const l = sourceTab.toLowerCase()
  return l.includes('suite') || l.includes('room') || l.includes('stay') || l.includes('accommodation')
}

export function nurtureTrack(sourceTab?: string | null): NurtureTrack {
  return isRoomStayInquiry(sourceTab) ? 'STAY' : 'EVENT'
}

// Real sheet tabs are named for internal CRM tracking, not customer-facing copy — confirmed
// against the live Citadel sheet: "FNB Ipl Leads", "Polia Boishakh Leads", "MothersDay Lead" would
// otherwise put the literal word "Lead(s)" in a guest's WhatsApp message ("your FNB Ipl Leads
// enquiry"); "wedding ", "corporate ", "veg wedding ", "Sunday Brunch " have trailing spaces and
// inconsistent casing that read unprofessionally verbatim. Used both as the hard fallback label
// AND as the AI prompt's input, so a missing OPENAI_API_KEY still produces a clean customer-facing
// label.
export function cleanTabLabel(tabName: string): string {
  let s = tabName.trim().replace(/\s+/g, ' ')
  s = s.replace(/\s+leads?$/i, '')
  // Only Title Case tabs that are entirely lowercase ("wedding" -> "Wedding") — leave mixed-case
  // names alone so acronyms like "FNB"/"IPL" are never mangled into "Fnb"/"Ipl".
  if (s === s.toLowerCase()) {
    s = s.replace(/\b\w/g, (c) => c.toUpperCase())
  }
  return s
}

// {{4}} value hook — deterministic, binary per track (never needs an AI call).
export function buildNurtureHook(track: NurtureTrack): string {
  return track === 'STAY'
    ? 'room options, rates and availability'
    : 'packages, availability and venue details'
}

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
