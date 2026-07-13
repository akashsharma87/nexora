export const leadStageLabels: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  FOLLOW_UP: 'Follow-Up',
  SITE_VISIT: 'Site Visit',
  PROPOSAL_SENT: 'Proposal Sent',
  NEGOTIATION: 'Negotiation',
  BOOKED: 'Booked',
  LOST: 'Lost',
}

export const eventTypeLabels: Record<string, string> = {
  SOCIAL_EVENTS: 'Social Events',
  CORPORATE_EVENTS: 'Corporate Events',
  BIRTHDAY_SOCIAL: 'Birthday & Social',
  PROMOTIONAL_EVENTS: 'Promotional Events',
  ENTERTAINMENT_EVENTS: 'Entertainment Events',
  SEASONAL_THEMATIC: 'Seasonal & Thematic',
}

export const sourceLabels: Record<string, string> = {
  WEDMEGOOD: 'WedMeGood',
  WEDDINGZ: 'Weddingz',
  VENUELOOK: 'VenueLook',
  WEDDINGBAZAAR: 'WeddingBazaar',
  GOOGLE: 'Google',
  META: 'Meta',
  JUSTDIAL: 'JustDial',
  WALK_IN: 'Walk-in',
  REFERRAL: 'Referral',
  PHONE: 'Phone',
  DIRECT: 'Direct',
  OTHER: 'Other',
}

export const platformLabels: Record<string, string> = {
  WEDMEGOOD: 'WedMeGood',
  WEDDINGZ: 'Weddingz.in',
  VENUELOOK: 'VenueLook',
  WEDDINGBAZAAR: 'WeddingBazaar',
  GOOGLE_BUSINESS: 'Google Business',
  JUSTDIAL: 'JustDial',
}

// Display-only relabeling of PlatformStatus — "PENDING_SETUP" reads as a stalled/broken
// integration to a GM; "Upcoming Soon" is honest (the agency hasn't onboarded this listing
// yet) without sounding like an error. The underlying enum value is unchanged everywhere else.
export const platformStatusLabels: Record<string, string> = {
  ACTIVE: 'Active',
  PENDING_SETUP: 'Upcoming Soon',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Suspended',
}

// Takes hours-since-some-event and renders "Xh" under a day, "Xd" or "Xd Yh" once
// it crosses 24h — never shows raw triple-digit hour counts like "122h".
export function formatHoursAgo(hours: number): string {
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
}

export function formatCurrency(value: number, unit: 'rupees' | 'lakhs' = 'rupees') {
  const rupees = unit === 'lakhs' ? value * 100000 : value

  if (rupees >= 10000000) {
    return `₹${(rupees / 10000000).toFixed(1)} Cr`
  }

  if (rupees >= 100000) {
    return `₹${(rupees / 100000).toFixed(1)} L`
  }

  return `₹${new Intl.NumberFormat('en-IN').format(Math.round(rupees))}`
}

export function formatDate(value?: string | Date | null) {
  if (!value) return 'Not set'
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}
