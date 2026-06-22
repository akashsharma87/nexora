import { PrismaClient } from '@prisma/client'

// Called after a new org/property is created (registration) or manually via /api/setup/seed-defaults
export async function seedPropertyDefaults(
  prisma: PrismaClient,
  propertyId: string
) {
  await Promise.all([
    seedTemplates(prisma, propertyId),
    seedPlatforms(prisma, propertyId),
    seedCampaigns(prisma, propertyId),
  ])
}

// ---------------------------------------------------------------------------
// WhatsApp Message Templates
// ---------------------------------------------------------------------------
// watiName field = the approved template name in your Wati account.
// The INITIAL_RESPONSE template name must match your approved Wati template exactly.
// ---------------------------------------------------------------------------
async function seedTemplates(prisma: PrismaClient, propertyId: string) {
  const existing = await prisma.messageTemplate.count({ where: { propertyId } })
  if (existing > 0) return

  const templates = [
    {
      name: 'Initial Response — New Inquiry',
      type: 'INITIAL_RESPONSE' as const,
      content: `Hi {{name}}, thank you for your inquiry about {{hotel_name}}!

We'd love to host your event. Our banquet team will call you within the next 30 minutes to discuss the details.

Meanwhile, feel free to reply with:
• Your event date
• Approximate guest count
• Budget range

— {{manager_name}}, {{hotel_name}}`,
      variables: ['name', 'hotel_name', 'manager_name'],
    },
    {
      name: 'Day 1 Nurture — Introduction',
      type: 'NURTURE_DAY1' as const,
      content: `Hi {{name}}, this is {{manager_name}} from {{hotel_name}}.

I wanted to personally share a few highlights of our banquet facilities:

✅ Capacity up to 1,000 guests
✅ In-house catering & décor
✅ Dedicated event coordinator
✅ Flexible booking terms

Can we schedule a quick call or site visit this week? I'll make time around your schedule.`,
      variables: ['name', 'manager_name', 'hotel_name'],
    },
    {
      name: 'Day 3 Nurture — Venue Video + Offer',
      type: 'NURTURE_DAY3' as const,
      content: `Hi {{name}}, following up from {{hotel_name}} 👋

Our banquet hall transforms beautifully for every event type. Here's what past clients have said:

"The team went above and beyond. Every detail was perfect." — Recent wedding client

🎁 *Special offer for bookings this month:*
Complimentary welcome drinks for all guests + 10% off décor package.

Shall I send you our full pricing deck and availability calendar?`,
      variables: ['name', 'hotel_name'],
    },
    {
      name: 'Day 5 Nurture — Testimonial + Social Proof',
      type: 'NURTURE_DAY5' as const,
      content: `Hi {{name}}, we've hosted 200+ events at {{hotel_name}} this year alone.

A few recent highlights:
🥂 500-guest wedding reception — fully managed
🏢 Corporate product launch for 300 delegates
🎂 Intimate 100-person birthday celebration

Every event is assigned a dedicated coordinator from your first inquiry to the final toast.

Would you like to see our event portfolio? I can share photos and video walkthroughs.`,
      variables: ['name', 'hotel_name'],
    },
    {
      name: 'Day 7 Nurture — Urgency Close',
      type: 'NURTURE_DAY7' as const,
      content: `Hi {{name}}, just a quick note from {{hotel_name}}.

We have very limited availability remaining for {{event_date}} and the surrounding dates. Several inquiries are moving to the booking stage this week.

To secure your preferred date, we'd need a small refundable hold — no full payment required yet.

Can we do a quick 10-minute call today? I'd hate for you to lose the date. 📅`,
      variables: ['name', 'hotel_name', 'event_date'],
    },
    {
      name: 'Proposal Follow-Up',
      type: 'PROPOSAL_FOLLOWUP' as const,
      content: `Hi {{name}}, I hope you've had a chance to review the proposal we sent for your {{event_type}} at {{hotel_name}}.

Do you have any questions about the pricing, menu options, or venue setup? I'm happy to customize any part of the package.

A quick call or reply would really help us move forward and hold your preferred date. 🙏`,
      variables: ['name', 'event_type', 'hotel_name'],
    },
    {
      name: 'Post-Event Thank You (Day 3)',
      type: 'POST_EVENT_DAY3' as const,
      content: `Hi {{name}}, it was an absolute pleasure hosting your event at {{hotel_name}}!

We hope your guests had a wonderful experience. We'd love to hear your feedback — a quick Google review would mean the world to our team. 🌟

We look forward to being part of your next celebration!

— {{manager_name}}, {{hotel_name}}`,
      variables: ['name', 'hotel_name', 'manager_name'],
    },
    {
      name: 'Referral Ask (Day 30)',
      type: 'POST_EVENT_DAY30' as const,
      content: `Hi {{name}}, it's been a month since your event at {{hotel_name}} — we hope the memories are still fresh! 😊

If you know anyone planning a wedding, corporate event, or celebration, we'd love a referral. As a thank you, we offer ₹5,000 off their first booking when they mention your name.

Thank you for trusting us with your special occasion!`,
      variables: ['name', 'hotel_name'],
    },
    {
      name: 'Re-engagement — Next Event (Day 90)',
      type: 'POST_EVENT_DAY90' as const,
      content: `Hi {{name}}, greetings from {{hotel_name}}! 🎉

It's been 3 months since your event and we're already gearing up for the festive season. We have some exciting new packages for Diwali, New Year's Eve, and the upcoming wedding season.

If you or anyone you know is planning an event, our early-bird slots are filling fast. Reply "YES" and I'll send you our updated packages!`,
      variables: ['name', 'hotel_name'],
    },
    {
      name: 'Seasonal Broadcast — Festival Offer',
      type: 'BROADCAST' as const,
      content: `🎊 Festive Season Special from {{hotel_name}}!

We're offering exclusive banquet packages for the upcoming season:

✨ Wedding & Engagement packages from ₹{{budget_min}}L
🏢 Corporate year-end events with special rates
🎂 Birthday & anniversary celebrations

Limited dates available. Book before {{deadline}} to lock in the festival pricing.

Reply "INTERESTED" or call us directly. Looking forward to celebrating with you! 🥂`,
      variables: ['hotel_name', 'budget_min', 'deadline'],
    },
  ]

  await prisma.messageTemplate.createMany({
    data: templates.map((t) => ({
      propertyId,
      ...t,
    })),
    skipDuplicates: true,
  })
}

