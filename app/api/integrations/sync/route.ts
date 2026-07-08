import { NextRequest, NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { syncIntegrationConnection } from '@/lib/sheet-sync'

// Top-level sync endpoint — accepts connectionId in the body.
// Avoids Turbopack nested-route discovery issues in dev.
export async function POST(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  const { connectionId } = await request.json()
  if (!connectionId) {
    return NextResponse.json({ error: 'connectionId is required' }, { status: 400 })
  }

  const connection = await prisma.integrationConnection.findFirst({
    where: { id: connectionId, propertyId: session.user.propertyId },
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
