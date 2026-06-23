import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/access'
import { WATI_TEMPLATES } from '@/lib/whatsapp'

// GET /api/whatsapp/diagnose?phone=91XXXXXXXXXX
// Systematically tests different token formats and endpoint paths to find what works.
export async function GET(request: NextRequest) {
  const { error } = await requireSession()
  if (error) return error

  const watiUrl = process.env.WATI_API_URL
  const watiKey = process.env.WATI_API_KEY
  const testPhone = new URL(request.url).searchParams.get('phone')
  const testTemplate = WATI_TEMPLATES.INITIAL_RESPONSE

  if (!watiUrl || !watiKey) {
    return NextResponse.json({ configured: false, error: 'WATI_API_URL and WATI_API_KEY not set' })
  }

  // Wati tokens are formatted as "wati_{uuid}.{actual_jwt}"
  // Try both: the full token and just the JWT part after the dot
  const jwtOnly = watiKey.includes('.') ? watiKey.split('.').slice(1).join('.') : watiKey
  const tokenVariants: { label: string; value: string }[] = [
    { label: 'full_token_bearer', value: `Bearer ${watiKey}` },
    { label: 'jwt_only_bearer', value: `Bearer ${jwtOnly}` },
    { label: 'full_token_no_bearer', value: watiKey },
    { label: 'jwt_only_no_bearer', value: jwtOnly },
  ]

  const results: Record<string, unknown> = {
    watiUrl,
    templateNameInCode: testTemplate,
    fullToken: watiKey.slice(0, 30) + '...',
    jwtOnlyToken: jwtOnly.slice(0, 30) + '...',
    testPhone: testPhone || 'not provided',
  }

  if (!testPhone) {
    results.hint = 'Add ?phone=91XXXXXXXXXX to run send tests'
    return NextResponse.json(results)
  }

  // Test each token variant against both v1 and v2 sendTemplateMessage
  const endpointVariants = [
    `/api/v2/sendTemplateMessage?whatsappNumber=${testPhone}`,
    `/api/v1/sendTemplateMessage?whatsappNumber=${testPhone}`,
    `/api/v1/sendTemplateMessages?whatsappNumber=${testPhone}`,
    `/api/v2/sendTemplateMessages?whatsappNumber=${testPhone}`,
  ]

  const body = JSON.stringify({
    template_name: testTemplate,
    broadcast_name: `nexora_diagnose`,
    parameters: [
      { name: '1', value: 'Test' },
      { name: '2', value: 'Test Hotel' },
    ],
  })

  for (const { label, value: authHeader } of tokenVariants) {
    const headers = { 'Content-Type': 'application/json', Authorization: authHeader }
    results[`--- token: ${label} ---`] = '↓'

    for (const endpoint of endpointVariants) {
      try {
        const res = await fetch(`${watiUrl}${endpoint}`, { method: 'POST', headers, body })
        const text = await res.text()
        const isHtml = text.trimStart().startsWith('<')
        results[`${label} | ${endpoint}`] = {
          status: res.status,
          isHtml,
          response: isHtml ? '(HTML)' : text.slice(0, 300),
        }
        // If we get a non-405 non-HTML response, this combination might work
        if (res.status !== 405 && !isHtml) {
          results['WORKING_COMBINATION'] = { authHeader: label, endpoint, status: res.status, response: text.slice(0, 300) }
        }
      } catch (err) {
        results[`${label} | ${endpoint}`] = { error: err instanceof Error ? err.message : 'failed' }
      }
    }
  }

  // Try app.wati.io as an alternative base URL (some accounts use this instead of live-XXXXX)
  const altBases = ['https://app.wati.io', 'https://live-mt-server.wati.io']
  for (const base of altBases) {
    const endpoint = `/api/v1/sendTemplateMessage?whatsappNumber=${testPhone}`
    try {
      const res = await fetch(`${base}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${watiKey}` },
        body,
      })
      const text = await res.text()
      const isHtml = text.trimStart().startsWith('<')
      results[`ALT BASE: POST ${base}${endpoint}`] = {
        status: res.status,
        isHtml,
        response: isHtml ? '(HTML)' : text.slice(0, 300),
      }
      if (res.status !== 405 && !isHtml) {
        results['WORKING_BASE_URL'] = base
      }
    } catch (err) {
      results[`ALT BASE: ${base}`] = { error: err instanceof Error ? err.message : 'failed' }
    }
  }

  return NextResponse.json(results)
}
