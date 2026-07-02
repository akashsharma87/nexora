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
