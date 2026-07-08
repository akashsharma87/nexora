import { NextRequest, NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import {
  extractSheetId,
  getSheetHeaders,
  autoDetectColumnMap,
  getAvailableTabs,
  isEmptyTab,
  normalizeEventType,
} from '@/lib/google-sheets'

export async function POST(request: NextRequest) {
  const { error } = await requireSession()
  if (error) return error

  const body = await request.json()
  const { sheetId, tabName = 'Sheet1', headerRow = 1, allTabs } = body

  if (!sheetId) {
    return NextResponse.json({ error: 'sheetId is required' }, { status: 400 })
  }

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    return NextResponse.json({
      error: 'Google service account not configured. Add GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY to your environment variables.',
    }, { status: 400 })
  }

  const cleanSheetId = extractSheetId(sheetId)

  // All-tabs preview: no manual mapping step — show what auto-detection finds per tab so the
  // user can eyeball it before saving, instead of mapping every campaign tab by hand.
  if (allTabs) {
    try {
      const tabs = await getAvailableTabs(cleanSheetId)
      const preview = await Promise.all(
        tabs.map(async (tab) => {
          try {
            const { headers, sampleRows } = await getSheetHeaders(cleanSheetId, tab, Number(headerRow))
            if (isEmptyTab(headers)) {
              return { tab, empty: true, headers: [], detectedFields: [], missingName: true, missingPhone: true, eventType: normalizeEventType(tab) }
            }
            const columnMap = autoDetectColumnMap(headers)
            return {
              tab,
              empty: false,
              headers,
              sampleRow: sampleRows[0] || [],
              detectedFields: Object.keys(columnMap),
              missingName: !columnMap.name,
              missingPhone: !columnMap.phone,
              eventType: normalizeEventType(tab),
            }
          } catch (err) {
            return {
              tab,
              empty: true,
              error: err instanceof Error ? err.message : 'Failed to read tab',
              headers: [],
              detectedFields: [],
              missingName: true,
              missingPhone: true,
              eventType: normalizeEventType(tab),
            }
          }
        })
      )
      return NextResponse.json({ mode: 'all-tabs', tabs: preview })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read sheet'
      return NextResponse.json({ error: message }, { status: 400 })
    }
  }

  try {
    const { headers, sampleRows } = await getSheetHeaders(cleanSheetId, tabName, Number(headerRow))
    const suggestedMap = autoDetectColumnMap(headers)
    return NextResponse.json({ headers, sampleRows, suggestedMap })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read sheet'

    // "Unable to parse range" means the tab name doesn't exist — fetch actual tab names to help the user
    if (message.includes('Unable to parse range') || message.includes('parse range')) {
      try {
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
