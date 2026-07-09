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
  const HANGUP_MARK = 'nexora-hangup'

  // ── Open OpenAI Realtime WebSocket ──────────────────────────────────────────
  const openaiWs = new WebSocket(
    'wss://api.openai.com/v1/realtime?model=gpt-realtime',
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
    }
  )

  // Send session.update only once BOTH the OpenAI socket is open AND Twilio's
  // `start` event has delivered the lead params (so instructions have the name).
  function configureSession() {
    if (!openaiReady || !started || sessionConfigured) return
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
        instructions: buildInstructions({ leadName, eventType, propertyName, eventDate, sourceTab }),
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
            voice: 'marin', // most natural female voice for gpt-realtime (GA)
          },
        },
      },
    }))
    console.log(`[call:${callId}] session.update sent`)
  }

  // Parse + report the report_outcome tool call, at most once per call. This is
  // Priya's final action — it also arms the hang-up so the call ends after her
  // goodbye finishes playing (instead of sitting silent waiting for the lead).
  function handleOutcomeCall(rawArgs) {
    if (outcomeReported) return
    try {
      const outcome = JSON.parse(rawArgs)
      console.log(`[call:${callId}] Outcome reported:`, outcome.outcome, outcome.qualifiedScore)
      outcomeReported = true
      reportOutcomeToNexora(callId, outcome, transcript)
    } catch (e) {
      console.error(`[call:${callId}] Failed to parse outcome:`, e)
    }
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
    // Safety net: if Twilio never echoes the mark, force-close anyway.
    setTimeout(() => {
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

    // Session is ready — trigger Priya's opening line
    if (event.type === 'session.updated') {
      console.log(`[call:${callId}] ✅ session.updated received — sending response.create`)
      openaiWs.send(JSON.stringify({ type: 'response.create' }))
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
      started = true

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

function buildInstructions({ leadName, eventType, propertyName, eventDate, sourceTab }) {
  const dateClause = eventDate ? ` on ${eventDate}` : ''
  const roomStay = isRoomStayInquiry(sourceTab)

  // Say back what they actually asked about — "Kitty Party" or "Wedding" (the real tab name)
  // reads far more naturally to the lead than the generic word "banquet" for every call.
  const enquiryLabel = sourceTab ? sourceTab.trim() : (roomStay ? 'a stay' : eventType)

  const personaLine = roomStay
    ? `You are Priya, a warm guest-relations executive calling ${leadName} from ${propertyName}. ${leadName} enquired about ${enquiryLabel}${dateClause}.`
    : `You are Priya, a warm banquet coordinator calling ${leadName} from ${propertyName}. ${leadName} submitted an enquiry about ${enquiryLabel}${dateClause}.`

  const openingLine = roomStay
    ? `Hello, ${leadName}? Namaste, main Priya bol rahi hoon ${propertyName} se... aapne humein ${enquiryLabel} mein stay ke liye enquiry bheji thi na? Ek-do minute baat ho sakti hai abhi?`
    : `Hello, ${leadName}? Namaste, main Priya bol rahi hoon ${propertyName} se... aapne humein ${enquiryLabel} ke liye enquiry bheji thi na? Ek-do minute baat ho sakti hai abhi?`

  const whatToLearn = roomStay
    ? `- Their check-in and check-out dates (exact if they have them, or roughly which dates/month if not fixed yet).
- How many guests will be staying.
- The purpose of the stay (leisure trip, business, anniversary or another special occasion) — ask casually, not like a form.
- Any room preference or special request they mention.
- Whether they're ready to book once they know rates and availability, or still comparing options.`
    : `- The occasion, and roughly when they're planning it.
- Roughly how many guests.
- Budget range they have in mind (ask gently, casually).
- Whether they decide, or discuss with family.`

  const closingLine = roomStay
    ? "you'll send room availability and rates on WhatsApp right away, and our reservations team will call within the hour to confirm."
    : 'you\'ll send venue photos, packages and pricing on WhatsApp right away, and a senior colleague will call within the hour for details.'

  return `${personaLine}

# ROLE & OBJECTIVE
Have a genuine, friendly phone chat to understand ${roomStay ? 'their stay plans' : 'their event'} and gauge interest — then hand off warmly. You are a real person, NOT a bot, NOT a survey. You've done this hundreds of times; it's easy and natural.

# PERSONALITY & TONE
- Warm, friendly, lightly chatty; genuinely curious about ${roomStay ? 'their stay' : 'their event'}. Smile in your voice.
- Talk like a real Indian person on the phone: natural Hinglish (Hindi + English mixed). Switch fully to English only if they clearly prefer it.
- Keep EVERY turn short — 1 to 2 sentences, one idea at a time. Then STOP and listen. Never monologue. Never stack two questions.
- Match their energy: excited when they share happy news, calm and reassuring if they sound unsure.

# VARIETY (VERY IMPORTANT — do not sound robotic)
- NEVER start two replies with the same word, and never reuse the same acknowledgement twice in a row. You have been sounding repetitive by always saying "haan ji" — actively avoid that.
- Rotate your acknowledgements naturally across the call. Pull from a wide range, e.g.: "achha", "okay", "theek hai", "hmm", "samajh gayi", "bilkul", "arre wah", "sahi hai", "great", "perfect", "oh nice", "acha acha", "ji bilkul", "wonderful". Pick whatever genuinely fits that moment — don't cycle a fixed list mechanically.
- Vary sentence structure and phrasing too. Never read anything word-for-word. Rephrase questions freshly each time.
- Occasional tiny natural disfluencies are good ("umm", "matlab", a short pause) — but sparingly.

# PACING & DELIVERY
- Relaxed, unhurried, warm pace. Small natural pauses are human — don't rush your words together.
- Speak conversationally, not like reading. Let your tone rise and fall naturally.

# HANDLING INTERRUPTIONS
- If they talk while you're speaking, STOP instantly and listen — never talk over them or finish your old sentence.
- When you resume, do NOT restart your previous sentence and do NOT default to "haan ji". React to what they actually just said, with a fresh, fitting acknowledgement.

# UNCLEAR AUDIO
- Only respond to what you clearly heard. If it's garbled or you're unsure, ask them warmly to repeat — "Sorry ji, thodi awaaz cut ho gayi, ek baar phir bataiye?" Never guess at content you didn't catch.
- If what comes through is nonsensical, unrelated to the conversation, in a script/language that makes no sense in context, or sounds like a system/automated message (not something a person would naturally say) — that is NOT the lead speaking. Do NOT interpret it as them being busy, distracted, unavailable, or wanting to end the call. Just gently ask them to repeat themselves, same as any unclear audio.
- Never assume the lead is busy/unavailable/wanting a callback unless they clearly and explicitly say so in words you understood.

# ADDRESSING THE LEAD (IMPORTANT)
- ${leadName} is their first name only — always use exactly this, never guess at a surname or a different form of it.
- NEVER attach "ji" directly after their name (e.g. never say "${leadName} ji"). Say the name plainly on its own — "${leadName}, ..." — or drop the name and use "ji" elsewhere in the sentence instead. "ji" is fine as a general polite word elsewhere, just never stuck right after their name.

# OPENING
Open warmly and naturally, in your own words — e.g. "${openingLine}" (Don't read it verbatim — say it fresh.)

Once they confirm they're free to talk (any clear "yes"/"haan"/"bolo" type response), move straight into warm curiosity about ${roomStay ? 'their stay' : 'their event'} — do NOT treat their "yes" as a reason to wrap up, offer a callback, or mention a senior colleague. Those closing moves are ONLY for when they say they're busy, not interested, or you've finished gathering what you need in WHAT TO LEARN below.

# WHAT TO LEARN (through natural chat, NOT a checklist — react to each answer before the next)
${whatToLearn}
Weave these in like a friendly, curious chat — never fire them one after another like a form.

# ENDING THE CALL (important — always close cleanly, never trail off)
Every call must reach a clear ending — never go quiet waiting for them once you've said what you need to. When you're ready to close:
1. Say your closing message naturally. For an interested lead: ${closingLine}
2. Then say a warm, complete goodbye — e.g. "Aapka bahut shukriya ji, aapka din shubh rahe. Namaste!" This is a definite sign-off, not a question. Do NOT ask anything after it or wait for them to reply.
3. As your VERY LAST action, in the same turn right after the spoken goodbye, call the report_outcome function. Calling it ends the call — so only call it once you have truly finished speaking your goodbye.

# BOUNDARIES
- Keep the whole call under ~3 minutes — efficient but never rushed or pushy.
- If busy: warmly offer a callback ("Koi baat nahi ji, main baad mein call kar loon? Subah theek rahega ya shaam?"), then give your goodbye and call report_outcome.
- If not interested: be gracious ("Bilkul samajh sakti hoon ji. Time dene ke liye shukriya!"), then goodbye and call report_outcome.
- If wrong number: apologise sincerely, brief goodbye, then call report_outcome.
- Never say robotic things like "noted" or "recorded" — just react like a person.`
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
