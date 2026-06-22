import { NextRequest, NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { getSheetHeaders, autoDetectColumnMap } from '@/lib/google-sheets'

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

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    return NextResponse.json({
      error: 'Google service account not configured. Add GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY to your environment variables.',
    }, { status: 400 })
  }

  try {
    const { headers, sampleRows } = await getSheetHeaders(
      connection.sheetId,
      connection.tabName || 'Sheet1',
      connection.headerRow || 1
    )

    const suggestedMap = autoDetectColumnMap(headers)

    return NextResponse.json({ headers, sampleRows, suggestedMap })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read sheet'
    await prisma.integrationConnection.update({
      where: { id },
      data: { status: 'ERROR', lastSyncError: message },
    })
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
