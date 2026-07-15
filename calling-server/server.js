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

// Catch-all to log every HTTP request hitting the server
app.use((req, res, next) => {
  console.log(`[http] ${req.method} ${req.url}`)
  next()
})

const server = http.createServer(app)

// Log every WebSocket upgrade attempt before the ws library handles it
server.on('upgrade', (req) => {
  console.log(`[ws-upgrade] path="${req.url}" from=${req.headers['x-forwarded-for'] || req.socket.remoteAddress} upgrade="${req.headers['upgrade']}"`)
})

const wss = new WebSocket.Server({
  server,
  path: '/stream',
  verifyClient: ({ req }, cb) => {
    console.log(`[ws-verify] accepting connection — path="${req.url}"`)
    cb(true)
  },
})

wss.on('connection', (twilioWs, req) => {
  // Params arrive via <Parameter> child elements in Twilio's `start` event
  // (customParameters). Twilio does not reliably forward query strings on the
  // Stream URL, so the query string below is only a fallback.
  const url = new URL(req.url, 'http://x')
  let callId = url.searchParams.get('callId') || null
  let leadName = firstNameOf(url.searchParams.get('name') || 'Sir/Madam')
  let eventType = formatEventType(url.searchParams.get('eventType') || 'event')
  let propertyName = url.searchParams.get('propertyName') || 'our venue'
  let eventDate = url.searchParams.get('eventDate') || null
  let sourceTab = url.searchParams.get('sourceTab') || null
  let guestCount = url.searchParams.get('guestCount') ? Number(url.searchParams.get('guestCount')) : null
  let budgetMin = url.searchParams.get('budgetMin') ? Number(url.searchParams.get('budgetMin')) : null
  let budgetMax = url.searchParams.get('budgetMax') ? Number(url.searchParams.get('budgetMax')) : null
  // The PROPERTY's country (not the lead's) — a property's leads are overwhelmingly from one
  // region, so this is set once at the client-profile level (see prisma Property.country) rather
  // than looked up per lead. Drives Priya's default language below (India → Hinglish, else →
  // English). Defaults to India to match Property.country's schema default.
  let country = url.searchParams.get('country') || 'India'
  // Lets this server fetch the property's Knowledge Base key facts itself (see
  // fetchKnowledgeFacts below) rather than trying to pass the facts through a <Parameter>.
  let propertyId = url.searchParams.get('propertyId') || null

  console.log(`[call:${callId}] New Twilio connection — lead: ${leadName}`)

  let streamSid = null
  let audioBuffer = []
  const transcript = []
  let outcomeReported = false
  let openaiReady = false
  let started = false
  let sessionConfigured = false
  let responseActive = false // true while OpenAI is generating a response (for barge-in)
  let pendingHangup = false  // report_outcome fired → hang up once goodbye finishes playing
  let hangupMarkSent = false
  let hangupForceTimer = null // force-close safety net; tracked so a barge-in can cancel it
  let responseCreateSent = false // guards the opening response.create against double-send
  const HANGUP_MARK = 'nexora-hangup'
  // Knowledge Base key facts (see fetchKnowledgeFacts below). knowledgeFactsReady gates
  // configureSession the same way `started` does — set true either once the fetch settles
  // (success, miss, or its own timeout) or immediately if there's no propertyId at all, so a
  // property with no knowledge base never waits on anything.
  let knowledgeFacts = null
  let knowledgeFactsReady = false

  // ── Open OpenAI Realtime WebSocket ──────────────────────────────────────────
  // Reverted from gpt-realtime-2.1 back to gpt-realtime: 2.1 had a much stronger
  // American-accent bias that the Indian-accent instruction couldn't override, and
  // it also drifted into English on its own. gpt-realtime holds the Indian Hinglish
  // delivery far better. NOTE: gpt-realtime does NOT accept the `reasoning` param
  // (rejects with "Unsupported option for this model") — so it must not be sent below.
  const openaiWs = new WebSocket(
    'wss://api.openai.com/v1/realtime?model=gpt-realtime',
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
    }
  )

  // Send session.update only once the OpenAI socket is open, Twilio's `start` event has
  // delivered the lead params (so instructions have the name), AND the knowledge-facts fetch
  // has settled (or had nothing to fetch). In practice the facts fetch — one fast indexed read
  // on the same Railway infra, capped at 2.5s — resolves well before the OpenAI socket finishes
  // its handshake, so this adds no real-world latency; it only bounds the worst case.
  function configureSession() {
    if (!openaiReady || !started || !knowledgeFactsReady || sessionConfigured) return
    sessionConfigured = true
    console.log(`[call:${callId}] Configuring session — lead: ${leadName}, event: ${eventType}`)

    // GA Realtime session shape (gpt-realtime). The old flat shape
    // (input_audio_format/output_audio_format/voice/modalities/turn_detection at
    // the top level) is rejected with "Missing required parameter: 'session.type'".
    // g711 μ-law maps to the GA format type "audio/pcmu".
    openaiWs.send(JSON.stringify({
      type: 'session.update',
      session: {
        type: 'realtime',
        output_modalities: ['audio'],
        instructions: buildInstructions({ leadName, eventType, propertyName, eventDate, sourceTab, guestCount, budgetMin, budgetMax, country, knowledgeFacts }),
        // NOTE: do NOT add a `reasoning` param here — gpt-realtime rejects it
        // ("Unsupported option for this model"), which would fail the whole
        // session.update and leave the call silent. It's a gpt-realtime-2.1-only option.
        tools: [outcomeReportTool],
        tool_choice: 'auto',
        audio: {
          input: {
            format: { type: 'audio/pcmu' },
            transcription: { model: 'whisper-1' },
            // Handset audio is close-talking → near_field cleans background noise
            // so VAD triggers on real speech, not line hiss (steadier barge-in).
            noise_reduction: { type: 'near_field' },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
              create_response: true,
              interrupt_response: true, // stop Priya's response the moment the lead speaks
            },
          },
          output: {
            format: { type: 'audio/pcmu' },
            voice: getVoice(country), // marin for English tiers; coral for Hinglish — see getVoice
          },
        },
      },
    }))
    console.log(`[call:${callId}] session.update sent`)

    // Pipeline response.create right behind session.update on the same ordered
    // socket instead of waiting for the session.updated ack to come back first.
    // OpenAI processes events on a connection strictly in the order sent, so the
    // session is already applied by the time response.create is handled — waiting
    // for the round-trip ack was adding a full extra network hop of dead air
    // before Priya's first word.
    maybeSendResponseCreate()
  }

  function maybeSendResponseCreate() {
    if (responseCreateSent) return
    responseCreateSent = true
    openaiWs.send(JSON.stringify({ type: 'response.create' }))
    console.log(`[call:${callId}] response.create sent`)
  }

  // Parse + report the report_outcome tool call, at most once per call. This is
  // Priya's final action — it also arms the hang-up so the call ends after her
  // goodbye finishes playing (instead of sitting silent waiting for the lead).
  function handleOutcomeCall(rawArgs) {
    if (!outcomeReported) {
      try {
        const outcome = JSON.parse(rawArgs)
        console.log(`[call:${callId}] Outcome reported:`, outcome.outcome, outcome.qualifiedScore)
        outcomeReported = true
        reportOutcomeToNexora(callId, outcome, transcript)
      } catch (e) {
        console.error(`[call:${callId}] Failed to parse outcome:`, e)
      }
    }
    // Arm the hang-up EVERY time report_outcome fires — even if the outcome was already
    // reported on an earlier wrap-up that the lead then interrupted (see the barge-in abort
    // below). Otherwise, after re-engaging, a second goodbye would never actually hang up.
    pendingHangup = true
    maybeSendHangupMark()
  }

  // End the media stream. With <Connect><Stream>, closing the socket ends the
  // stream and — since no TwiML follows <Connect> — Twilio hangs up the call.
  function endCall() {
    if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close()
    if (openaiWs.readyState === WebSocket.OPEN) openaiWs.close()
  }

  // Once the goodbye response is fully generated, drop a Twilio `mark` after the
  // last audio chunk. Twilio echoes the mark back only after it has PLAYED up to
  // that point — so we hang up when the caller has actually heard the goodbye,
  // not when we merely finished sending it (audio is buffered ahead on Twilio).
  function maybeSendHangupMark() {
    if (!pendingHangup || hangupMarkSent || !streamSid) return
    if (responseActive) return // goodbye still generating — wait for response.done
    hangupMarkSent = true
    twilioWs.send(JSON.stringify({ event: 'mark', streamSid, mark: { name: HANGUP_MARK } }))
    console.log(`[call:${callId}] 👋 Goodbye done — mark placed, hanging up once played`)
    // Safety net: if Twilio never echoes the mark, force-close anyway. Tracked so a
    // barge-in that aborts the hang-up (see speech_started below) can cancel it.
    hangupForceTimer = setTimeout(() => {
      if (twilioWs.readyState === WebSocket.OPEN) {
        console.log(`[call:${callId}] ⏱️  Hangup mark not echoed — force closing`)
        endCall()
      }
    }, 8000)
  }

  openaiWs.on('open', () => {
    console.log(`[call:${callId}] ✅ OpenAI Realtime connected`)
    openaiReady = true
    configureSession()
  })

  // ── OpenAI → Twilio ─────────────────────────────────────────────────────────
  let audioDeltaCount = 0

  openaiWs.on('message', (raw) => {
    let event
    try { event = JSON.parse(raw) } catch { return }

    // Log every event type (skip noisy media chunks after first 5 audio deltas)
    if (event.type !== 'response.output_audio.delta' || audioDeltaCount <= 5) {
      console.log(`[call:${callId}] OpenAI event: ${event.type}${event.error ? ' — ' + JSON.stringify(event.error) : ''}`)
    }

    // Confirms the session was applied. response.create is no longer sent here —
    // it's fired immediately after session.update instead (see configureSession)
    // to avoid an extra round-trip of dead air. This is kept as a safety-net fallback,
    // guarded by responseCreateSent, in case configureSession's own send somehow didn't fire.
    if (event.type === 'session.updated') {
      console.log(`[call:${callId}] ✅ session.updated received`)
      maybeSendResponseCreate()
    }

    // Track whether Priya is currently speaking (for barge-in).
    if (event.type === 'response.created') responseActive = true
    if (event.type === 'response.done') {
      responseActive = false
      maybeSendHangupMark() // if goodbye just finished, arm the hang-up
    }

    // BARGE-IN: the lead started talking over Priya. Server VAD fires this the
    // instant it hears speech. We must (1) flush the audio Twilio has already
    // buffered — OpenAI streams faster than real-time, so seconds of Priya's
    // speech are queued on Twilio's side and would otherwise keep playing — and
    // (2) cancel the in-progress OpenAI response so she stops generating.
    if (event.type === 'input_audio_buffer.speech_started') {
      audioBuffer = [] // drop anything not yet forwarded to Twilio
      if (streamSid) {
        twilioWs.send(JSON.stringify({ event: 'clear', streamSid }))
      }
      if (responseActive) {
        openaiWs.send(JSON.stringify({ type: 'response.cancel' }))
        console.log(`[call:${callId}] ✋ Barge-in — cleared Twilio audio + cancelled response`)
      }
      // The lead spoke up just as we were about to hang up — most importantly, mid-goodbye
      // or right after it. They clearly want to keep talking, so ABORT the pending hang-up
      // instead of cutting them off. Reset the hang-up state (the `clear` above already
      // discarded any queued hangup mark on Twilio's side) and cancel the force-close timer.
      // Server VAD will auto-create Priya's next response once they finish speaking; she'll
      // only hang up again after she gives a fresh goodbye and re-calls report_outcome.
      if (pendingHangup) {
        pendingHangup = false
        hangupMarkSent = false
        if (hangupForceTimer) { clearTimeout(hangupForceTimer); hangupForceTimer = null }
        console.log(`[call:${callId}] 🔄 Barge-in during pending hang-up — aborting hang-up, re-engaging`)
      }
    }

    // Stream AI audio back to the lead's phone — buffer if streamSid not yet set
    if (event.type === 'response.output_audio.delta' && event.delta) {
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

    if (event.type === 'response.output_audio.done') {
      console.log(`[call:${callId}] 🏁 OpenAI audio done — total deltas: ${audioDeltaCount}`)
    }

    // Collect transcript
    if (event.type === 'response.output_audio_transcript.done' && event.transcript) {
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

    // Outcome function call from the AI. GA delivers this via
    // response.function_call_arguments.done (carries name + arguments); some turns
    // only surface it on response.output_item.done as a function_call item.
    // handleOutcomeCall() is guarded so we report at most once.
    if (
      event.type === 'response.function_call_arguments.done' &&
      event.name === 'report_outcome'
    ) {
      handleOutcomeCall(event.arguments)
    }
    if (
      event.type === 'response.output_item.done' &&
      event.item?.type === 'function_call' &&
      event.item?.name === 'report_outcome'
    ) {
      handleOutcomeCall(event.item.arguments)
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

      // Lead params delivered via <Parameter> elements land here.
      const cp = event.start.customParameters || {}
      if (cp.callId) callId = cp.callId
      if (cp.name) leadName = firstNameOf(cp.name)
      if (cp.eventType) eventType = formatEventType(cp.eventType)
      if (cp.propertyName) propertyName = cp.propertyName
      if (cp.eventDate) eventDate = cp.eventDate
      if (cp.sourceTab) sourceTab = cp.sourceTab
      if (cp.guestCount) guestCount = Number(cp.guestCount)
      if (cp.budgetMin) budgetMin = Number(cp.budgetMin)
      if (cp.budgetMax) budgetMax = Number(cp.budgetMax)
      if (cp.country) country = cp.country
      if (cp.propertyId) propertyId = cp.propertyId
      started = true

      // Kick the knowledge-facts fetch the moment propertyId is known, in parallel with the
      // OpenAI socket opening — see the knowledgeFactsReady comment above configureSession.
      if (propertyId) {
        fetchKnowledgeFacts(propertyId)
          .then((facts) => { knowledgeFacts = facts })
          .catch(() => { knowledgeFacts = null })
          .finally(() => {
            knowledgeFactsReady = true
            configureSession()
          })
      } else {
        knowledgeFactsReady = true
      }

      console.log(`[call:${callId}] ✅ Twilio stream started — SID: ${streamSid}, lead: ${leadName}, buffered chunks: ${audioBuffer.length}`)
      configureSession()

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

    // Twilio echoes our hang-up mark once the goodbye audio has finished playing.
    if (event.event === 'mark' && event.mark?.name === HANGUP_MARK) {
      console.log(`[call:${callId}] ✅ Goodbye played — ending call`)
      endCall()
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

// Process-lifetime cache — same property is often called repeatedly in a short window
// (bulk-trigger campaigns), so this avoids re-fetching on every single call.
const KNOWLEDGE_FACTS_CACHE_TTL_MS = 10 * 60 * 1000
const knowledgeFactsCache = new Map() // propertyId -> { facts, ts }

// Fetches this property's Knowledge Base key facts from the main Nexora app (see
// GET /api/internal/knowledge-facts), guarded by the same shared secret used for the outcome
// callback above. Never throws and never blocks a call for long: 2.5s timeout, resolves to
// null on any miss/error/timeout so a call always proceeds — with or without venue context.
async function fetchKnowledgeFacts(propertyId) {
  const cached = knowledgeFactsCache.get(propertyId)
  if (cached && Date.now() - cached.ts < KNOWLEDGE_FACTS_CACHE_TTL_MS) {
    return cached.facts
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2500)
  try {
    const res = await fetch(
      `${NEXORA_APP_URL}/api/internal/knowledge-facts?propertyId=${encodeURIComponent(propertyId)}`,
      {
        headers: { 'x-calling-server-secret': CALLING_SERVER_SECRET },
        signal: controller.signal,
      }
    )
    if (!res.ok) return null
    const body = await res.json()
    const facts = Array.isArray(body.facts) ? body.facts : null
    knowledgeFactsCache.set(propertyId, { facts, ts: Date.now() })
    return facts
  } catch (e) {
    console.error(`[knowledge-facts:${propertyId}] fetch failed:`, e.message)
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Renders key facts as a grouped bullet list for the prompt — e.g.:
//   Event Spaces:
//   - Grand Ballroom seats 400 / 700 floating.
function renderKnowledgeFacts(facts) {
  if (!Array.isArray(facts) || facts.length === 0) return null
  const byCategory = new Map()
  for (const f of facts) {
    if (!f || typeof f.fact !== 'string' || !f.fact.trim()) continue
    const category = typeof f.category === 'string' && f.category.trim() ? f.category.trim() : 'Overview'
    if (!byCategory.has(category)) byCategory.set(category, [])
    byCategory.get(category).push(f.fact.trim())
  }
  if (byCategory.size === 0) return null
  return Array.from(byCategory.entries())
    .map(([category, items]) => `${category}:\n${items.map((i) => `- ${i}`).join('\n')}`)
    .join('\n')
}

function formatEventType(raw) {
  return raw.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

// Leads are stored as full names (e.g. "Abhinav Jha") — Priya should only ever
// address them by their first name, never the surname, and never verbatim as
// stored if it has multiple words.
function firstNameOf(fullName) {
  const first = fullName.trim().split(/\s+/)[0]
  return first || fullName
}

// A lead from a "Presidential Suite" tab wants to book a personal room stay, not host a
// banquet — asking them "how many guests for your event" makes no sense. Detected from the
// sheet-tab name only (kept local to the calling script; does not touch the CRM's EventType
// taxonomy or any other feature) since tab names already describe the enquiry in plain words.
function isRoomStayInquiry(tabName) {
  if (!tabName) return false
  const l = tabName.toLowerCase()
  return l.includes('suite') || l.includes('room') || l.includes('stay') || l.includes('accommodation')
}

// Lakhs, matching the "Budget Min/Max (L)" fields in the CRM's lead form.
function formatBudgetLabel(min, max) {
  const hasMin = typeof min === 'number' && min > 0
  const hasMax = typeof max === 'number' && max > 0
  if (hasMin && hasMax) return `₹${min}–${max} lakhs`
  if (hasMax) return `up to ₹${max} lakhs`
  if (hasMin) return `₹${min}+ lakhs`
  return null
}

// Countries with a large Indian-diaspora hospitality clientele — leads there skew toward
// English as the call language, but land better with a warm Indian-English accent lean
// (vs. a fully neutral/Western accent) and may still slip into Hindi/Hinglish themselves.
// Free text list, matched case-insensitively — same convention as Property.country.
// NOTE: this list is a starting assumption, not a confirmed business rule — adjust as needed.
const INDIAN_ACCENT_ENGLISH_COUNTRIES = new Set([
  'uae', 'united arab emirates', 'saudi arabia', 'qatar', 'kuwait', 'oman', 'bahrain',
  'nepal', 'bhutan', 'sri lanka', 'bangladesh', 'singapore', 'malaysia', 'maldives', 'mauritius',
])

// Three-tier language/accent selection, driven by the property's country:
// - HINGLISH: India (default) — full Hinglish persona, Indian accent.
// - INDIAN_ACCENT_ENGLISH: countries with heavy Indian-diaspora clientele — English by
//   default, but with an Indian-English accent lean and willingness to mirror Hindi.
// - NEUTRAL_ENGLISH: everywhere else — plain English, neutral accent, no Hindi.
function getLanguageTier(country) {
  const normalized = (country || '').trim().toLowerCase()
  if (!normalized || normalized === 'india') return 'HINGLISH'
  if (INDIAN_ACCENT_ENGLISH_COUNTRIES.has(normalized)) return 'INDIAN_ACCENT_ENGLISH'
  return 'NEUTRAL_ENGLISH'
}

// Voice is chosen per language tier. `marin` is the most natural voice for the English tiers,
// but on the Hinglish tier it came across as over-sweet/uncanny on Hindi words (team feedback),
// so Hinglish uses `coral` (warmer, more grounded). Both are confirmed-valid gpt-realtime voices;
// picking an invalid name would fail session.update and leave the call silent, so only ever use
// names verified against the account. English tiers deliberately keep marin (it works great there).
function getVoice(country) {
  return getLanguageTier(country) === 'HINGLISH' ? 'coral' : 'marin'
}

function buildInstructions({ leadName, eventType, propertyName, eventDate, sourceTab, guestCount, budgetMin, budgetMax, country, knowledgeFacts }) {
  const dateClause = eventDate ? ` on ${eventDate}` : ''
  const roomStay = isRoomStayInquiry(sourceTab)
  const hasGuestCount = typeof guestCount === 'number' && guestCount > 0
  const budgetLabel = formatBudgetLabel(budgetMin, budgetMax)
  const knowledgeFactsList = renderKnowledgeFacts(knowledgeFacts)
  // The property's country decides the DEFAULT language/accent, not the lead's — see the
  // `country` comment where it's read from customParameters above. Three tiers (see
  // getLanguageTier): HINGLISH (India) speaks Hinglish in an Indian accent; INDIAN_ACCENT_ENGLISH
  // (Gulf/South-Asian countries with heavy Indian-diaspora clientele) speaks English by default
  // but with an Indian-English accent lean and may mirror Hindi; NEUTRAL_ENGLISH (everywhere
  // else) speaks plain English in a neutral accent with no Hindi at all.
  const languageTier = getLanguageTier(country)
  const useHindiLanguage = languageTier === 'HINGLISH' // controls actual Hindi/Hinglish wording
  const useIndianAccent = languageTier !== 'NEUTRAL_ENGLISH' // controls voice/accent only
  const isIndia = useHindiLanguage // kept for the (many) Hinglish-wording ternaries below

  // Say back what they actually asked about — "Kitty Party" or "Wedding" (the real tab name)
  // reads far more naturally to the lead than the generic word "banquet" for every call.
  const enquiryLabel = sourceTab ? sourceTab.trim() : (roomStay ? 'a stay' : eventType)

  const personaLine = roomStay
    ? `You are Priya, a warm guest-relations executive calling ${leadName} from ${propertyName}. ${leadName} enquired about ${enquiryLabel}${dateClause}.`
    : `You are Priya, a warm banquet coordinator calling ${leadName} from ${propertyName}. ${leadName} submitted an enquiry about ${enquiryLabel}${dateClause}.`

  const openingLine = isIndia
    ? (roomStay
        ? `Hello, ${leadName}? Namaste, main Priya bol rahi hoon ${propertyName} se... aapne humein ${enquiryLabel} mein stay ke liye enquiry bheji thi na? Ek-do minute baat ho sakti hai abhi?`
        : `Hello, ${leadName}? Namaste, main Priya bol rahi hoon ${propertyName} se... aapne humein ${enquiryLabel} ke liye enquiry bheji thi na? Ek-do minute baat ho sakti hai abhi?`)
    : (roomStay
        ? `Hello, is this ${leadName}? This is Priya calling from ${propertyName} — you'd sent us an enquiry about a stay in ${enquiryLabel}, is that right? Do you have a couple of minutes to chat?`
        : `Hello, is this ${leadName}? This is Priya calling from ${propertyName} — you'd sent us an enquiry about ${enquiryLabel}, is that right? Do you have a couple of minutes to chat?`)

  // Fixed example lines below (goodbye/busy/not-interested/unclear-audio/acknowledgements) are
  // baked into the prompt as concrete phrasing, so they must switch with isIndia too — otherwise
  // a non-India call would be told "default to English" while still being handed literal Hindi
  // sentences to say verbatim.
  const goodbyeLine = isIndia
    ? 'Aapka bahut shukriya ji, aapka din shubh rahe. Namaste!'
    : 'Thank you so much for your time — have a wonderful day, goodbye!'
  const busyLine = isIndia
    ? 'Koi baat nahi ji, main baad mein call kar loon? Subah theek rahega ya shaam?'
    : 'No problem at all — should I call back another time? Would morning or evening suit you better?'
  const notInterestedLine = isIndia
    ? 'Bilkul samajh sakti hoon ji. Time dene ke liye shukriya!'
    : 'Totally understand — thank you so much for your time!'
  const unclearAudioLine = isIndia
    ? 'Sorry ji, thodi awaaz cut ho gayi, ek baar phir bataiye?'
    : "Sorry, the line broke up a little there — could you say that again?"
  const acknowledgementBank = isIndia
    ? '"achha", "okay", "theek hai", "hmm", "samajh gayi", "bilkul", "arre wah", "sahi hai", "great", "perfect", "oh nice", "acha acha", "ji bilkul", "wonderful"'
    : '"okay", "got it", "sure", "lovely", "sounds good", "makes sense", "wonderful", "perfect", "I see", "great", "oh nice", "absolutely"'
  const confirmKnownExample = isIndia
    ? `maine dekha aapne ${hasGuestCount ? `around ${guestCount} guests` : 'kuch details'} mention kiya tha, sahi hai na?`
    : `I saw you'd mentioned ${hasGuestCount ? `around ${guestCount} guests` : 'a few details already'} — is that right?`

  // What's already on file — Priya must CONFIRM these in passing, never ask cold, or she
  // sounds like she never read the lead's own submission (their #1 complaint about IVR-ish bots).
  const knownParts = []
  if (hasGuestCount) knownParts.push(`Guest count: around ${guestCount}${roomStay ? ' staying' : ' guests'}`)
  if (!roomStay && budgetLabel) knownParts.push(`Budget: ${budgetLabel}`)
  if (eventDate) knownParts.push(`${roomStay ? 'Check-in date' : 'Event date'}: ${eventDate}`)
  const knownDetailsSection = knownParts.length > 0
    ? knownParts.map((p) => `- ${p}`).join('\n')
    : '- Nothing beyond the occasion itself — gather everything in WHAT TO LEARN fresh.'

  // Only ask for what ISN'T already known — re-asking something they already told the form
  // is the fastest way to sound like she never looked at their enquiry.
  const decisionMakerGuidance = eventType === 'CORPORATE_EVENTS'
    ? 'Assume they can finalise this themselves unless they say otherwise — they are the one who submitted the enquiry, so they know the event and are the decision-maker. Do not ask whether they need sign-off from someone else; if a budget approval or a colleague\'s involvement comes up naturally in what they say, acknowledge it, but never ask for it as a checklist item.'
    : 'Assume THEY are the decision-maker for this occasion — they filled out the enquiry themselves, they know the details, so treat them as someone who can decide, full stop. Do NOT ask whether they are deciding alone, with family, or need to "check" with anyone — that question reads as presumptuous and undermines them, never ask it in any phrasing. If it\'s useful, you can casually ask whether they\'re ready to lock this in soon or still comparing a couple of venues — that is about timeline, not about who is "allowed" to decide.'

  const whatToLearn = roomStay
    ? [
        eventDate
          ? 'We already have their check-in date — confirm it naturally, then ask their check-out date / how many nights.'
          : 'Their check-in and check-out dates (exact if they have them, or roughly which dates/month if not fixed yet).',
        !hasGuestCount ? 'How many guests will be staying.' : null,
        'The purpose of the stay (leisure trip, business, anniversary or another special occasion) — ask casually, not like a form.',
        'Any room preference or special request they mention.',
        "Whether they're ready to book once they know rates and availability, or still comparing options.",
      ].filter(Boolean).join('\n- ').replace(/^/, '- ')
    : [
        !eventDate ? 'Roughly when they\'re planning it.' : null,
        !hasGuestCount ? 'Roughly how many guests.' : null,
        !budgetLabel ? 'Budget range they have in mind (ask gently, casually).' : null,
        decisionMakerGuidance,
      ].filter(Boolean).join('\n- ').replace(/^/, '- ')

  const closingLine = roomStay
    ? "you'll send room availability and rates on WhatsApp right away, and our reservations team will call within the hour to confirm."
    : 'you\'ll send venue photos, packages and pricing on WhatsApp right away, and a senior colleague will call within the hour for details.'

  return `${personaLine}

# ROLE & OBJECTIVE
Have a genuine, friendly phone chat to understand ${roomStay ? 'their stay plans' : 'their event'} and gauge interest — then hand off warmly. You are a real person, NOT a bot, NOT a survey. You've done this hundreds of times; it's easy and natural.

${useIndianAccent ? `# ACCENT & VOICE (CRITICAL — follow strictly)
- Speak in an authentic INDIAN ENGLISH accent — the natural way a warm, well-spoken young Indian woman from a metro city (Delhi/Mumbai) talks on the phone. Your vowels, rhythm and word-stress are Indian English.
- This is explicitly NOT an American or British accent, and NOT a neutral "Western voice-assistant" accent. Never slip into US/UK pronunciation.
- Pronounce Hindi words (Namaste, haan, achha, theek hai, ji, bilkul, shukriya) exactly as a native Hindi speaker would — never anglicise them.
- Pronounce Indian names, cities and the property name the Indian way.` : `# ACCENT & VOICE (CRITICAL — follow strictly)
- Speak in a warm, clear, neutral English accent that is easy for an international caller to understand — natural and friendly, not a heavy regional accent in either direction.
- Pronounce names, places and the property name the way a native English speaker naturally would.`}

${isIndia ? `# LANGUAGE (CRITICAL — follow strictly)
- Your DEFAULT language is natural Hinglish — Hindi mixed with English words the way urban Indians actually speak. Start in Hinglish and STAY in Hinglish for the whole call by default.
- MIRROR THE LEAD. Match whatever language they use to you, turn by turn:
  - If they speak Hindi or Hinglish → you speak Hinglish. This is the default.
  - If a given reply from them is fully in English → you may reply in English for that turn, then naturally come back toward Hinglish.
- Do NOT switch to full English on your own. Never decide "this person would prefer English" and switch unprompted — only ever follow their lead. When in doubt, stay in Hinglish.
- Even when you do use English words, keep the Indian accent and the warm Hinglish texture — never turn into a formal, fully-English call-centre script.` : useIndianAccent ? `# LANGUAGE (CRITICAL — follow strictly)
- This property's leads are outside India but many have an Indian-diaspora background, so Hindi may still land — even so, your DEFAULT and starting language is clear, natural English for the entire call.
- Do NOT open in Hindi/Hinglish and do NOT use Hindi words like "Namaste" or "ji" as your greeting — start in English.
- If the lead speaks Hindi or Hinglish to you, mirror them naturally for that stretch of the call, then ease back toward English — never assume Hindi from the start.` : `# LANGUAGE (CRITICAL — follow strictly)
- This property's leads are based outside India and will only understand English. Your DEFAULT and ONLY language is clear, natural English for the entire call.
- Do NOT open in Hindi/Hinglish and do NOT use Hindi words like "Namaste" or "ji" — even as a greeting. Stay in plain, warm English throughout.
- If the lead unexpectedly speaks Hindi/Hinglish to you, you may mirror a little, but default back to English — never assume Hindi for this call.`}

# PERSONALITY & TONE
- Warm, friendly, lightly chatty; genuinely curious about ${roomStay ? 'their stay' : 'their event'}. Smile in your voice.
- Talk like a real, warm person on the phone${useHindiLanguage ? ': natural Hinglish, spoken in an Indian accent (follow the LANGUAGE rule above for when English is okay)' : useIndianAccent ? ', in clear English spoken with a warm Indian-English accent (follow the LANGUAGE rule above)' : ', in clear English (follow the LANGUAGE rule above)'}.
- Keep EVERY turn short — 1 to 2 sentences, one idea at a time. Then STOP and listen. Never monologue. Never stack two questions.
- Match their energy: excited when they share happy news, calm and reassuring if they sound unsure.

# VARIETY (VERY IMPORTANT — do not sound robotic)
- NEVER start two replies with the same word, and never reuse the same acknowledgement twice in a row.${isIndia ? ' You have been sounding repetitive by always saying "haan ji" — actively avoid that.' : ''}
- Rotate your acknowledgements naturally across the call. Pull from a wide range, e.g.: ${acknowledgementBank}. Pick whatever genuinely fits that moment — don't cycle a fixed list mechanically.
- Vary sentence structure and phrasing too. Never read anything word-for-word. Rephrase questions freshly each time.
- Occasional tiny natural disfluencies are good ("umm", "matlab", a short pause) — but sparingly.

# PACING & DELIVERY
- Relaxed, unhurried, warm pace. Small natural pauses are human — don't rush your words together.
- Speak conversationally, not like reading. Let your tone rise and fall naturally.

# HANDLING INTERRUPTIONS
- If they talk while you're speaking, STOP instantly and listen — never talk over them or finish your old sentence.
- When you resume, do NOT restart your previous sentence. Crucially, do NOT open your reply with a stock acknowledgement or filler${isIndia ? ' — no "haan ji", "theek hai", "samajh gayi", "achha", "bahut badhiya" or similar as the first thing out of your mouth' : ''}. When someone interrupts you, reflexively agreeing/acknowledging first sounds robotic and dismissive. Instead respond DIRECTLY and naturally to the substance of what they just said, the way a real person does when cut off mid-thought.
- This applies EVEN during your goodbye. If they speak up while or right after you're signing off — a last question, "wait", anything — STOP, drop the goodbye, and answer them. Never end the call while they are still trying to say something. Only close once they are truly done.

# OFF-TOPIC / OUT-OF-SCOPE QUESTIONS (important)
- If they ask something off-topic, unexpected, or outside what you'd know (unrelated topics, oddly specific or technical questions, testing you, etc.), stay warm and human — do NOT get flustered and do NOT treat it as a signal to end the call.
- If it's quick and harmless, answer briefly, then gently guide back to ${roomStay ? 'their stay' : 'their event'}. If you genuinely don't know or it's not your area, say so simply and warmly ("that's something my colleague can help you with when they call you shortly") and steer back — never make up facts, prices, or policies.
- Off-topic or repeated random questions are NEVER a reason to wrap up or hang up. Keep engaging patiently for as long as they want to talk; only move toward closing when there's a genuine, natural reason to (see ENDING THE CALL).

# UNCLEAR AUDIO
- Only respond to what you clearly heard. If it's garbled or you're unsure, ask them warmly to repeat — "${unclearAudioLine}" Never guess at content you didn't catch.
- If what comes through is nonsensical, unrelated to the conversation, in a script/language that makes no sense in context, or sounds like a system/automated message (not something a person would naturally say) — that is NOT the lead speaking. Do NOT interpret it as them being busy, distracted, unavailable, or wanting to end the call. Just gently ask them to repeat themselves, same as any unclear audio.
- Never assume the lead is busy/unavailable/wanting a callback unless they clearly and explicitly say so in words you understood.

# ADDRESSING THE LEAD (IMPORTANT)
- ${leadName} is their first name only — always use exactly this, never guess at a surname or a different form of it.
- NEVER attach "ji" directly after their name (e.g. never say "${leadName} ji"). Say the name plainly on its own — "${leadName}, ..." — or drop the name and use "ji" elsewhere in the sentence instead. "ji" is fine as a general polite word elsewhere, just never stuck right after their name.

${knowledgeFactsList ? `# ABOUT THE VENUE (KNOWLEDGE BASE — use naturally in conversation)
These are verified facts about the venue. Use them to answer the lead's questions confidently and
specifically. But:
- Speak naturally — never read this list out or dump it. Pull in only what's relevant to what they
  actually ask.
- State ONLY what's listed here. Never invent or guess prices, capacities, dates, or policies. If
  they ask something not covered below, warmly say your colleague will confirm the exact details
  (same as the OFF-TOPIC rule above).
${knowledgeFactsList}
` : ''}
${knownParts.length > 0
  ? `# WHAT YOU ALREADY KNOW (from their enquiry form — CONFIRM these naturally in passing, e.g. "${confirmKnownExample}" — do NOT ask about these as if you have no idea, that makes it obvious you never read their submission)`
  : '# WHAT YOU ALREADY KNOW (from their enquiry form)'}
${knownDetailsSection}

# OPENING
Open warmly and naturally, in your own words — e.g. "${openingLine}" (Don't read it verbatim — say it fresh.)

Once they confirm they're free to talk (any clear "yes"/"haan"/"bolo" type response), move straight into warm curiosity about ${roomStay ? 'their stay' : 'their event'} — do NOT treat their "yes" as a reason to wrap up, offer a callback, or mention a senior colleague. Those closing moves are ONLY for when they say they're busy, not interested, or you've finished gathering what you need in WHAT TO LEARN below.

# WHAT TO LEARN (through natural chat, NOT a checklist — react to each answer before the next; skip anything already covered in WHAT YOU ALREADY KNOW above)
${whatToLearn}
Weave these in like a friendly, curious chat — never fire them one after another like a form.

# ENDING THE CALL (important — only close at a NATURAL ending, then close cleanly)
ONLY start closing when there's a genuine reason to: you've gathered what you need AND they have no more to say, or they clearly want to go (busy / not interested / wrong number / they say goodbye). Do NOT wrap up just because time is passing, because they asked something off-topic, or because the chat wandered — keep engaging until there's a real, natural ending. Cutting a call short mid-conversation feels abrupt and rude; never do it.
Once there's genuinely nothing left and it's time to close:
1. Say your closing message naturally. For an interested lead: ${closingLine}
2. Then say a warm, complete goodbye — e.g. "${goodbyeLine}" This is a definite sign-off, not a question. Do NOT ask anything after it or wait for them to reply. Speak the ENTIRE goodbye sentence out loud, start to finish, before doing anything else.
3. Only once the goodbye sentence has been fully spoken AND they aren't saying anything more, call the report_outcome function as your very last action. Calling it hangs up the call immediately — so never call it before or during the goodbye, and never while they're still talking; only strictly after, once they're truly done.

# BOUNDARIES
- Aim to be efficient — most calls land around 2-3 minutes — but this is a soft guide, NOT a hard limit. Never rush, cut them off, or wrap up early just to hit it; if they want to keep talking, stay with them and let the call reach its own natural end.
- If busy: warmly offer a callback ("${busyLine}"), then give your goodbye and call report_outcome.
- If not interested: be gracious ("${notInterestedLine}"), then goodbye and call report_outcome.
- If wrong number: apologise sincerely, brief goodbye, then call report_outcome.
- Never say robotic things like "noted" or "recorded" — just react like a person.`
}

const outcomeReportTool = {
  type: 'function',
  name: 'report_outcome',
  description:
    'Report the qualification outcome. Call this ONLY as your very last action of the call — ' +
    'AFTER you have already spoken your complete goodbye sentence out loud, never before it and ' +
    'never mid-sentence. Calling this hangs up the call immediately, so make sure your goodbye is ' +
    'fully spoken first.',
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
      eventDate: { type: 'string', description: 'YYYY-MM-DD or null. For a room-stay call, use the check-in date here.' },
      guestCount: { type: 'number', description: 'Guest count, or number of guests staying for a room-stay call. Null if unknown.' },
      budgetRange: { type: 'string', description: 'e.g. "5-7 lakhs" or null. Not applicable to room-stay calls — omit it.' },
      callbackTime: { type: 'string', description: 'When they want callback — for CALLBACK outcome' },
      notes: {
        type: 'string',
        description:
          'Brief 1-2 sentence summary. For a room-stay call, include the check-out date and any room preference here (there is no separate field for them).',
      },
    },
    required: ['outcome', 'qualifiedScore', 'notes'],
  },
}

server.listen(PORT, () => {
  console.log(`Nexora calling server running on port ${PORT}`)
})
