import { google } from 'googleapis'

function getAuth() {
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

export function extractSheetId(input: string): string {
  // Accept full URL or raw ID
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : input.trim()
}

export async function getSheetHeaders(
  sheetId: string,
  tabName: string = 'Sheet1',
  headerRow: number = 1
): Promise<{ headers: string[]; sampleRows: string[][] }> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const range = `'${tabName}'!A${headerRow}:Z${headerRow + 3}`

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  })

  const rows = response.data.values || []
  const headers = (rows[0] || []).map(String)
  const sampleRows = rows.slice(1).map((r) => r.map(String))
  return { headers, sampleRows }
}

export async function getAllRows(
  sheetId: string,
  tabName: string = 'Sheet1',
  headerRow: number = 1
): Promise<{ headers: string[]; rows: Record<string, string>[]; rawRows: string[][] }> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const range = `'${tabName}'!A${headerRow}:Z`

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  })

  const allRows = response.data.values || []
  if (allRows.length === 0) return { headers: [], rows: [], rawRows: [] }

  const headers = allRows[0].map(String)
  const rawRows = allRows.slice(1).filter((r) => r.some((c) => c?.toString().trim()))

  const rows = rawRows.map((row) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = (row[i] || '').toString().trim() })
    return obj
  })

  return { headers, rows, rawRows }
}

export function mapRowToLead(
  row: Record<string, string>,
  columnMap: Record<string, string>
): Partial<{
  name: string
  phone: string
  email: string
  eventType: string
  eventDate: string
  guestCount: number
  budgetMin: number
  budgetMax: number
  notes: string
}> {
  const get = (field: string) =>
    columnMap[field] ? (row[columnMap[field]] || '').trim() : ''

  return {
    name: get('name') || undefined,
    phone: get('phone') || undefined,
    email: get('email') || undefined,
    eventType: normalizeEventType(get('eventType')),
    eventDate: get('eventDate') || undefined,
    guestCount: parseInt(get('guestCount')) || undefined,
    budgetMin: parseFloat(get('budgetMin')) || undefined,
    budgetMax: parseFloat(get('budgetMax')) || undefined,
    notes: get('notes') || undefined,
  }
}

function normalizeEventType(raw: string): string {
  if (!raw) return 'SOCIAL_EVENTS'
  const l = raw.toLowerCase()
  if (l.includes('wedding') || l.includes('roka') || l.includes('social')) return 'SOCIAL_EVENTS'
  if (l.includes('corporate') || l.includes('conference') || l.includes('meeting') || l.includes('board')) return 'CORPORATE_EVENTS'
  if (l.includes('birthday')) return 'BIRTHDAY_SOCIAL'
  if (l.includes('promo') || l.includes('fashion') || l.includes('exhibition')) return 'PROMOTIONAL_EVENTS'
  if (l.includes('music') || l.includes('comedy') || l.includes('entertainment')) return 'ENTERTAINMENT_EVENTS'
  if (l.includes('season') || l.includes('diwali') || l.includes('christmas') || l.includes('new year')) return 'SEASONAL_THEMATIC'
  return 'SOCIAL_EVENTS'
}

export function generateRowHash(row: string[]): string {
  return Buffer.from(row.join('|')).toString('base64').slice(0, 32)
}

// Try to auto-detect column mappings from header names
export function autoDetectColumnMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {}
  const matchers: Record<string, string[]> = {
    name: ['name', 'full name', 'client name', 'lead name', 'contact'],
    phone: ['phone', 'mobile', 'contact no', 'phone number', 'mobile number', 'whatsapp'],
    email: ['email', 'email id', 'email address', 'e-mail'],
    eventType: ['event type', 'event', 'type', 'occasion', 'function'],
    eventDate: ['event date', 'date', 'wedding date', 'function date', 'event on'],
    guestCount: ['guests', 'pax', 'guest count', 'number of guests', 'headcount', 'no of guests'],
    budgetMin: ['budget min', 'min budget', 'budget from', 'budget (min)'],
    budgetMax: ['budget max', 'max budget', 'budget', 'budget (lakhs)', 'budget (max)'],
    notes: ['notes', 'remarks', 'comments', 'message', 'requirements', 'details'],
  }

  for (const [field, keywords] of Object.entries(matchers)) {
    for (const header of headers) {
      if (keywords.some((k) => header.toLowerCase().includes(k))) {
        map[field] = header
        break
      }
    }
  }
  return map
}
