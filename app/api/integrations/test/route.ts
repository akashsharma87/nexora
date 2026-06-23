import { NextRequest, NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { extractSheetId, getSheetHeaders, autoDetectColumnMap, getAvailableTabs } from '@/lib/google-sheets'

export async function POST(request: NextRequest) {
  const { error } = await requireSession()
  if (error) return error

  const body = await request.json()
  const { sheetId, tabName = 'Sheet1', headerRow = 1 } = body

  if (!sheetId) {
    return NextResponse.json({ error: 'sheetId is required' }, { status: 400 })
  }

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    return NextResponse.json({
      error: 'Google service account not configured. Add GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY to your environment variables.',
    }, { status: 400 })
  }

  try {
    const cleanSheetId = extractSheetId(sheetId)
    const { headers, sampleRows } = await getSheetHeaders(cleanSheetId, tabName, Number(headerRow))
    const suggestedMap = autoDetectColumnMap(headers)
    return NextResponse.json({ headers, sampleRows, suggestedMap })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read sheet'

    // "Unable to parse range" means the tab name doesn't exist — fetch actual tab names to help the user
    if (message.includes('Unable to parse range') || message.includes('parse range')) {
      try {
        const cleanSheetId = extractSheetId(sheetId)
        const availableTabs = await getAvailableTabs(cleanSheetId)
        return NextResponse.json({
          error: `Tab "${tabName}" not found in this spreadsheet.`,
          availableTabs,
        }, { status: 400 })
      } catch {
        // fall through to generic error
      }
    }

    return NextResponse.json({ error: message }, { status: 400 })
  }
}
