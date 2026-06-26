require('dotenv').config()

const http = require('http')
const express = require('express')
const WebSocket = require('ws')

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const NEXORA_APP_URL = process.env.NEXORA_APP_URL
const CALLING_SERVER_SECRET = process.env.CALLING_SERVER_SECRET
const PORT = process.env.PORT || 8080

if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required')
if (!NEXORA_APP_URL) throw new Error('NEXORA_APP_URL is required')
if (!CALLING_SERVER_SECRET) throw new Error('CALLING_SERVER_SECRET is required')

const app = express()
app.get('/health', (_, res) => res.json({ ok: true, service: 'nexora-calling-server' }))

const server = http.createServer(app)
const wss = new WebSocket.Server({ server, path: '/stream' })

wss.on('connection', (twilioWs, req) => {
  const url = new URL(req.url, 'http://x')
  const callId = url.searchParams.get('callId') || null
  const leadName = url.searchParams.get('name') || 'Sir/Madam'
  const eventType = formatEventType(url.searchParams.get('eventType') || 'event')
  const propertyName = url.searchParams.get('propertyName') || 'our venue'
  const eventDate = url.searchParams.get('eventDate') || null

  console.log(`[call:${callId}] New Twilio connection — lead: ${leadName}`)

  let streamSid = null
  let audioBuffer = []
  const transcript = []
  let outcomeReported = false

  // ── Open OpenAI Realtime WebSocket ──────────────────────────────────────────
  const openaiWs = new WebSocket(
    'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    }
  )

  openaiWs.on('open', () => {
    console.log(`[call:${callId}] ✅ OpenAI Realtime connected — sending session.update`)

    openaiWs.send(JSON.stringify({
      type: 'session.update',
      session: {
        input_audio_format: 'g711_ulaw',
        output_audio_format: 'g711_ulaw',
        voice: 'shimmer',
        instructions: buildInstructions({ leadName, eventType, propertyName, eventDate }),
        tools: [outcomeReportTool],
        tool_choice: 'auto',
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 700,
          create_response: true,
        },
        modalities: ['audio', 'text'],
      },
    }))
    console.log(`[call:${callId}] session.update sent`)
  })

  // ── OpenAI → Twilio ─────────────────────────────────────────────────────────
  let audioDeltaCount = 0

  openaiWs.on('message', (raw) => {
    let event
    try { event = JSON.parse(raw) } catch { return }

    // Log every event type (skip noisy media chunks after first 5 audio deltas)
    if (event.type !== 'response.audio.delta' || audioDeltaCount <= 5) {
      console.log(`[call:${callId}] OpenAI event: ${event.type}${event.error ? ' — ' + JSON.stringify(event.error) : ''}`)
    }

    // Session is ready — trigger Priya's opening line
    if (event.type === 'session.updated') {
      console.log(`[call:${callId}] ✅ session.updated received — sending response.create`)
      openaiWs.send(JSON.stringify({ type: 'response.create' }))
    }

    // Stream AI audio back to the lead's phone — buffer if streamSid not yet set
    if (event.type === 'response.audio.delta' && event.delta) {
      audioDeltaCount++
      if (!streamSid) {
        audioBuffer.push(event.delta)
        if (audioDeltaCount <= 5 || audioDeltaCount % 20 === 0) {
          console.log(`[call:${callId}] 🔵 Audio delta #${audioDeltaCount} buffered (no streamSid yet) — buffer size: ${audioBuffer.length}`)
        }
      } else {
        if (audioDeltaCount <= 5) {
          console.log(`[call:${callId}] 🟢 Audio delta #${audioDeltaCount} sent to Twilio`)
        }
        twilioWs.send(JSON.stringify({ event: 'media', streamSid, media: { payload: event.delta } }))
      }
    }

    if (event.type === 'response.audio.done') {
      console.log(`[call:${callId}] 🏁 OpenAI audio done — total deltas: ${audioDeltaCount}`)
    }

    // Collect transcript
    if (event.type === 'response.audio_transcript.done' && event.transcript) {
      console.log(`[call:${callId}] 🗣️  Priya said: "${event.transcript}"`)
      transcript.push({ role: 'assistant', content: event.transcript, ts: Date.now() })
    }
    if (
      event.type === 'conversation.item.input_audio_transcription.completed' &&
      event.transcript
    ) {
      console.log(`[call:${callId}] 👤 Lead said: "${event.transcript}"`)
      transcript.push({ role: 'user', content: event.transcript, ts: Date.now() })
    }

    // Outcome function call from the AI
    if (
      event.type === 'response.function_call_arguments.done' &&
      event.name === 'report_outcome'
    ) {
      try {
        const outcome = JSON.parse(event.arguments)
        console.log(`[call:${callId}] Outcome reported:`, outcome.outcome, outcome.qualifiedScore)
        outcomeReported = true
        reportOutcomeToNexora(callId, outcome, transcript)
      } catch (e) {
        console.error(`[call:${callId}] Failed to parse outcome:`, e)
      }
    }

    if (event.type === 'error') {
      console.error(`[call:${callId}] ❌ OpenAI error:`, JSON.stringify(event.error))
    }
  })

  openaiWs.on('close', (code, reason) => {
    console.log(`[call:${callId}] OpenAI Realtime disconnected — code: ${code}, reason: ${reason?.toString() || 'none'}`)
    if (!outcomeReported && callId) {
      reportOutcomeToNexora(
        callId,
        { outcome: 'UNKNOWN', qualifiedScore: 0, notes: 'Call ended before qualification completed' },
        transcript
      )
    }
  })

  openaiWs.on('error', (err) => {
    console.error(`[call:${callId}] ❌ OpenAI WS error:`, err.message)
  })

  // ── Twilio → OpenAI ─────────────────────────────────────────────────────────
  twilioWs.on('message', (raw) => {
    let event
    try { event = JSON.parse(raw) } catch { return }

    if (event.event === 'connected') {
      console.log(`[call:${callId}] 📞 Twilio connected event received`)
    }

    if (event.event === 'start') {
      streamSid = event.start.streamSid
      console.log(`[call:${callId}] ✅ Twilio stream started — SID: ${streamSid}, buffered chunks to flush: ${audioBuffer.length}`)
      if (audioBuffer.length > 0) {
        audioBuffer.forEach(delta => {
          twilioWs.send(JSON.stringify({ event: 'media', streamSid, media: { payload: delta } }))
        })
        console.log(`[call:${callId}] 🟢 Flushed ${audioBuffer.length} buffered audio chunks to Twilio`)
        audioBuffer = []
      } else {
        console.log(`[call:${callId}] ⚠️  No buffered audio to flush — OpenAI may not have responded yet`)
      }
    }

    if (event.event === 'media' && openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: event.media.payload,
      }))
    }

    if (event.event === 'stop') {
      console.log(`[call:${callId}] Stream stopped`)
      if (openaiWs.readyState === WebSocket.OPEN) openaiWs.close()
    }
  })

  twilioWs.on('close', () => {
    console.log(`[call:${callId}] Twilio disconnected`)
    if (openaiWs.readyState === WebSocket.OPEN) openaiWs.close()
  })

  twilioWs.on('error', (err) => {
    console.error(`[call:${callId}] Twilio WS error:`, err.message)
  })
})

