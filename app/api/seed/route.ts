import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const prisma = new PrismaClient()

  try {
    const existing = await prisma.organization.findUnique({ where: { slug: 'demo-hotel' } })
    if (existing) {
      return NextResponse.json({ message: 'Already seeded', skipped: true })
    }

    const org = await prisma.organization.create({
      data: { name: 'The Grand Banquets', slug: 'demo-hotel' },
    })

    const property = await prisma.property.create({
      data: {
        id: 'prop-demo-1',
        organizationId: org.id,
        name: 'The Grand Banquets — Delhi',
        address: '14, Banquet Lane',
        city: 'New Delhi',
        phone: '+91-11-4567-8901',
        email: 'events@grandbanquets.com',
      },
    })

    const passwordHash = await bcrypt.hash('Demo@1234', 10)

    const owner = await prisma.user.create({
      data: {
        organizationId: org.id,
        name: 'Arjun Sharma',
        email: 'owner@grandbanquets.com',
        password: passwordHash,
        role: 'OWNER',
      },
    })

    const manager = await prisma.user.create({
      data: {
        organizationId: org.id,
        name: 'Priya Kapoor',
        email: 'manager@grandbanquets.com',
        password: passwordHash,
        role: 'MANAGER',
      },
    })

    await prisma.userProperty.createMany({
      data: [
        { userId: owner.id, propertyId: property.id },
        { userId: manager.id, propertyId: property.id },
      ],
    })

    const campaign = await prisma.campaign.create({
      data: {
        propertyId: property.id,
        name: 'Wedding Season 2026 — Meta',
        type: 'SOCIAL_EVENTS',
        platforms: ['META', 'INSTAGRAM'],
        budgetAmount: 80000,
        spentAmount: 42000,
        leadsGenerated: 18,
        bookingsCount: 5,
        status: 'ACTIVE',
        startDate: new Date('2026-05-01'),
        endDate: new Date('2026-07-31'),
        keywords: ['wedding venue delhi', 'banquet hall', 'wedding package'],
      },
    })

    const leadData = [
      { name: 'Rahul Mehta', phone: '9876543210', email: 'rahul@example.com', eventType: 'SOCIAL_EVENTS' as const, stage: 'PROPOSAL_SENT' as const, source: 'META' as const, guestCount: 350, budgetMax: 8, score: 85 },
      { name: 'Sunita Agarwal', phone: '9812345678', email: 'sunita@example.com', eventType: 'CORPORATE_EVENTS' as const, stage: 'SITE_VISIT' as const, source: 'GOOGLE' as const, guestCount: 100, budgetMax: 3, score: 72 },
      { name: 'Vikram Singh', phone: '9988776655', email: null, eventType: 'BIRTHDAY_SOCIAL' as const, stage: 'NEW' as const, source: 'REFERRAL' as const, guestCount: 80, budgetMax: 1.5, score: 60 },
      { name: 'Deepika Joshi', phone: '9654321098', email: 'deepika@example.com', eventType: 'SOCIAL_EVENTS' as const, stage: 'BOOKED' as const, source: 'WEDMEGOOD' as const, guestCount: 400, budgetMax: 12, score: 92 },
      { name: 'Amit Patel', phone: '9123456789', email: null, eventType: 'PROMOTIONAL_EVENTS' as const, stage: 'CONTACTED' as const, source: 'JUSTDIAL' as const, guestCount: 150, budgetMax: 2.5, score: 55 },
      { name: 'Neha Gupta', phone: '9845612378', email: 'neha@example.com', eventType: 'CORPORATE_EVENTS' as const, stage: 'NEGOTIATION' as const, source: 'DIRECT' as const, guestCount: 200, budgetMax: 5, score: 78 },
    ]

    for (const l of leadData) {
      await prisma.lead.create({
        data: {
          propertyId: property.id,
          name: l.name,
          phone: l.phone,
          email: l.email,
          eventType: l.eventType,
          stage: l.stage,
          source: l.source,
          guestCount: l.guestCount,
          budgetMin: l.budgetMax * 0.6,
          budgetMax: l.budgetMax,
          leadScore: l.score,
          eventDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          assignedToId: manager.id,
          campaignId: l.source === 'META' ? campaign.id : null,
        },
      })
    }

    await prisma.platformListing.createMany({
      data: [
        { propertyId: property.id, platform: 'WEDMEGOOD', status: 'ACTIVE', tier: 'Premium', leadsGenerated: 12, revenueGenerated: 240000, contentScore: 88 },
        { propertyId: property.id, platform: 'GOOGLE', status: 'ACTIVE', tier: 'Verified', leadsGenerated: 8, revenueGenerated: 160000, contentScore: 75 },
        { propertyId: property.id, platform: 'JUSTDIAL', status: 'ACTIVE', tier: 'Standard', leadsGenerated: 5, revenueGenerated: 80000, contentScore: 60 },
      ],
    })

    return NextResponse.json({
      success: true,
      credentials: {
        owner: 'owner@grandbanquets.com / Demo@1234',
        manager: 'manager@grandbanquets.com / Demo@1234',
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
