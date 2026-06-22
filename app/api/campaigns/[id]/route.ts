import { NextRequest, NextResponse } from 'next/server'

import { canManage, requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { campaignUpdateSchema } from '@/lib/validations/campaign'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  const { id } = await params
  const campaign = await prisma.campaign.findFirst({
    where: {
      id,
      propertyId: session.user.propertyId,
    },
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  return NextResponse.json({ campaign })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  if (!canManage(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = campaignUpdateSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { id } = await params
  const existingCampaign = await prisma.campaign.findFirst({
    where: {
      id,
      propertyId: session.user.propertyId,
    },
  })

  if (!existingCampaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const campaign = await prisma.campaign.update({
    where: { id },
    data: parsed.data,
  })

  return NextResponse.json({ campaign })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  if (!canManage(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const existingCampaign = await prisma.campaign.findFirst({
    where: {
      id,
      propertyId: session.user.propertyId,
    },
  })

  if (!existingCampaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  await prisma.campaign.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