// ── Helpers ──────────────────────────────────────────────────────────────────

async function reportOutcomeToNexora(callId, outcome, transcript) {
  if (!callId) return
  try {
    const res = await fetch(`${NEXORA_APP_URL}/api/ai-calls/${callId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-calling-server-secret': CALLING_SERVER_SECRET,
      },
      body: JSON.stringify({ ...outcome, transcript }),
    })
    if (!res.ok) {
      const text = await res.text()
      console.error(`[reportOutcome:${callId}] Nexora API ${res.status}:`, text)
    }
  } catch (e) {
    console.error(`[reportOutcome:${callId}] Failed:`, e.message)
  }
}

function formatEventType(raw) {
  return raw.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

function buildInstructions({ leadName, eventType, propertyName, eventDate }) {
  const dateClause = eventDate ? ` on ${eventDate}` : ''
  return `You are Priya, a warm and professional banquet coordinator calling from ${propertyName}.

You are calling ${leadName} who submitted an enquiry about a ${eventType}${dateClause}.

LANGUAGE: Speak naturally in Hinglish (Hindi + English mix, as Indians speak on phone). Switch fully to English if the lead responds only in English.

OPENING LINE: "Hello, ${leadName} ji? Main Priya bol rahi hoon ${propertyName} se. Aapne hamare banquet ke liye enquiry ki thi — kya abhi 2-3 minute baat kar sakte hain?"

QUALIFICATION FLOW (natural conversation, not like filling a form):
1. Confirm they submitted the enquiry and are available to talk
2. Ask event date: "Kab ka plan kar rahe hain?"
3. Ask guest count: "Approximately kitne guests expect kar rahe hain?"
4. Ask budget: "Budget-wise roughly kya soch rahe hain?"
5. Check decision maker: "Aap hi final decision lenge ya family ke saath discuss hoga?"
6. If interested — wrap up warmly: "Bahut accha! Main aapko abhi WhatsApp pe venue photos, packages aur pricing send kar rahi hoon. Aur hamare senior team member aapko ek ghante ke andar call karenge detailed discussion ke liye."

KEY RULES:
- Be warm, natural — never robotic or pushy
- Max call duration: 3 minutes — qualify quickly then end
- If they say busy: "Koi baat nahi — kab call karoon? Subah ya shaam?"
- If not interested: "Bilkul samajh aata hai. Thank you for your time. Have a great day!"
- If wrong number: Apologise and end immediately
- You MUST call report_outcome before saying goodbye on EVERY call.`
}

const outcomeReportTool = {
  type: 'function',
  name: 'report_outcome',
  description:
    'Report the qualification outcome. Call this at the end of EVERY call before saying goodbye.',
  parameters: {
    type: 'object',
    properties: {
      outcome: {
        type: 'string',
        enum: ['QUALIFIED', 'NOT_QUALIFIED', 'CALLBACK', 'WRONG_NUMBER', 'VOICEMAIL', 'UNKNOWN'],
      },
      qualifiedScore: {
        type: 'number',
        description: '0–100. 100 = very interested with clear requirements.',
      },
      eventDate: { type: 'string', description: 'YYYY-MM-DD or null' },
      guestCount: { type: 'number', description: 'Guest count or null' },
      budgetRange: { type: 'string', description: 'e.g. "5-7 lakhs" or null' },
      callbackTime: { type: 'string', description: 'When they want callback — for CALLBACK outcome' },
      notes: { type: 'string', description: 'Brief 1-2 sentence summary' },
    },
    required: ['outcome', 'qualifiedScore', 'notes'],
  },
}

server.listen(PORT, () => {
  console.log(`Nexora calling server running on port ${PORT}`)
})
