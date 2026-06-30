import { NextRequest, NextResponse } from 'next/server'

function buildTwiml(request: NextRequest): NextResponse {
  const p = request.nextUrl.searchParams
  const callId = p.get('callId') ?? ''
  const name = p.get('name') ?? ''
  const eventType = p.get('eventType') ?? ''
  const propertyName = p.get('propertyName') ?? ''
  const eventDate = p.get('eventDate') ?? ''

  console.log(`[twiml] ${request.method} hit — callId=${callId} lead="${name}"`)

  const callingServerUrl = process.env.CALLING_SERVER_URL
  if (!callingServerUrl) {
    console.error('[twiml] CALLING_SERVER_URL not configured')
    return new NextResponse('CALLING_SERVER_URL not configured', { status: 500 })
  }

  const host = callingServerUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const wsUrl = `wss://${host}/stream`

  console.log(`[twiml] wsUrl=${wsUrl}`)

  const xmlEsc = (v: string) =>
    v
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

  // Lead context is passed via <Parameter> child elements — Twilio does not
  // reliably forward query strings on the Stream URL.
  const params: [string, string][] = [
    ['callId', callId],
    ['name', name],
    ['eventType', eventType],
    ['propertyName', propertyName],
  ]
  if (eventDate) params.push(['eventDate', eventDate])
  const paramXml = params
    .map(([k, v]) => `<Parameter name="${k}" value="${xmlEsc(v)}" />`)
    .join('')

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}">${paramXml}</Stream>
  </Connect>
</Response>`

  return new NextResponse(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

// Handle both GET and POST — Twilio may use either depending on the `method` param
export async function GET(request: NextRequest) {
  return buildTwiml(request)
}

export async function POST(request: NextRequest) {
  return buildTwiml(request)
}
