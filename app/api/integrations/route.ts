import { NextRequest, NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { extractSheetId } from '@/lib/google-sheets'

export async function GET(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  const connections = await prisma.integrationConnection.findMany({
    where: { propertyId: session.user.propertyId },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ connections })
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  const body = await request.json()
  const { name, provider, source, sheetId, tabName, headerRow, columnMap } = body

  if (!name || !provider || !source || !columnMap) {
    return NextResponse.json({ error: 'name, provider, source, and columnMap are required' }, { status: 400 })
  }

  const cleanSheetId = sheetId ? extractSheetId(sheetId) : null

  const connection = await prisma.integrationConnection.create({
    data: {
      organizationId: session.user.organizationId,
      propertyId: session.user.propertyId,
      provider,
      name,
      source,
      sheetId: cleanSheetId,
      tabName: tabName || 'Sheet1',
      headerRow: headerRow || 1,
      columnMap,
      status: 'ACTIVE',
    },
  })

  return NextResponse.json({ connection }, { status: 201 })
}
