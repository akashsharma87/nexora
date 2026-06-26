import { NextRequest, NextResponse } from 'next/server'

// Twilio fetches this URL when the lead answers the call.
// We return TwiML that opens a bidirectional audio stream to the calling server.
export async function POST(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const callId = p.get('callId') ?? ''
  const name = p.get('name') ?? ''
  const eventType = p.get('eventType') ?? ''
  const propertyName = p.get('propertyName') ?? ''
  const eventDate = p.get('eventDate') ?? ''

  const callingServerUrl = process.env.CALLING_SERVER_URL
  if (!callingServerUrl) {
    return new NextResponse('CALLING_SERVER_URL not configured', { status: 500 })
  }

  // Build WebSocket URL with lead context so calling-server can personalise the prompt
  const wsParams = new URLSearchParams({ callId, name, eventType, propertyName })
  if (eventDate) wsParams.set('eventDate', eventDate)

  const wsUrl = `${callingServerUrl.replace(/^http/, 'ws')}/stream?${wsParams}`

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