// ---------------------------------------------------------------------------
// Platform Listings — all 6 from PRD
// ---------------------------------------------------------------------------
async function seedPlatforms(prisma: PrismaClient, propertyId: string) {
  const existing = await prisma.platformListing.count({ where: { propertyId } })
  if (existing > 0) return

  const platforms = [
    {
      platform: 'WEDMEGOOD' as const,
      tier: 'Premium',
      status: 'PENDING_SETUP' as const,
      contentScore: 0,
      notes: 'Premium wedding platform. 10,000+ venues. High-intent wedding audience. Setup: Create profile → upload 20+ banquet photos → add pricing packages → enable inquiry routing.',
      contentChecklist: { items: [
        { label: 'Profile created with hotel name and description', done: false },
        { label: 'Minimum 20 banquet photos uploaded', done: false },
        { label: 'Pricing packages listed (per-plate + rental)', done: false },
        { label: 'Capacity range set (min/max guests)', done: false },
        { label: 'Amenities and facilities listed', done: false },
        { label: 'Inquiry routing email configured', done: false },
        { label: 'Reviews section active', done: false },
        { label: 'Location and map pinned correctly', done: false },
        { label: 'Contact number verified', done: false },
        { label: 'Availability calendar updated', done: false },
      ] },
    },
    {
      platform: 'WEDDINGZ' as const,
      tier: 'Popular',
      status: 'PENDING_SETUP' as const,
      contentScore: 0,
      notes: 'OYO-backed platform. 1,000+ venues. Strong in destination weddings and vendor marketplace. Setup: Register as venue → complete profile → add vendor tie-ups.',
      contentChecklist: { items: [
        { label: 'Venue registered on Weddingz.in', done: false },
        { label: 'Banquet hall photos uploaded (min 15)', done: false },
        { label: 'Package pricing added', done: false },
        { label: 'Vendor marketplace integrations added', done: false },
        { label: 'Destination wedding category enabled', done: false },
        { label: 'Inquiry email and phone verified', done: false },
        { label: 'Testimonials/reviews section filled', done: false },
        { label: 'Location and area correctly tagged', done: false },
        { label: 'Capacity details complete', done: false },
        { label: 'Response time under 2 hours configured', done: false },
      ] },
    },
    {
      platform: 'VENUELOOK' as const,
      tier: 'Popular',
      status: 'PENDING_SETUP' as const,
      contentScore: 0,
      notes: 'Free quote system. 50+ cities. All event types. High volume, low intent — good for top-of-funnel. Setup: Add venue → complete all sections → enable free quotes.',
      contentChecklist: { items: [
        { label: 'Venue profile created on VenueLook', done: false },
        { label: 'All event type categories selected', done: false },
        { label: 'Photos uploaded (min 10)', done: false },
        { label: 'Free quote enabled', done: false },
        { label: 'Pricing range indicated', done: false },
        { label: 'City and locality correctly tagged', done: false },
        { label: 'Capacity and layout options listed', done: false },
        { label: 'Amenities checklist completed', done: false },
        { label: 'Contact details verified', done: false },
        { label: 'Parking and accessibility info added', done: false },
      ] },
    },
    {
      platform: 'WEDDINGBAZAAR' as const,
      tier: 'Verified',
      status: 'PENDING_SETUP' as const,
      contentScore: 0,
      notes: 'Pan-India reach. Dedicated account management. Verified listing with review management. Good for premium positioning.',
      contentChecklist: { items: [
        { label: 'Verified listing application submitted', done: false },
        { label: 'Account manager assigned', done: false },
        { label: 'Profile description written', done: false },
        { label: 'Gallery photos uploaded', done: false },
        { label: 'Pricing tiers configured', done: false },
        { label: 'Reviews solicited from past clients', done: false },
        { label: 'Pan-India visibility settings enabled', done: false },
        { label: 'Contact routing confirmed', done: false },
        { label: 'Monthly analytics report set up', done: false },
        { label: 'Seasonal offers created', done: false },
      ] },
    },
    {
      platform: 'GOOGLE_BUSINESS' as const,
      tier: 'Essential',
      status: 'PENDING_SETUP' as const,
      contentScore: 0,
      notes: 'Google Search and Maps. Local SEO. Essential for all discovery. Every banquet inquiry starts with Google. Must be set up before any paid campaigns.',
      contentChecklist: { items: [
        { label: 'Google Business Profile claimed and verified', done: false },
        { label: 'Business category set to "Banquet Hall"', done: false },
        { label: 'Address and map pin verified', done: false },
        { label: 'Phone number added and verified', done: false },
        { label: 'Business hours set correctly', done: false },
        { label: 'Min 25 photos uploaded (interior + exterior)', done: false },
        { label: 'Services section filled (weddings, corporate, etc.)', done: false },
        { label: 'Respond to all existing reviews', done: false },
        { label: 'Posts section activated (1 post/week minimum)', done: false },
        { label: 'Q&A section monitored and answered', done: false },
      ] },
    },
    {
      platform: 'JUSTDIAL' as const,
      tier: 'B2B',
      status: 'PENDING_SETUP' as const,
      contentScore: 0,
      notes: 'B2B and local. High call volume. Strong for corporate leads and local searches. Verified listing gets priority placement.',
      contentChecklist: { items: [
        { label: 'JustDial listing claimed or created', done: false },
        { label: 'Business category correctly set', done: false },
        { label: 'Phone number(s) added', done: false },
        { label: 'Service area and city configured', done: false },
        { label: 'Photos added to listing', done: false },
        { label: 'Verified badge applied for', done: false },
        { label: 'Corporate event category enabled', done: false },
        { label: 'Pricing range indicated', done: false },
        { label: 'Reviews requested from past clients', done: false },
        { label: 'Call tracking number set up', done: false },
      ] },
    },
  ]

  await prisma.platformListing.createMany({
    data: platforms.map((p) => ({
      propertyId,
      ...p,
      contentChecklist: p.contentChecklist,
    })),
    skipDuplicates: true,
  })
}

