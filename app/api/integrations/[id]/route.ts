import { NextRequest, NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { extractSheetId } from '@/lib/google-sheets'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  const { id } = await params
  const connection = await prisma.integrationConnection.findFirst({
    where: { id, propertyId: session.user.propertyId },
  })
  if (!connection) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ connection })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  const { id } = await params
  const body = await request.json()

  const connection = await prisma.integrationConnection.findFirst({
    where: { id, propertyId: session.user.propertyId },
  })
  if (!connection) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (body.sheetId) body.sheetId = extractSheetId(body.sheetId)

  const updated = await prisma.integrationConnection.update({
    where: { id },
    data: body,
  })
  return NextResponse.json({ connection: updated })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  const { id } = await params
  const connection = await prisma.integrationConnection.findFirst({
    where: { id, propertyId: session.user.propertyId },
  })
  if (!connection) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.integrationConnection.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
