import { NextRequest, NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { getAllRows, getAvailableTabs, mapRowToLead, generateRowHash } from '@/lib/google-sheets'
import { scheduleLeadNurtureSequence, scheduleAiCall } from '@/lib/automation'
import { eventTypeLabels } from '@/lib/format'
import type { IntegrationConnection } from '@prisma/client'

type SyncResults = { created: number; skipped: number; failed: number; errors: string[] }

async function syncTab(
  connection: IntegrationConnection,
  tabName: string,
  // Existing single-tab connections already have rows stored as `${connectionId}_row_N` —
  // keep that id format there so re-syncing doesn't duplicate every lead. Multi-tab mode
  // namespaces the id with the tab name since one connection now spans several tabs.
  externalIdPrefix: string,
  userId: string,
  property: { name: string } | null,
  managerName: string,
  results: SyncResults
) {
  const { rows, rawRows } = await getAllRows(connection.sheetId!, tabName, connection.headerRow || 1)
  const columnMap = connection.columnMap as Record<string, string>

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rawRow = rawRows[i] || []
    const externalId = `${externalIdPrefix}_row_${i + 2}` // +2 because row 1 is header
    const rowHash = generateRowHash(rawRow)

    try {
      const existing = await prisma.leadExternalSource.findUnique({
        where: { provider_externalId: { provider: connection.provider, externalId } },
      })
      if (existing) { results.skipped++; continue }

      const mapped = mapRowToLead(row, columnMap)
      if (!mapped.name || !mapped.phone) { results.skipped++; continue }

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
        phone: lead.phone,
        leadName: lead.name,
        eventType: eventTypeLabels[lead.eventType] || lead.eventType,
        eventDate: lead.eventDate ? lead.eventDate.toISOString().split('T')[0] : null,
        propertyName: property?.name || 'our venue',
        managerName,
      })
      await scheduleAiCall({ leadId: lead.id, propertyId: lead.propertyId })

      results.created++
    } catch (err) {
      results.failed++
      results.errors.push(`${tabName ? `Tab "${tabName}", ` : ''}Row ${i + 2}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  const { id } = await params
  const connection = await prisma.integrationConnection.findFirst({
    where: { id, propertyId: session.user.propertyId },
  })
  if (!connection) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!connection.sheetId) {
    return NextResponse.json({ error: 'No sheet ID configured' }, { status: 400 })
  }

  const results: SyncResults = { created: 0, skipped: 0, failed: 0, errors: [] }

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
        await syncTab(connection, tab, `${connection.id}_${tab}`, session.user.id, property, managerName, results)
      }
    } else {
      await syncTab(connection, connection.tabName, connection.id, session.user.id, property, managerName, results)
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
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json(results)
}
