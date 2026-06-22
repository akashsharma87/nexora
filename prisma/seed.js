const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

const eventTypes = [
  'SOCIAL_EVENTS',
  'CORPORATE_EVENTS',
  'BIRTHDAY_SOCIAL',
  'PROMOTIONAL_EVENTS',
  'ENTERTAINMENT_EVENTS',
  'SEASONAL_THEMATIC',
]

const stages = ['NEW', 'CONTACTED', 'FOLLOW_UP', 'SITE_VISIT', 'PROPOSAL_SENT', 'NEGOTIATION', 'BOOKED', 'LOST']
const sources = ['WEDMEGOOD', 'WEDDINGZ', 'GOOGLE', 'META', 'JUSTDIAL', 'WALK_IN', 'REFERRAL', 'PHONE', 'DIRECT']

function scoreLead({ budgetMax, guestCount, source, eventDate }) {
  let score = 40

  if (Number(budgetMax) >= 70) score += 20
  else if (Number(budgetMax) >= 40) score += 12

  if (guestCount >= 300) score += 12
  else if (guestCount >= 180) score += 8

  if (['WEDMEGOOD', 'REFERRAL', 'GOOGLE'].includes(source)) score += 10

  const daysUntilEvent = Math.ceil((eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (daysUntilEvent > 0 && daysUntilEvent <= 45) score += 12

  return Math.min(100, score)
}

async function main() {
  await prisma.leadActivity.deleteMany()
  await prisma.proposal.deleteMany()
  await prisma.task.deleteMany()
  await prisma.lead.deleteMany()
  await prisma.campaign.deleteMany()
  await prisma.platformListing.deleteMany()
  await prisma.messageTemplate.deleteMany()
  await prisma.automationFlow.deleteMany()
  await prisma.broadcastCampaign.deleteMany()
  await prisma.userProperty.deleteMany()
  await prisma.account.deleteMany()
  await prisma.session.deleteMany()
  await prisma.user.deleteMany()
  await prisma.property.deleteMany()
  await prisma.organization.deleteMany()

  const organization = await prisma.organization.create({
    data: {
      name: 'Nexora Demo',
      slug: 'nexora-demo',
    },
  })

  const property = await prisma.property.create({
    data: {
      organizationId: organization.id,
      name: 'The Grand Majestic',
      address: 'Bandra Kurla Complex',
      city: 'Mumbai',
      phone: '+91 98765 43210',
      email: 'banquets@grandmajestic.example',
    },
  })

  const password = await bcrypt.hash('Demo@1234', 12)
  const users = await Promise.all(
    [
      ['Ananya Rao', 'owner@demo.com', 'OWNER'],
      ['Kabir Mehta', 'manager@demo.com', 'MANAGER'],
      ['Riya Shah', 'exec@demo.com', 'EXECUTIVE'],
    ].map(([name, email, role]) =>
      prisma.user.create({
        data: {
          organizationId: organization.id,
          name,
          email,
          password,
          role,
          properties: {
            create: {
              propertyId: property.id,
            },
          },
        },
      }),
    ),
  )

  const manager = users[1]
  const leadNames = [
    'Rajesh Sharma',
    'Priya Verma',
    'Arjun Patel',
    'Neha Singh',
    'Vikram Gupta',
    'Ananya Roy',
    'Mehta Family',
    'Infosys Ltd.',
    'Kapoor & Co.',
    'TCS Events',
    'Sanya Malhotra',
    'Aarav Khanna',
    'Zoya Fernandes',
    'Kunal Bhatia',
    'Pooja Iyer',
    'Rohan Nair',
    'Nisha Agarwal',
    'Deloitte Mumbai',
    'Siddharth Jain',
    'Ayesha Khan',
    'Mahindra Finance',
    'Tanvi Desai',
    'Rhea Kapoor',
    'Vihaan Malhotra',
    'Axis Leadership Team',
    'Ishaan Suri',
    'Mira Thomas',
    'Aditya Birla Events',
    'Kavya Menon',
    'Naman Oberoi',
  ]

  const leads = []

  for (let index = 0; index < leadNames.length; index += 1) {
    const eventDate = new Date()
    eventDate.setDate(eventDate.getDate() + 20 + index * 6)
    const eventType = eventTypes[index % eventTypes.length]
    const source = sources[index % sources.length]
    const stage = stages[index % stages.length]
    const guestCount = 120 + (index % 7) * 45
    const budgetMin = 8 + (index % 6) * 8
    const budgetMax = budgetMin + 18 + (index % 4) * 7

    const lead = await prisma.lead.create({
      data: {
        propertyId: property.id,
        assignedToId: users[index % users.length].id,
        name: leadNames[index],
        email: `lead${index + 1}@example.com`,
        phone: `+91 98${String(70000000 + index).padStart(8, '0')}`,
        eventType,
        eventDate,
        guestCount,
        budgetMin,
        budgetMax,
        source,
        stage,
        leadScore: scoreLead({ budgetMax, guestCount, source, eventDate }),
        notes: 'Seeded demo lead for Monday showcase.',
        activities: {
          create: [
            {
              userId: manager.id,
              type: 'LEAD_CREATED',
              content: `Lead captured from ${source.replaceAll('_', ' ')}.`,
            },
            {
              userId: manager.id,
              type: 'STAGE_CHANGE',
              content: `Stage set to ${stage.replaceAll('_', ' ')}.`,
              metadata: { to: stage },
            },
          ],
        },
      },
    })

    leads.push(lead)
  }

  const campaignBudgets = {
    SOCIAL_EVENTS: 80000,
    CORPORATE_EVENTS: 70000,
    BIRTHDAY_SOCIAL: 20000,
    PROMOTIONAL_EVENTS: 15000,
    ENTERTAINMENT_EVENTS: 10000,
    SEASONAL_THEMATIC: 5000,
  }

  for (const type of eventTypes) {
    await prisma.campaign.create({
      data: {
        propertyId: property.id,
        name: `${type.replaceAll('_', ' ')} Campaign`,
        type,
        platforms: ['META', 'GOOGLE'],
        budgetAmount: campaignBudgets[type],
        spentAmount: Math.round(campaignBudgets[type] * 0.62),
        leadsGenerated: 24 + eventTypes.indexOf(type) * 11,
        bookingsCount: 3 + eventTypes.indexOf(type),
        status: 'ACTIVE',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-08-31'),
        targetAudience: { radiusKm: 30, city: 'Mumbai' },
        keywords: ['banquet hall', 'event venue', type.toLowerCase().replaceAll('_', ' ')],
      },
    })
  }

  const listings = [
    ['WEDMEGOOD', 'Premium', 91],
    ['WEDDINGZ', 'Standard', 84],
    ['VENUELOOK', 'Popular', 78],
    ['WEDDINGBAZAAR', 'Verified', 73],
    ['GOOGLE_BUSINESS', 'Essential', 96],
    ['JUSTDIAL', 'B2B', 69],
  ]

  for (const [platform, tier, score] of listings) {
    await prisma.platformListing.create({
      data: {
        propertyId: property.id,
        platform,
        tier,
        status: score > 70 ? 'ACTIVE' : 'PENDING_SETUP',
        leadsGenerated: score * 2,
        revenueGenerated: score * 75000,
        contentScore: score,
        lastUpdatedAt: new Date(),
        lastSyncAt: new Date(),
        profileUrl: `https://example.com/${platform.toLowerCase()}`,
      },
    })
  }

  const templates = [
    ['Initial Lead Follow-up', 'INITIAL_RESPONSE', 'Hi {{name}}, thank you for your {{eventType}} inquiry at {{hotelName}}. Can we schedule a quick call today?'],
    ['Day 1 Nurture', 'NURTURE_DAY1', 'Hi {{name}}, sharing our banquet brochure and package details for {{eventType}}.'],
    ['Day 3 Venue Video', 'NURTURE_DAY3', 'Hi {{name}}, would you like to see recent venue photos and a custom quote?'],
    ['Day 5 Testimonial', 'NURTURE_DAY5', 'Hi {{name}}, sharing a recent guest story from an event similar to yours.'],
    ['Day 7 Urgency Close', 'NURTURE_DAY7', 'Hi {{name}}, your preferred event date has limited availability. Can we finalize a quick call?'],
    ['Proposal Reminder', 'PROPOSAL_FOLLOWUP', 'Hi {{name}}, your proposal is ready. Please review and let us know what you would like adjusted.'],
    ['Post Event Thanks', 'POST_EVENT_DAY3', 'Thank you for celebrating with us, {{name}}. We would love your review.'],
    ['Referral Ask', 'POST_EVENT_DAY30', 'Hi {{name}}, if someone you know needs a venue, we would be happy to help.'],
    ['Next Event Offer', 'POST_EVENT_DAY90', 'Hi {{name}}, planning another celebration soon? We have preferred guest offers available.'],
    ['Seasonal Broadcast', 'BROADCAST', 'Our seasonal banquet packages are live. Reply YES to get details.'],
  ]

  for (const [name, type, content] of templates) {
    await prisma.messageTemplate.create({
      data: {
        propertyId: property.id,
        name,
        type,
        content,
        variables: ['name', 'eventType', 'hotelName'],
        sentCount: 20 + templates.findIndex((template) => template[0] === name) * 7,
        openRate: 62 + templates.findIndex((template) => template[0] === name) * 2,
      },
    })
  }

  await prisma.automationFlow.createMany({
    data: [
      {
        propertyId: property.id,
        name: 'Instant Lead Response',
        trigger: 'LEAD_CREATED',
        steps: [{ offsetMinutes: 1, templateType: 'INITIAL_RESPONSE' }],
      },
      {
        propertyId: property.id,
        name: '7-Day Nurture Sequence',
        trigger: 'LEAD_CONTACTED',
        steps: [
          { offsetDays: 1, templateType: 'NURTURE_DAY1' },
          { offsetDays: 3, templateType: 'NURTURE_DAY3' },
          { offsetDays: 5, templateType: 'NURTURE_DAY5' },
          { offsetDays: 7, templateType: 'NURTURE_DAY7' },
        ],
      },
      {
        propertyId: property.id,
        name: 'Post-Event Re-engagement',
        trigger: 'EVENT_COMPLETED',
        steps: [
          { offsetDays: 3, templateType: 'POST_EVENT_DAY3' },
          { offsetDays: 30, templateType: 'POST_EVENT_DAY30' },
          { offsetDays: 90, templateType: 'POST_EVENT_DAY90' },
        ],
      },
    ],
  })

  for (let index = 0; index < 8; index += 1) {
    await prisma.proposal.create({
      data: {
        leadId: leads[index].id,
        title: `Banquet Proposal for ${leads[index].name}`,
        content: 'Custom banquet package with venue, catering, decor, and service inclusions.',
        amount: 1200000 + index * 250000,
        eventDate: leads[index].eventDate,
        guestCount: leads[index].guestCount,
        validUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
        status: ['DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'SENT', 'VIEWED', 'ACCEPTED'][index],
      },
    })
  }

  console.log('Seed complete')
  console.log('Demo login: manager@demo.com / Demo@1234')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
