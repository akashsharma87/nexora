// Throwaway probe: find the model + session.update shape that OpenAI accepts.
const WebSocket = require('ws')
const KEY = process.argv[2]

function probe({ label, model, session }) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${model}`, {
      headers: { Authorization: `Bearer ${KEY}` },
    })
    let done = false
    const finish = (result) => { if (!done) { done = true; try { ws.close() } catch {} resolve(`[${label}] ${result}`) } }
    ws.on('open', () => ws.send(JSON.stringify({ type: 'session.update', session })))
    ws.on('message', (raw) => {
      const e = JSON.parse(raw)
      if (e.type === 'session.updated') finish('✅ session.updated OK')
      if (e.type === 'error') finish('❌ error: ' + JSON.stringify(e.error))
    })
    ws.on('close', (c, r) => finish(`closed code=${c} reason=${r?.toString() || 'none'}`))
    ws.on('error', (err) => finish('❌ ws error: ' + err.message))
    setTimeout(() => finish('⏱️ timeout (no session.updated)'), 8000)
  })
}

const flat = {
  input_audio_format: 'g711_ulaw',
  output_audio_format: 'g711_ulaw',
  voice: 'shimmer',
  instructions: 'You are a test.',
  turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 700, create_response: true },
  modalities: ['audio', 'text'],
  input_audio_transcription: { model: 'whisper-1' },
}

const ga = {
  type: 'realtime',
  output_modalities: ['audio'],
  instructions: 'You are a test.',
  audio: {
    input: {
      format: { type: 'audio/pcmu' },
      turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 700, create_response: true },
      transcription: { model: 'whisper-1' },
    },
    output: { format: { type: 'audio/pcmu' }, voice: 'shimmer' },
  },
}

;(async () => {
  console.log(await probe({ label: 'gpt-realtime + FLAT', model: 'gpt-realtime', session: flat }))
  console.log(await probe({ label: 'gpt-realtime + GA', model: 'gpt-realtime', session: ga }))
})()
