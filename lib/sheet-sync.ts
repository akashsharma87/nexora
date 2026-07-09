import { prisma } from '@/lib/db'
import {
  getAllRows,
  getAvailableTabs,
  mapRowToLead,
  mapRowToLeadSmart,
  autoDetectColumnMap,
  generateRowHash,
  isEmptyTab,
  isPlaceholderRow,
} from '@/lib/google-sheets'
import { scheduleLeadNurtureSequence, scheduleAiCall } from '@/lib/automation'
import { eventTypeLabels } from '@/lib/format'
import type { IntegrationConnection } from '@prisma/client'

type SyncResults = { created: number; skipped: number; failed: number; errors: string[] }
type TabSummary = {
  tab: string
  created: number
  skipped: number
  failed: number
  rowsSeen: number
  detectedFields?: string[]
  warning?: string
}

async function syncTab(
  connection: IntegrationConnection,
  tabName: string,
  // Existing single-tab connections already have rows stored as `${connectionId}_row_N` —
  // keep that id format there so re-syncing doesn't duplicate every lead. Multi-tab mode
  // namespaces the id with the tab name since one connection now spans several tabs.
  externalIdPrefix: string,
  smart: boolean,
  userId: string,
  property: { name: string } | null,
  managerName: string,
  results: SyncResults
): Promise<TabSummary> {
  const { headers, rows, rawRows } = await getAllRows(connection.sheetId!, tabName, connection.headerRow || 1)
  const summary: TabSummary = { tab: tabName, created: 0, skipped: 0, failed: 0, rowsSeen: rows.length }

  if (isEmptyTab(headers)) {
    summary.warning = 'Empty tab — skipped'
    return summary
  }

  // Smart mode (all-tabs sync) auto-detects columns from this tab's own header row instead of
  // relying on one shared manual mapping — campaign tabs rarely share identical columns (see
  // SHEET_SYNC_PHASE1_PLAN.md). Computed once per tab, not per row.
  const columnMap = smart ? autoDetectColumnMap(headers) : (connection.columnMap as Record<string, string>)
  if (smart) {
    summary.detectedFields = Object.keys(columnMap)
    if (!columnMap.phone || !columnMap.name) {
      summary.warning = 'No name/phone column detected in this tab — leads were not imported'
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rawRow = rawRows[i] || []
    const externalId = `${externalIdPrefix}_row_${i + 2}` // +2 because row 1 is header
    const rowHash = generateRowHash(rawRow)

    try {
      const existing = await prisma.leadExternalSource.findUnique({
        where: { provider_externalId: { provider: connection.provider, externalId } },
      })
      if (existing) { results.skipped++; summary.skipped++; continue }

      const mapped = smart
        ? mapRowToLeadSmart(row, headers, columnMap, tabName)
        : mapRowToLead(row, columnMap)

      if (!mapped.name || !mapped.phone || isPlaceholderRow(mapped)) {
        results.skipped++
        summary.skipped++
        continue
      }

      const byPhone = await prisma.lead.findFirst({
        where: { propertyId: connection.propertyId, phone: { contains: mapped.phone.replace(/\D/g, '').slice(-10) } },
      })
      if (byPhone) {
        await prisma.leadExternalSource.create({
          data: {
            leadId: byPhone.id,
            connectionId: connection.id,
            provider: connection.provider,
            externalId,
            sourceTab: tabName,
            rowHash,
            rawPayload: row,
          },
        })
        results.skipped++
        summary.skipped++
        continue
      }

      const lead = await prisma.lead.create({
        data: {
          propertyId: connection.propertyId,
          name: mapped.name,
          phone: mapped.phone,
          email: mapped.email || null,
          eventType: (mapped.eventType as any) || 'SOCIAL_EVENTS',
          eventDate: mapped.eventDate ? new Date(mapped.eventDate) : null,
          guestCount: mapped.guestCount || null,
          budgetMin: mapped.budgetMin || null,
          budgetMax: mapped.budgetMax || null,
          source: connection.source,
          sourceTab: tabName || null,
          notes: mapped.notes || null,
          leadScore: 50,
          activities: {
            create: {
              userId,
              type: 'LEAD_CREATED',
              content: `Lead imported from ${connection.name} (${connection.provider.replaceAll('_', ' ')}${tabName ? `, tab "${tabName}"` : ''})`,
            },
          },
        },
      })

      await prisma.leadExternalSource.create({
        data: {
          leadId: lead.id,
          connectionId: connection.id,
          provider: connection.provider,
          externalId,
          sourceTab: tabName,
          rowHash,
          rawPayload: row,
        },
      })

      await scheduleLeadNurtureSequence({
        leadId: lead.id,
        propertyId: lead.propertyId,
        phone: lead.phone,
        leadName: lead.name,
        eventType: eventTypeLabels[lead.eventType] || lead.eventType,
        eventDate: lead.eventDate ? lead.eventDate.toISOString().split('T')[0] : null,
        propertyName: property?.name || 'our venue',
        managerName,
        sourceTab: lead.sourceTab,
      })
      await scheduleAiCall({ leadId: lead.id, propertyId: lead.propertyId })

      results.created++
      summary.created++
    } catch (err) {
      results.failed++
      summary.failed++
      results.errors.push(`${tabName ? `Tab "${tabName}", ` : ''}Row ${i + 2}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  return summary
}

// Single source of truth for running a sheet sync — both `/api/integrations/sync` (used by the
// settings UI) and `/api/integrations/[id]/sync` call this instead of keeping two copies of the
// same logic, which is exactly how a previous change fixed one route and silently missed the
// other (all-tabs connections hit the un-updated route's `tabName || 'Sheet1'` fallback and
// failed with "Unable to parse range: 'Sheet1'!A1:ZZ" since no such tab exists).
export async function syncIntegrationConnection(connection: IntegrationConnection, userId: string) {
  if (!connection.sheetId) {
    throw new Error('No sheet ID configured')
  }

  const results: SyncResults = { created: 0, skipped: 0, failed: 0, errors: [] }
  const tabSummaries: TabSummary[] = []

  try {
    const property = await prisma.property.findUnique({ where: { id: connection.propertyId } })
    const manager = await prisma.user.findFirst({
      where: { properties: { some: { propertyId: connection.propertyId } }, role: { in: ['OWNER', 'MANAGER'] } },
    })
    const managerName = manager?.name || 'our team'

    // null tabName = "sync every tab in this sheet" (one sheet per source, tabs are campaigns)
    if (!connection.tabName) {
      const tabs = await getAvailableTabs(connection.sheetId)
      for (const tab of tabs) {
        const summary = await syncTab(connection, tab, `${connection.id}_${tab}`, true, userId, property, managerName, results)
        tabSummaries.push(summary)
      }
    } else {
      const summary = await syncTab(connection, connection.tabName, connection.id, false, userId, property, managerName, results)
      tabSummaries.push(summary)
    }

    await prisma.integrationConnection.update({
      where: { id: connection.id },
      data: {
        lastSyncedAt: new Date(),
        lastSyncCount: results.created,
        lastSyncStatus: results.failed > 0 ? 'partial' : 'ok',
        lastSyncError: results.errors.length > 0 ? results.errors.slice(0, 3).join('; ') : null,
        status: 'ACTIVE',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed'
    await prisma.integrationConnection.update({
      where: { id: connection.id },
      data: { status: 'ERROR', lastSyncError: message },
    })
    throw err
  }

  return { ...results, tabs: tabSummaries }
}
