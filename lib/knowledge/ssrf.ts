import dns from 'node:dns/promises'

import ipaddr from 'ipaddr.js'

// Thrown for any URL we refuse to fetch server-side — callers should catch this
// specifically and surface `message` as a clean 400, not a generic 500.
export class UnsafeUrlError extends Error {}

const ALLOWED_PORTS = new Set(['', '80', '443'])

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')
}

// Allowlist, not a denylist: only a resolved-address range of "unicast" (ipaddr.js's
// default bucket for a normal public IP) is permitted. Every special range — private,
// loopback, linkLocal (which also covers the 169.254.169.254 cloud metadata address),
// uniqueLocal, reserved, carrierGradeNat, IPv6 tunnelling ranges, etc. — is blocked by
// construction, so a range we forgot to enumerate can't slip through.
function isPublicIp(rawIp: string): boolean {
  try {
    const addr = ipaddr.process(rawIp) // normalizes IPv4-mapped IPv6 (::ffff:127.0.0.1) etc.
    return addr.range() === 'unicast'
  } catch {
    return false
  }
}

function parseHttpUrl(rawUrl: string): URL {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new UnsafeUrlError('Enter a valid URL.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Only http:// or https:// URLs are allowed.')
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new UnsafeUrlError('Non-standard ports are not allowed.')
  }
  return url
}

/**
 * Validates a user-supplied (or redirect-target) URL is safe to fetch server-side:
 * public http(s) only, standard ports only, and — after DNS resolution — every
 * resolved address must be a public unicast IP. Must be called on the seed URL AND
 * again for every URL the crawler actually fetches, since a same-domain page can
 * still redirect to an internal host.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  const url = parseHttpUrl(rawUrl)

  if (isBlockedHostname(url.hostname)) {
    throw new UnsafeUrlError('This host is not allowed.')
  }

  if (ipaddr.isValid(url.hostname)) {
    if (!isPublicIp(url.hostname)) {
      throw new UnsafeUrlError('This address is not allowed.')
    }
    return url
  }

  let addresses: string[]
  try {
    const results = await dns.lookup(url.hostname, { all: true, verbatim: true })
    addresses = results.map((r) => r.address)
  } catch {
    throw new UnsafeUrlError('Could not resolve this host.')
  }

  if (addresses.length === 0 || !addresses.every(isPublicIp)) {
    throw new UnsafeUrlError('This host resolves to a blocked or unreachable address.')
  }

  return url
}
