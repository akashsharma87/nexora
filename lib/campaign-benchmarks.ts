type CampaignBenchmark = {
  monthlyBudget: number
  cplMetaMin: number | null
  cplMetaMax: number | null
  cplGoogleMin: number | null
  cplGoogleMax: number | null
  bookingConversionMin: number | null
  bookingConversionMax: number | null
}

export const campaignBenchmarks: Record<string, CampaignBenchmark> = {
  SOCIAL_EVENTS: {
    monthlyBudget: 80000,
    cplMetaMin: 150, cplMetaMax: 450,
    cplGoogleMin: 200, cplGoogleMax: 600,
    bookingConversionMin: 28, bookingConversionMax: 40,
  },
  CORPORATE_EVENTS: {
    monthlyBudget: 70000,
    cplMetaMin: 300, cplMetaMax: 700,
    cplGoogleMin: 300, cplGoogleMax: 700,
    bookingConversionMin: 40, bookingConversionMax: 65,
  },
  BIRTHDAY_SOCIAL: {
    monthlyBudget: 20000,
    cplMetaMin: 80, cplMetaMax: 200,
    cplGoogleMin: 120, cplGoogleMax: 300,
    bookingConversionMin: 25, bookingConversionMax: 35,
  },
  PROMOTIONAL_EVENTS: {
    monthlyBudget: 15000,
    cplMetaMin: null, cplMetaMax: null,
    cplGoogleMin: null, cplGoogleMax: null,
    bookingConversionMin: null, bookingConversionMax: null,
  },
  ENTERTAINMENT_EVENTS: {
    monthlyBudget: 10000,
    cplMetaMin: 100, cplMetaMax: 300,
    cplGoogleMin: 150, cplGoogleMax: 400,
    bookingConversionMin: 22, bookingConversionMax: 35,
  },
  SEASONAL_THEMATIC: {
    monthlyBudget: 5000,
    cplMetaMin: 200, cplMetaMax: 500,
    cplGoogleMin: 250, cplGoogleMax: 600,
    bookingConversionMin: 32, bookingConversionMax: 45,
  },
}

// Fingerprints of the 6 fabricated "starter kit" campaigns that lib/seeds/property-defaults.ts
// used to auto-create (forced to ACTIVE, fake budgets lifted from the sales deck) on every
// property before a real Meta/Google Ads sync or manual campaign ever existed. The seeder no
// longer creates these, but properties seeded before that fix still have the rows in Postgres —
// this lets every campaign-listing query hide them without a destructive DB migration.
const LEGACY_SEED_CAMPAIGN_SIGNATURES = new Set([
  'SOCIAL_EVENTS:80000:Social Events — Weddings & Engagements',
  'CORPORATE_EVENTS:70000:Corporate Events — Conferences & Launches',
  'BIRTHDAY_SOCIAL:20000:Birthday & Social Celebrations',
  'PROMOTIONAL_EVENTS:15000:Promotional Events — Exhibitions & Shows',
  'ENTERTAINMENT_EVENTS:10000:Entertainment Events — Live Music & Comedy',
  'SEASONAL_THEMATIC:5000:Seasonal & Thematic — Festivals & Brunches',
])

export function isLegacySeedCampaign(campaign: {
  externalId?: string | null
  type: string
  name: string
  // Decimal fields come through as Prisma.Decimal server-side, string|number once
  // JSON-serialized to the client — accept either without importing the Decimal type here.
  budgetAmount: unknown
  leadsGenerated: number
  bookingsCount: number
  spentAmount: unknown
}): boolean {
  if (campaign.externalId) return false
  if (campaign.leadsGenerated !== 0 || campaign.bookingsCount !== 0) return false
  if (Number(campaign.spentAmount as string | number) !== 0) return false
  const signature = `${campaign.type}:${Number(campaign.budgetAmount as string | number)}:${campaign.name}`
  return LEGACY_SEED_CAMPAIGN_SIGNATURES.has(signature)
}
