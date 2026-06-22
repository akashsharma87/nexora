import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding demo data...')

  const org = await prisma.organization.upsert({
    where: { slug: 'demo-hotel' },
    update: {},
    create: {
      name: 'The Grand Banquets',
      slug: 'demo-hotel',
    },
  })

  const property = await prisma.property.upsert({
    where: { id: 'prop-demo-1' },
    update: {},
    create: {
      id: 'prop-demo-1',
      organizationId: org.id,
      name: 'The Grand Banquets — Delhi',
      address: '14, Banquet Lane',
      city: 'New Delhi',
      phone: '+91-11-4567-8901',
      email: 'events@grandbanquets.com',
    },
  })

  const passwordHash = await bcrypt.hash('demo1234', 10)

  const owner = await prisma.user.upsert({
    where: { email: 'owner@grandbanquets.com' },
    update: {},
    create: {
      organizationId: org.id,
      name: 'Arjun Sharma',
      email: 'owner@grandbanquets.com',
      password: passwordHash,
      role: 'OWNER',
    },
  })

  const manager = await prisma.user.upsert({
    where: { email: 'manager@grandbanquets.com' },
    update: {},
    create: {
      organizationId: org.id,
      name: 'Priya Kapoor',
      email: 'manager@grandbanquets.com',
      password: passwordHash,
      role: 'MANAGER',
    },
  })

  await prisma.userProperty.upsert({
    where: { userId_propertyId: { userId: owner.id, propertyId: property.id } },
    update: {},
    create: { userId: owner.id, propertyId: property.id },
  })

  await prisma.userProperty.upsert({
    where: { userId_propertyId: { userId: manager.id, propertyId: property.id } },
    update: {},
    create: { userId: manager.id, propertyId: property.id },
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
    skipDuplicates: true,
    data: [
      { propertyId: property.id, platform: 'WEDMEGOOD', status: 'ACTIVE', tier: 'Premium', leadsGenerated: 12, revenueGenerated: 240000, contentScore: 88 },
      { propertyId: property.id, platform: 'GOOGLE', status: 'ACTIVE', tier: 'Verified', leadsGenerated: 8, revenueGenerated: 160000, contentScore: 75 },
      { propertyId: property.id, platform: 'JUSTDIAL', status: 'ACTIVE', tier: 'Standard', leadsGenerated: 5, revenueGenerated: 80000, contentScore: 60 },
    ],
  })

  console.log('Seed complete.')
  console.log('Login: owner@grandbanquets.com / demo1234')
  console.log('Login: manager@grandbanquets.com / demo1234')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
