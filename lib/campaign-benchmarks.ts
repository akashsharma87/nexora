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
