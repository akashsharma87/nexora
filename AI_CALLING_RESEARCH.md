# NEXORA — AI Calling Agent: Research & Requirements

> Internet-verified research for an OUTBOUND AI voice-calling assistant that auto-calls new banquet leads in India and writes the call outcome back to the Nexora CRM.
> Compiled June 23, 2026. All claims cited to primary/credible sources. Cost figures are approximate — get written vendor quotes before committing.

**Assumptions:** Outbound calls to Indian mobile leads · Hindi + Hinglish + Indian English · modest initial volume (<10,000 min/month) · calling on behalf of hotel clients' leads · existing stack Next.js + Prisma + Postgres on Railway.

---

## TL;DR (the decisions that matter)

1. **Do NOT use Twilio for the outbound calling layer.** Twilio's own guidelines state outbound calls to India can only be made **from international (non-Indian) numbers** — i.e. your lead sees a foreign caller ID (near-zero pickup, reads as spam). It also costs 2–3× and is weakest on India DLT compliance.
2. **Use an Indian CPaaS for telephony + number + DLT compliance.** For a low-volume pilot, **Plivo** is the cheapest clean path; **Exotel** costs ~10–25% more but carries the strongest DLT/compliance wrap. Ozonetel/Knowlarity also strong on compliance.
3. **Voice AI brain+voice:** ElevenLabs Conversational AI (best Hindi/Hinglish) or OpenAI Realtime API. Both stream over the CPaaS WebSocket. The **voice-AI usage is usually a bigger cost driver than the telephony per-minute** — optimise call duration, not just per-minute rate.
4. **The long pole is regulatory (DLT registration), not engineering.** Start DLT registration first; the code is the easy part.
5. **Status write-back is built in:** the CPaaS POSTs a call-status callback (CallSid, Status, Duration, RecordingUrl) to a Nexora webhook → update the `Lead` automatically.

---

## 1. Telephony / number provisioning in India

### Twilio — NOT suitable for outbound India calling
From **Twilio's own India Voice Guidelines**:
- *"Outbound calls to India can only be made from international (non-Indian) numbers."*
- No Indian local/toll-free number usable as outbound caller ID.
- Uncon­sented commercial calls treated by TRAI as Unsolicited Commercial Communication (UCC) → "blocking or account termination."
- Independent 2026 comparison: Twilio Indian DIDs/outbound are *"2–3× the cost of Plivo or Exotel"* and *"thinnest for India"* on DLT.

Source: https://www.twilio.com/en-us/guidelines/in/voice · https://www.caller.digital/blog/telephony-partner-voice-ai-india-plivo-exotel-ozonetel-knowlarity-twilio-2026

### Indian CPaaS comparison (for AI voice, 2026)
| Provider | Media streaming for real-time AI | DLT/compliance | Cost note |
|---|---|---|---|
| **Plivo** | ✅ Mature streaming API | Manages DLT, less India-specific tooling | Cheapest; *"fastest path to a clean pilot"* |
| **Exotel** | ✅ Mature streaming (AgentStream) | Strongest DLT ops; files headers on your behalf | ~10–25% more than Plivo |
| **Ozonetel / Knowlarity** | Historically session-based, lags streaming | Strong DLT ops | Enterprise CCaaS bundle |
| **Twilio** | ✅ Mature streaming | Thin on India compliance | 2–3× Plivo/Exotel; foreign caller ID only |

Outbound per-minute (2026 benchmark, verify): **₹0.60–₹1.20/min** direct SIP (Airtel/Jio); **₹0.80–₹1.80/min** via aggregator.

Source: https://www.caller.digital/blog/telephony-partner-voice-ai-india-plivo-exotel-ozonetel-knowlarity-twilio-2026

---

## 2. TRAI / DLT / TCCCPR — the regulatory reality

Outbound commercial/promotional voice calls fall under **TCCCPR 2018** + **Second Amendment (Feb 12, 2025)**.

- **DLT registration mandatory** — register as a "Principal Entity" on a telco DLT portal (Jio/Airtel/Vi/BSNL). Needs GST, PAN, business proof, authorised-signatory KYC.
- **Number series:** promotional auto-dialer/robocalls → **140 series**; service/transactional → **160 series**. AI/auto-dialer calling is explicitly in scope.
- **Auto-diallers/robocalls** must be notified to origin access providers in advance.
- **"Inferred consent" from prior business relationship ended Feb 2025** → explicit, documented consent now required. Call as the **hotel (registered entity)**, not anonymously.
- **Penalties (aggressive since Aug 13, 2024):** 1st offence = 15-day suspension of outgoing telecom services; repeat = 1-year disconnection + 2-year blacklisting.
- **Complaint window:** consumers 7 days to complain; providers must respond in 5 days.

