import { NextRequest, NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { syncIntegrationConnection } from '@/lib/sheet-sync'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  const { id } = await params
  const connection = await prisma.integrationConnection.findFirst({
    where: { id, propertyId: session.user.propertyId },
  })
  if (!connection) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const result = await syncIntegrationConnection(connection, session.user.id)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed'
    return NextResponse.json({ error: message }, { status: message === 'No sheet ID configured' ? 400 : 500 })
  }
}
