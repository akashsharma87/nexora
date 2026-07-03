// Google Ads REST API. Version string sunsets roughly yearly (Google
// deprecates old versions on a fixed schedule) — verify this is still
// supported before relying on it long-term: https://developers.google.com/google-ads/api/docs/release-notes
const API_VERSION = 'v19'
const API_BASE = `https://googleads.googleapis.com/${API_VERSION}`
const OAUTH_SCOPES = 'https://www.googleapis.com/auth/adwords email profile'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

export function getGoogleAdsAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv('GOOGLE_CLIENT_ID'),
    redirect_uri: requireEnv('GOOGLE_ADS_REDIRECT_URL'),
    response_type: 'code',
    scope: OAUTH_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

type GoogleTokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in: number
}

async function postForm<T>(url: string, body: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error_description || data?.error || `Google OAuth request failed (${res.status})`)
  }
  return data as T
}

// Google access tokens live ~1hr; the refresh_token (only returned on the
// FIRST consent, hence access_type=offline + prompt=consent above) is what
// we persist and use to mint a fresh access token on every sync.
export async function exchangeGoogleAdsCode(code: string): Promise<{
  accessToken: string
  refreshToken: string
  expiresAt: Date
}> {
  const data = await postForm<GoogleTokenResponse>('https://oauth2.googleapis.com/token', {
    code,
    client_id: requireEnv('GOOGLE_CLIENT_ID'),
    client_secret: requireEnv('GOOGLE_CLIENT_SECRET'),
    redirect_uri: requireEnv('GOOGLE_ADS_REDIRECT_URL'),
    grant_type: 'authorization_code',
  })

  if (!data.refresh_token) {
    throw new Error('Google did not return a refresh token — revoke app access at myaccount.google.com/permissions and reconnect so it prompts for consent again.')
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  }
}

export async function refreshGoogleAdsAccessToken(refreshToken: string): Promise<{
  accessToken: string
  expiresAt: Date
}> {
  const data = await postForm<GoogleTokenResponse>('https://oauth2.googleapis.com/token', {
    refresh_token: refreshToken,
    client_id: requireEnv('GOOGLE_CLIENT_ID'),
    client_secret: requireEnv('GOOGLE_CLIENT_SECRET'),
    grant_type: 'refresh_token',
  })

  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  }
}

// Returns a fresh token only if the stored one is expired/near-expiry;
// returns null when the caller can keep using its current access token.
// Callers must persist the refreshed token+expiry back to the DB themselves
// (this file stays Prisma-free, matching lib/meta-ads.ts's convention).
export async function ensureValidGoogleAdsToken(connection: {
  accessToken: string
  refreshToken: string | null
  tokenExpiresAt: Date | null
}): Promise<{ accessToken: string; expiresAt: Date } | null> {
  const stillValid = connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() > Date.now() + 60_000
  if (stillValid) return null
  if (!connection.refreshToken) throw new Error('No refresh token stored — reconnect Google Ads.')
  return refreshGoogleAdsAccessToken(connection.refreshToken)
}

export async function getGoogleUserProfile(accessToken: string): Promise<{ email: string; name: string }> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || 'Failed to load Google profile')
  return { email: data.email, name: data.name || data.email }
}

function adsHeaders(accessToken: string, loginCustomerId?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': requireEnv('GOOGLE_ADS_DEVELOPER_TOKEN'),
    'Content-Type': 'application/json',
  }
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId
  return headers
}

async function fetchAdsJson<T>(url: string, accessToken: string, options: RequestInit = {}, loginCustomerId?: string): Promise<T> {
  const res = await fetch(url, { ...options, headers: adsHeaders(accessToken, loginCustomerId) })
  const data = await res.json()
  if (!res.ok) {
    const message = data?.error?.message || data?.[0]?.error?.message || `Google Ads API request failed (${res.status})`
    throw new Error(message)
  }
  return data as T
}

export type GoogleAdsCustomer = {
  id: string
  name: string
  currency: string | null
}