**Compliant path for an agency:** choose a CPaaS that files DLT headers on your behalf and maintains DND/NCPR scrub-lists in near-real-time. Exotel/Ozonetel/Knowlarity strongest here.

> **VERIFY:** OSP (Other Service Provider) registration was largely liberalised by DoT in 2020–21. For a multi-client agency calling operation, confirm exact status in writing with the CPaaS compliance team. DLT = firm requirement; OSP = confirm.

Sources: https://www.trai.gov.in/sites/default/files/2025-02/Regulation_12022025.pdf · https://www.sigmachambers.in/post/2025-tcccpr-amendments-a-renewed-push-by-trai-for-order-in-commercial-communications-1 · https://talk-q.com/outbound-call-regulations-in-india · https://mobileecosystemforum.com/2025/07/11/in-india-trai-tougher-on-spam-a-call-for-industry-action/

---

## 3. Voice AI stack

| Option | What it is | Hindi/Hinglish | Notes |
|---|---|---|---|
| **ElevenLabs Conversational AI** | Bundled STT+LLM+TTS+turn-taking | ✅ Native Hindi/Tamil/Bengali/Marathi/Hinglish, sub-100ms | Integrates with Exotel/Ozonetel/Plivo; used by Meesho, Cars24, NoBroker, 99acres |
| **OpenAI Realtime API** | Speech-to-speech single model | Good | Proven on Exotel AgentStream (see §4); one vendor for brain+voice |
| **STT→LLM→TTS pipeline** (Deepgram/Whisper + GPT + ElevenLabs/Cartesia) | Self-assembled | Depends on parts | Most control, most glue code |
| **Managed platforms** (Vapi, Retell AI, Bland AI, Caller Digital) | All-in-one voice agent + start-call/webhook API | Varies | Lowest glue code; per-minute markup; **price not yet verified** |

ElevenLabs explicitly markets Hindi/Hinglish "voices that sound native, not translated" and integrations with **Ozonetel, Exotel, Plivo**. So Hindi voice quality is not a blocker.

Source: https://elevenlabs.io/india

---

## 4. End-to-end architecture (PROVEN on Exotel + OpenAI Realtime)

From Exotel's own engineering walkthrough:
- **Outbound supported** via **Make-a-Call API** → routes answered lead into a Call Flow with a **Voicebot Applet** that opens a bidirectional WebSocket.
- Audio streams as **base64 Linear PCM, 16-bit, 8/16/24 kHz, mono**, ~100ms frames → your bot → OpenAI Realtime → audio back.
- **Status write-back built in:** on completion *"Exotel POSTs: CallSid, Status (completed|failed|busy|no-answer), RecordingUrl, DateUpdated."* Passthru Applet also exposes Stream Duration / RecordingUrl / DisconnectedBy.

Source: https://exotel.com/blog/build-a-real-time-speech-to-speech-ai-voice-assistant-on-exotel-agentstream-bidirectional-with-openai-realtime-python/

### Flow mapped to Nexora
```
New Lead (Prisma row)
  → Nexora job → CPaaS Make-a-Call API (pass leadId via CustomField)
  → Lead answers → Voicebot Applet opens WebSocket
  → Audio ↔ bot server ↔ ElevenLabs/OpenAI Realtime (Hindi qualification script)
  → Call ends → CPaaS POSTs StatusCallback → /api/webhooks/exotel (or /plivo)
  → Next.js updates Lead.callStatus + logs LeadActivity (status, duration, recordingUrl)
  → If answered + interested → auto-advance NEW → CONTACTED
```
Reuses the existing Wati webhook → LeadActivity → stage-advance pattern.

---

## 5. Requirements checklist

**Accounts / keys**
- [ ] CPaaS account (Plivo for cheap pilot, or Exotel) → Indian DID + API key/token
- [ ] ElevenLabs Conversational AI key (or OpenAI Realtime key, or Vapi/Retell key)
- [ ] WebSocket bot server (Node — can be a Railway worker alongside Nexora)
- [ ] Nexora webhook: `POST /api/webhooks/exotel` (or `/plivo`)

**Legal / regulatory (start FIRST)**
- [ ] DLT Principal Entity registration (per hotel client, or Nexora as telemarketer) — GST, PAN, business proof, KYC
- [ ] Approved 140-series number for promotional calls
- [ ] Documented lead consent wired into lead-source forms (post-Feb-2025 explicit consent)
- [ ] Confirm OSP status in writing with CPaaS

