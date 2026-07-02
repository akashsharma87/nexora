const GRAPH_VERSION = 'v21.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

export const META_ADS_SCOPES = 'ads_management,business_management'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

export function getMetaAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv('META_APP_ID'),
    redirect_uri: requireEnv('META_ADS_REDIRECT_URI'),
    scope: META_ADS_SCOPES,
    response_type: 'code',
    state,
  })
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`
}

type MetaTokenResponse = { access_token: string; expires_in?: number }

async function fetchMetaJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error?.message || `Meta API request failed (${res.status})`)
  }
  return data as T
}

// Exchanges the OAuth code for a short-lived token, then immediately
// exchanges that for a long-lived (~60 day) token — Meta requires two hops.
export async function exchangeMetaCodeForLongLivedToken(code: string): Promise<{
  accessToken: string
  expiresAt: Date | null
}> {
  const appId = requireEnv('META_APP_ID')
  const appSecret = requireEnv('META_APP_SECRET')
  const redirectUri = requireEnv('META_ADS_REDIRECT_URI')

  const shortLived = await fetchMetaJson<MetaTokenResponse>(
    `${GRAPH_BASE}/oauth/access_token?${new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    }).toString()}`
  )

  const longLived = await fetchMetaJson<MetaTokenResponse>(
    `${GRAPH_BASE}/oauth/access_token?${new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLived.access_token,
    }).toString()}`
  )

  return {
    accessToken: longLived.access_token,
    expiresAt: longLived.expires_in ? new Date(Date.now() + longLived.expires_in * 1000) : null,
  }
}

export async function getMetaUserProfile(accessToken: string): Promise<{ id: string; name: string }> {
  return fetchMetaJson<{ id: string; name: string }>(
    `${GRAPH_BASE}/me?${new URLSearchParams({ fields: 'id,name', access_token: accessToken }).toString()}`
  )
}

export type MetaAdAccount = {
  id: string
  name: string
  accountStatus: number
  currency: string
  businessName: string | null
}

type MetaAdAccountsPage = {
  data: Array<{ id: string; name: string; account_status: number; currency: string; business_name?: string }>
  paging?: { next?: string }
}

// Lists every ad account the connected master user can act on, following
// pagination — an agency Business Manager can hold far more than one page.
export async function listMetaAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const accounts: MetaAdAccount[] = []
  let url: string | undefined =
    `${GRAPH_BASE}/me/adaccounts?${new URLSearchParams({
      fields: 'id,name,account_status,currency,business_name',
      limit: '200',
      access_token: accessToken,
    }).toString()}`

  while (url) {
    const page: MetaAdAccountsPage = await fetchMetaJson<MetaAdAccountsPage>(url)
    for (const a of page.data) {
      accounts.push({
        id: a.id,
        name: a.name,
        accountStatus: a.account_status,
        currency: a.currency,
        businessName: a.business_name ?? null,
      })
    }
    url = page.paging?.next
  }

  return accounts
}

export type MetaCampaign = {
  id: string
  name: string
  effectiveStatus: string
  objective: string | null
  // Meta returns daily_budget/lifetime_budget in the account currency's minor
  // unit (e.g. paise) — already divided by 100 here into major units.
  dailyBudget: number | null
  lifetimeBudget: number | null
  startTime: string | null
  stopTime: string | null
}

type MetaCampaignsPage = {
  data: Array<{
    id: string
    name: string
    effective_status: string
    objective?: string
    daily_budget?: string
    lifetime_budget?: string
    start_time?: string
    stop_time?: string
  }>
  paging?: { next?: string }
}

export async function listMetaCampaigns(accessToken: string, adAccountId: string): Promise<MetaCampaign[]> {
  const campaigns: MetaCampaign[] = []
  let url: string | undefined =
    `${GRAPH_BASE}/${adAccountId}/campaigns?${new URLSearchParams({
      fields: 'id,name,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time',
      limit: '200',
      access_token: accessToken,
    }).toString()}`

  while (url) {
    const page: MetaCampaignsPage = await fetchMetaJson<MetaCampaignsPage>(url)
    for (const c of page.data) {
      campaigns.push({
        id: c.id,
        name: c.name,
        effectiveStatus: c.effective_status,
        objective: c.objective ?? null,
        dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
        lifetimeBudget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
        startTime: c.start_time ?? null,
        stopTime: c.stop_time ?? null,
      })
    }
    url = page.paging?.next
  }

  return campaigns
}

export type MetaCampaignInsight = {
  spend: number
  leads: number
}

type MetaInsightsPage = {
  data: Array<{
    campaign_id: string
    spend?: string
    actions?: Array<{ action_type: string; value: string }>
  }>
  paging?: { next?: string }
}

// Meta's Insights endpoint (unlike the Campaign node) reports `spend` already
// in the account's major currency unit, not the minor-unit*100 used by budget
// fields — no /100 conversion here. Only campaigns with activity in the date
// range are returned, so callers should treat a missing campaign id as zero.
export async function getMetaCampaignInsights(
  accessToken: string,
  adAccountId: string
): Promise<Map<string, MetaCampaignInsight>> {
  const insights = new Map<string, MetaCampaignInsight>()
  let url: string | undefined =
    `${GRAPH_BASE}/${adAccountId}/insights?${new URLSearchParams({
      level: 'campaign',
      fields: 'campaign_id,spend,actions',
      date_preset: 'maximum',
      limit: '200',
      access_token: accessToken,
    }).toString()}`

  while (url) {
    const page: MetaInsightsPage = await fetchMetaJson<MetaInsightsPage>(url)
    for (const row of page.data) {
      const leads = (row.actions || [])
        .filter((a) => a.action_type.toLowerCase().includes('lead'))
        .reduce((sum, a) => sum + Number(a.value), 0)

      insights.set(row.campaign_id, {
        spend: row.spend ? parseFloat(row.spend) : 0,
        leads,
      })
    }
    url = page.paging?.next
  }

  return insights
}