// Lists every client account under the connected user, then resolves each
// one's descriptive name via a per-customer GAQL lookup — ListAccessibleCustomers
// only returns bare resource names.
export async function listGoogleAdsCustomers(accessToken: string): Promise<GoogleAdsCustomer[]> {
  const mccId = requireEnv('GOOGLE_ADS_LOGIN_CUSTOMER_ID')
  const { resourceNames } = await fetchAdsJson<{ resourceNames?: string[] }>(
    `${API_BASE}/customers:listAccessibleCustomers`,
    accessToken
  )

  const customerIds = (resourceNames || []).map((rn) => rn.replace('customers/', ''))

  const customers = await Promise.all(
    customerIds.map(async (id): Promise<GoogleAdsCustomer | null> => {
      try {
        const result = await fetchAdsJson<{ results?: Array<{ customer: { id: string; descriptiveName?: string; currencyCode?: string } }> }>(
          `${API_BASE}/customers/${id}/googleAds:search`,
          accessToken,
          {
            method: 'POST',
            body: JSON.stringify({ query: 'SELECT customer.id, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1' }),
          },
          mccId
        )
        const c = result.results?.[0]?.customer
        return { id, name: c?.descriptiveName || id, currency: c?.currencyCode ?? null }
      } catch {
        // Some accessible customers are manager accounts or otherwise
        // unqueryable directly — skip rather than fail the whole list.
        return null
      }
    })
  )

  return customers.filter((c): c is GoogleAdsCustomer => c !== null)
}

export type GoogleAdsCampaign = {
  id: string
  name: string
  status: string
  budgetMicros: number | null
  startDate: string | null
  endDate: string | null
  costMicros: number
  conversions: number
}

type GoogleAdsSearchRow = {
  campaign: { id: string; name: string; status: string; startDate?: string; endDate?: string }
  campaignBudget?: { amountMicros?: string }
  metrics?: { costMicros?: string; allConversions?: number }
}

// Google Ads has no single "all time" literal like Meta's date_preset=maximum —
// an explicit wide range is the standard workaround for a lifetime total.
export async function listGoogleAdsCampaignsWithMetrics(
  accessToken: string,
  customerId: string
): Promise<GoogleAdsCampaign[]> {
  const mccId = requireEnv('GOOGLE_ADS_LOGIN_CUSTOMER_ID')
  const today = new Date().toISOString().slice(0, 10)

  const query = `
    SELECT campaign.id, campaign.name, campaign.status, campaign.start_date, campaign.end_date,
           campaign_budget.amount_micros, metrics.cost_micros, metrics.all_conversions
    FROM campaign
    WHERE segments.date BETWEEN '2000-01-01' AND '${today}'
  `.trim()

  const campaigns: GoogleAdsCampaign[] = []
  let pageToken: string | undefined

  do {
    const page = await fetchAdsJson<{ results?: GoogleAdsSearchRow[]; nextPageToken?: string }>(
      `${API_BASE}/customers/${customerId}/googleAds:search`,
      accessToken,
      { method: 'POST', body: JSON.stringify({ query, pageToken, pageSize: 200 }) },
      mccId
    )

    for (const row of page.results || []) {
      campaigns.push({
        id: row.campaign.id,
        name: row.campaign.name,
        status: row.campaign.status,
        budgetMicros: row.campaignBudget?.amountMicros ? Number(row.campaignBudget.amountMicros) : null,
        startDate: row.campaign.startDate ?? null,
        endDate: row.campaign.endDate ?? null,
        costMicros: row.metrics?.costMicros ? Number(row.metrics.costMicros) : 0,
        // Approximation: total conversions on the account, not filtered to
        // lead-specific conversion actions (that needs an extra join on
        // conversion_action.category) — same tradeoff as the Meta sync.
        conversions: row.metrics?.allConversions ?? 0,
      })
    }
    pageToken = page.nextPageToken
  } while (pageToken)

  return campaigns
}