**Approx costs (INR — verify with quotes)**
- Outbound voice: ₹0.60–₹1.20/min direct SIP; ₹0.80–₹1.80/min aggregator
- CPaaS DID rental + onboarding: few hundred ₹/month + setup fee (quote)
- Voice AI (ElevenLabs/OpenAI Realtime): usage-based, billed USD — **NOT yet price-verified**
- DLT registration: nominal one-time per portal

**Timeline (regulatory is the long pole)**
- DLT registration + number approval: ~1–3 weeks
- CPaaS onboarding + bot integration: ~1–2 weeks
- Voice script + Hindi tuning + testing: ~1 week
- Call flow + webhook engineering: days

---

## 6. Re-verify before spending money
1. CPaaS will file DLT headers on your behalf — get the exact KYC list in writing.
2. ElevenLabs Conversational AI ↔ CPaaS **outbound** capability — confirm with sales, or default to proven Exotel AgentStream + OpenAI Realtime.
3. Current per-minute + voice-AI pricing in writing (ranges above are third-party benchmarks, not quotes).
4. OSP applicability for the multi-client agency model.
5. 140 vs 160 series classification for lead-qualification calls — let CPaaS compliance confirm.

---

## Recommendation
Build on **CPaaS (Plivo for cheap pilot / Exotel for compliance wrap) + ElevenLabs Conversational AI or OpenAI Realtime (Hindi) + Nexora webhook for status write-back.** Skip Twilio for outbound India. **Start DLT registration this week** — it's the only thing that can't be rushed.

---

## 7. Cheaper alternatives (added after Exotel ₹10k objection)

### Option B — WhatsApp Business Calling API ✅ (cheapest, regulation-light)
- **Outbound business-initiated calls supported; live in India (beta — one of 4 launch markets).**
- **OTT internet calling — NO PSTN, NO Indian number provisioning, NO DLT/140-series.** Telnyx: *"You cannot bridge WhatsApp calls to the PSTN. WhatsApp Calling is on-net to WhatsApp users only."*
- **AI partners supported by Meta:** Vapi, ElevenLabs, Coval, Phonic.
- Call appears as your **verified WhatsApp Business profile** → high pickup/trust.
- **No telephony per-minute charge** (rides data); only cost is voice-AI usage.
- **HARD LIMIT:** not a cold-calling channel. Can only call users who **consented / expect the call**; recipient must be a WhatsApp user. *"Meta monitors unanswered business-initiated calls. If too many go unanswered, your calling privilege may be restricted."*
- **Fit for Nexora:** reuse existing Wati WhatsApp auto-reply for consent/engagement, THEN AI voice-call engaged leads over WhatsApp. Check if Wati supports the Calling API; else use Meta Cloud API directly or a BSP that does.

Sources: https://mobileecosystemforum.com/2025/12/17/whatsapp-opens-a-new-front-in-business-voice-with-calling-api/ · https://telnyx.com/resources/whatsapp-calling-ai-voice-agents

### Retell AI — does NOT solve the India cost/regulatory problem ❌
- Retell is only the **brain/voice layer**; it does **not sell Indian numbers directly**.
- Retell staff: using an Indian number as caller ID *"requires integrating with Retell AI through custom telephony via SIP trunking"* — bring your own Indian number via Telnyx/Indian CPaaS, verify, import (E.164).
- So you **still need Indian telephony underneath** → still DLT + Indian-number cost, plus Retell's own per-minute markup on top.
- Verdict: replaces building the bot, not the carrier. Not a cost solution.

Source: https://community.retellai.com/t/enable-verified-caller-id-indian-airtel-number-for-outbound-calls/789

### On Exotel cost
- The ₹10k is a **minimum plan commitment**, not the real per-call cost. Telephony per-minute (~₹1) is the small number; voice-AI usage dominates.
- For a pilot prefer **usage-based Plivo** (no big upfront) over Exotel's minimum plan, OR go WhatsApp Calling and skip CPaaS entirely.

### Revised recommendation
1. **Primary: WhatsApp Business Calling API + ElevenLabs/Vapi** — cheapest, no DLT, reuses existing WhatsApp. Compliant flow: new lead → WhatsApp template auto-reply (consent) → AI voice call over WhatsApp → webhook updates Lead.
2. **Fallback (non-WhatsApp leads): Plivo (usage-based), not Exotel.**
