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
  const wsParams = new URLSearchParams({ callId, name, eventType, propertyName })
  if (eventDate) wsParams.set('eventDate', eventDate)

  const wsUrl = `wss://${host}/stream?${wsParams}`

  console.log(`[twiml] wsUrl=${wsUrl}`)

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" />
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