// ---------------------------------------------------------------------------
// Campaigns — one for each of the 6 PRD campaign types
// ---------------------------------------------------------------------------
async function seedCampaigns(prisma: PrismaClient, propertyId: string) {
  const existing = await prisma.campaign.count({ where: { propertyId } })
  if (existing > 0) return

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const campaigns = [
    {
      name: 'Social Events — Weddings & Engagements',
      type: 'SOCIAL_EVENTS' as const,
      platforms: ['META', 'GOOGLE'] as const,
      budgetAmount: 80000,
      targetAudience: { ageMin: 24, ageMax: 56, radius: '30 km', segments: ['HNI', 'newly engaged', 'wedding planners'] },
      keywords: ['wedding venue', 'banquet hall for wedding', 'marriage hall', 'wedding reception venue', 'engagement ceremony venue'],
      notes: 'Benchmark CPL: ₹150–450 (Meta), ₹200–600 (Google). Target 28–40% booking conversion.',
    },
    {
      name: 'Corporate Events — Conferences & Launches',
      type: 'CORPORATE_EVENTS' as const,
      platforms: ['META', 'GOOGLE', 'LINKEDIN'] as const,
      budgetAmount: 70000,
      targetAudience: { ageMin: 22, ageMax: 65, companySize: '200+ employees', roles: ['CEO', 'Director', 'HR Manager'] },
      keywords: ['conference venue', 'corporate event venue', 'product launch venue', 'board meeting venue', 'corporate banquet hall'],
      notes: 'Benchmark CPL: ₹300–700. Target 40–65% booking conversion. LinkedIn works well for B2B.',
    },
    {
      name: 'Birthday & Social Celebrations',
      type: 'BIRTHDAY_SOCIAL' as const,
      platforms: ['META', 'GOOGLE'] as const,
      budgetAmount: 20000,
      targetAudience: { ageMin: 20, ageMax: 54, segments: ['family decision-makers', 'birthday planners', 'anniversary celebrations'] },
      keywords: ['birthday party venue', 'birthday hall booking', 'anniversary venue', 'retirement party venue', 'private dining venue'],
      notes: 'Benchmark CPL: ₹80–200 (Meta), ₹120–300 (Google). Target 25–35% conversion.',
    },
    {
      name: 'Promotional Events — Exhibitions & Shows',
      type: 'PROMOTIONAL_EVENTS' as const,
      platforms: ['META', 'INSTAGRAM'] as const,
      budgetAmount: 15000,
      targetAudience: { ageMin: 20, ageMax: 54, segments: ['arts professionals', 'media industry', 'fashion industry', 'food & beverage'] },
      keywords: ['event space rental', 'exhibition hall', 'fashion show venue', 'art exhibition venue', 'food festival venue'],
      notes: 'Niche but high-value. Focus on Instagram for visual industries. No fixed CPL benchmark.',
    },
    {
      name: 'Entertainment Events — Live Music & Comedy',
      type: 'ENTERTAINMENT_EVENTS' as const,
      platforms: ['META', 'INSTAGRAM'] as const,
      budgetAmount: 10000,
      targetAudience: { ageMin: 20, ageMax: 54, segments: ['live music fans', 'comedy show audience', 'entertainment seekers'] },
      keywords: ['live music venue', 'comedy show venue', 'event hall for concerts', 'entertainment venue booking'],
      notes: 'Benchmark CPL: ₹100–300 (Meta), ₹150–400 (Google). Target 22–35% conversion.',
    },
    {
      name: 'Seasonal & Thematic — Festivals & Brunches',
      type: 'SEASONAL_THEMATIC' as const,
      platforms: ['META', 'GOOGLE'] as const,
      budgetAmount: 5000,
      targetAudience: { ageMin: 20, ageMax: 54, segments: ['frequent travellers', 'food lovers', 'festival celebrators'] },
      keywords: ['new year party venue', 'diwali event venue', 'christmas party venue', 'monsoon brunch venue', 'festive celebration hall'],
      notes: 'Benchmark CPL: ₹200–500 (Meta), ₹250–600 (Google). Target 32–45% conversion. Run 4–6 weeks before each festival.',
    },
  ]

  await prisma.campaign.createMany({
    data: campaigns.map((c) => ({
      propertyId,
      name: c.name,
      type: c.type,
      platforms: c.platforms,
      budgetAmount: c.budgetAmount,
      targetAudience: c.targetAudience,
      keywords: c.keywords,
      notes: c.notes,
      startDate: startOfMonth,
      status: 'ACTIVE',
    })),
    skipDuplicates: true,
  })
}
