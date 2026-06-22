# NEXORA — Complete Development Plan
**Updated: June 18, 2026 | Target: Monday June 22, 2026 | Remaining: 4 days**
**Goal: Complete, production-ready, fully automated banquet revenue OS**

---

## STATUS SNAPSHOT (June 18 morning)

### Done ✅
- Full Prisma schema: Organization, Property, User, Lead, Campaign, Platform, Proposal, Task, MessageTemplate, AutomationFlow, BroadcastCampaign
- Docker PostgreSQL + seed (30 leads, 6 campaigns, 6 platforms, 10 templates, 8 proposals)
- NextAuth v5 credentials auth + session + route protection (proxy.ts)
- All lead CRUD: create, list (search/filter), detail, stage transitions, activity timeline
- Lead tasks, SLA badge, CSV import, assignment, edit
- Campaigns list + detail + CPL benchmarks
- Platforms list + detail
- WhatsApp templates + automation display + broadcast targeting UI
- Proposals list + detail + create from lead
- Analytics: funnel, sources, trend, overdue widget
- Settings: property + users
- Dashboard: KPIs from DB, recent leads, stage distribution, overdue widget, trend chart

### NOT Done — Build in remaining 4 days
- `app/campaigns/new/page.tsx` — missing
- Wati WhatsApp real API (currently stub)
- 90-second auto-reply on lead creation (automation execution)
- 7-day drip nurture execution (currently display-only)
- Post-event re-engagement execution (Day 3/30/90 after booking)
- Broadcast actual execution (currently saves draft, doesn't send)
- Wati webhook handler (incoming messages → LeadActivity)
- Email module (nodemailer installed, lib/email.ts missing)
- OpenAI integration (proposal generation, smart insights)
- Google Sheets lead ingestion
- Source-to-campaign attribution
- Analytics: CPL by campaign type (real data), revenue attribution
- Platform content score management UI
- CSV export (lead list), Proposal PDF print
- Loading skeletons, error boundaries, toast audit
- Railway deploy + production seed + cron job

---

## 1. WHAT WE ARE BUILDING

Full banquet revenue OS — every feature from the PRD, live and functional:
1. Lead ingestion from Google Sheets (multi-source per property)
2. 90-second WhatsApp auto-response on every new lead (Wati)
3. 7-day AI-personalized nurture sequence (automated execution)
4. Post-event re-engagement (Day 3/30/90 after booking)
5. Broadcast WhatsApp campaigns (execute, not just schedule)
6. Proposal generation with OpenAI-assisted content
7. Full analytics: CPL, revenue attribution, funnel, SLA
8. Complete campaigns (create, track, benchmark)
9. Platform listing management with content scoring
10. Production deployment on Railway with cron automation

---

## 2. TECH STACK

| Layer | Choice |
|---|---|
| Framework | Next.js 16.2.6 (App Router, flat structure — no route groups) |
| Language | TypeScript 5.7.3 |
| Styling | Tailwind CSS 4.2.0 |
| ORM | Prisma 6.19.3 |
| Database | PostgreSQL (Docker local / Railway managed) |
| Auth | NextAuth v5 beta.31, Credentials provider, JWT strategy |
| Password | bcryptjs |
| Forms | React Hook Form + Zod 4 |
| Server state | TanStack React Query v5 |
| WhatsApp | Wati Business API (REST) |
| AI | OpenAI GPT-4o (proposal generation, smart insights) |
| Google Sheets | googleapis (service account) |
| Email | Nodemailer + own SMTP |
| Automation | DB-backed ScheduledMessage + Railway Cron every minute |
| Deployment | Railway (web service + managed Postgres) |

**Important:** App directory uses FLAT structure. All pages are at `app/pagename/page.tsx`, NOT inside `app/(dashboard)/`. Layouts applied via `components/dashboard-layout.tsx` component wrapper. New pages must follow this same flat pattern.

---

## 3. PACKAGES

Already installed: prisma, @prisma/client, next-auth, @auth/prisma-adapter, bcryptjs, react-hook-form, zod, @tanstack/react-query, nodemailer, date-fns, @radix-ui/* (dialog, select, dropdown, tabs, popover), react-hot-toast, uuid, recharts, lucide-react

**Add these:**
```bash
npm install openai
npm install googleapis
```

---

## 4. ENVIRONMENT VARIABLES

File: `.env` (current) + update for new vars

```env
# Database
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5433/nexora"

# NextAuth
NEXTAUTH_SECRET="your-secret-here"
NEXTAUTH_URL="http://localhost:3000"

# Kapso WhatsApp API — https://app.kapso.ai (2000 free messages on free tier)
# KAPSO_API_KEY: Kapso dashboard → Settings → API Keys
# KAPSO_PHONE_NUMBER_ID: Kapso dashboard → WhatsApp → Phone Numbers → ID
KAPSO_API_KEY="YOUR_KAPSO_API_KEY"
KAPSO_PHONE_NUMBER_ID="YOUR_PHONE_NUMBER_ID"

# OpenAI
OPENAI_API_KEY="sk-proj-..."

# Cron Security (generate: openssl rand -hex 32)
CRON_SECRET="your-random-cron-secret"

# Google Sheets Service Account
# Get from: GCP Console → IAM → Service Accounts → Create → Download JSON
# Store the email and private_key fields from the JSON
GOOGLE_SERVICE_ACCOUNT_EMAIL="nexora-sheets@your-project.iam.gserviceaccount.com"
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBg..."
# IMPORTANT: In Railway, escape newlines as \n in the key value

# Email (own SMTP)
SMTP_HOST="mail.your-domain.com"
SMTP_PORT="587"
SMTP_USER="noreply@nexora.in"
SMTP_PASS="your-smtp-password"
SMTP_FROM="NEXORA <noreply@nexora.in>"

# R2 File Storage (Phase 1, skip for June 22 demo)
# R2_ACCOUNT_ID=""
# R2_ACCESS_KEY_ID=""
# R2_SECRET_ACCESS_KEY=""
# R2_BUCKET_NAME=""
```

**User must provide:** WATI_API_URL, WATI_API_KEY, WATI_PHONE_NUMBER, OPENAI_API_KEY
**Self-generated:** CRON_SECRET (openssl rand -hex 32)
**Ops setup:** Google Service Account (GCP), SMTP credentials

---

## 5. COMPLETE PRISMA SCHEMA

File: `prisma/schema.prisma`
**Current schema is good — ADD these new models to the existing file:**

```prisma
// ─── AUTOMATION EXECUTION ─────────────────────────────────────────────────────

model ScheduledMessage {
  id           String        @id @default(cuid())
  leadId       String
  templateType TemplateType
  phone        String
  payload      Json          // { templateName, parameters: [{name, value}], message }
  scheduledAt  DateTime
  sentAt       DateTime?
  status       MessageStatus @default(PENDING)
  error        String?       @db.Text
  retryCount   Int           @default(0)
  createdAt    DateTime      @default(now())
  lead         Lead          @relation(fields: [leadId], references: [id], onDelete: Cascade)

  @@index([status, scheduledAt])
}

enum MessageStatus {
  PENDING
  SENT
  FAILED
  CANCELLED
  SKIPPED
}

// ─── WEBHOOK LOGGING ──────────────────────────────────────────────────────────

model WebhookEvent {
  id         String   @id @default(cuid())
  source     String   // "wati", "meta", "google"
  eventType  String
  payload    Json
  processed  Boolean  @default(false)
  error      String?
  createdAt  DateTime @default(now())
}

// ─── INTEGRATIONS (Google Sheets multi-source ingestion) ─────────────────────

model IntegrationConnection {
  id             String              @id @default(cuid())
  organizationId String
  propertyId     String
  provider       IntegrationProvider
  name           String
  source         LeadSource
  sheetId        String?
  tabName        String?             @default("Sheet1")
  headerRow      Int                 @default(1)
  columnMap      Json                // { name, phone, email, eventType, eventDate, guestCount, budgetMin, budgetMax, notes, campaignName }
  status         IntegrationStatus   @default(ACTIVE)
  lastSyncedAt   DateTime?
  lastSyncCount  Int                 @default(0)
  lastSyncStatus String?             // "ok" | "error"
  lastSyncError  String?             @db.Text
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt
  externalSources LeadExternalSource[]
}

model LeadExternalSource {
  id           String              @id @default(cuid())
  leadId       String
  connectionId String?
  provider     IntegrationProvider
  externalId   String              // row index or unique row identifier
  rowHash      String?             // hash of raw row data for change detection
  rawPayload   Json?
  createdAt    DateTime            @default(now())
  lead         Lead                @relation(fields: [leadId], references: [id], onDelete: Cascade)
  connection   IntegrationConnection? @relation(fields: [connectionId], references: [id], onDelete: SetNull)

  @@unique([provider, externalId])
}

enum IntegrationProvider {
  GOOGLE_SHEETS
  CSV
  WEBSITE_FORM
  META_LEADS
  GOOGLE_ADS
  MANUAL
}

enum IntegrationStatus {
  ACTIVE
  PAUSED
  ERROR
}
```

**Add to existing Lead model:**
```prisma
// Add these fields to the Lead model
campaignId       String?             // attribution: which campaign generated this lead
externalSources  LeadExternalSource[]
scheduledMessages ScheduledMessage[]
```

**Add campaign relation to Campaign model:**
```prisma
// Add to Campaign model
leads Lead[]
```

**Run after schema changes:**
```bash
npx prisma db push
npx prisma generate
```

---

## 6. KEY FILE IMPLEMENTATIONS (NEW/UPDATED)

### 6.1 `lib/whatsapp.ts` — REPLACE with full Wati implementation

```typescript
// Wati WhatsApp Business API client
// Docs: https://docs.wati.io/reference/
// Base URL: process.env.WATI_API_URL (e.g., https://live-server.wati.io)
// Auth: Bearer token in Authorization header

export interface WatiTemplateParameter {
  name: string
  value: string
}

export interface WatiSendTemplatePayload {
  template_name: string
  broadcast_name: string
  parameters: WatiTemplateParameter[]
}

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.WATI_API_KEY}`,
  }
}

function normalizePhone(phone: string): string {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '')
  // Add 91 country code if 10-digit Indian number
  if (digits.length === 10) return `91${digits}`
  // Remove leading + if present
  return digits.startsWith('+') ? digits.slice(1) : digits
}

export async function sendTemplateMessage(
  phone: string,
  templateName: string,
  parameters: WatiTemplateParameter[],
  broadcastName?: string
): Promise<{ success: boolean; error?: string }> {
  if (!process.env.WATI_API_KEY || !process.env.WATI_API_URL) {
    console.log(`[WATI STUB] Template: ${templateName} → ${phone}`, parameters)
    return { success: true }
  }

  const normalizedPhone = normalizePhone(phone)
  const url = `${process.env.WATI_API_URL}/api/v1/sendTemplateMessage?whatsappNumber=${normalizedPhone}`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        template_name: templateName,
        broadcast_name: broadcastName || `nexora_${Date.now()}`,
        parameters,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error(`[WATI ERROR] Template send failed: ${error}`)
      return { success: false, error }
    }

    return { success: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[WATI ERROR] ${error}`)
    return { success: false, error }
  }
}

export async function sendSessionMessage(
  phone: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  if (!process.env.WATI_API_KEY || !process.env.WATI_API_URL) {
    console.log(`[WATI STUB] Session message → ${phone}: ${message}`)
    return { success: true }
  }

  const normalizedPhone = normalizePhone(phone)
  const url = `${process.env.WATI_API_URL}/api/v1/sendSessionMessage/${normalizedPhone}`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ messageText: message }),
    })

    if (!response.ok) {
      const error = await response.text()
      return { success: false, error }
    }

    return { success: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error }
  }
}

export async function addContact(
  phone: string,
  name: string,
  customParams?: WatiTemplateParameter[]
): Promise<void> {
  if (!process.env.WATI_API_KEY || !process.env.WATI_API_URL) return

  const normalizedPhone = normalizePhone(phone)
  const url = `${process.env.WATI_API_URL}/api/v1/addContact/${normalizedPhone}`

  await fetch(url, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      name,
      customParams: customParams || [],
    }),
  }).catch(() => {})
}

// Template names — must match approved templates in Wati account
// Wati dashboard → Templates → Approved templates
export const WATI_TEMPLATES = {
  INITIAL_RESPONSE: 'nexora_initial_response',
  NURTURE_DAY3: 'nexora_nurture_day3',
  NURTURE_DAY5: 'nexora_nurture_day5',
  NURTURE_DAY7: 'nexora_nurture_day7',
  PROPOSAL_FOLLOWUP: 'nexora_proposal_followup',
  POST_EVENT_DAY3: 'nexora_post_event_day3',
  POST_EVENT_DAY30: 'nexora_post_event_day30',
  POST_EVENT_DAY90: 'nexora_post_event_day90',
  BROADCAST: 'nexora_broadcast_general',
} as const

// Build template parameters for each template type
// Parameter names MUST match variable names in approved Wati templates
export function buildTemplateParams(
  templateType: keyof typeof WATI_TEMPLATES,
  context: {
    leadName: string
    eventType?: string
    eventDate?: string
    propertyName?: string
    managerName?: string
    offerText?: string
    message?: string
  }
): WatiTemplateParameter[] {
  const params: WatiTemplateParameter[] = [
    { name: 'name', value: context.leadName },
    { name: 'hotel_name', value: context.propertyName || 'our venue' },
    { name: 'manager_name', value: context.managerName || 'our team' },
  ]

  if (context.eventType) params.push({ name: 'event_type', value: context.eventType })
  if (context.eventDate) params.push({ name: 'event_date', value: context.eventDate })
  if (context.offerText) params.push({ name: 'offer', value: context.offerText })
  if (context.message) params.push({ name: 'message', value: context.message })

  return params
}
```

---

### 6.2 `lib/automation.ts` — NEW: Schedule automation sequences

```typescript
import { db } from '@/lib/db'
import { WATI_TEMPLATES, buildTemplateParams } from '@/lib/whatsapp'
import { formatDate } from '@/lib/format'

// Called when a new lead is created
// Schedules: immediate initial response + Day 3, 5, 7 drip
export async function scheduleLeadNurtureSequence(
  leadId: string,
  phone: string,
  leadName: string,
  eventType: string,
  eventDate: string | null,
  propertyName: string,
  managerName: string
) {
  const now = new Date()

  const messages = [
    // Immediate initial response (5 minutes delay for system processing)
    {
      templateType: 'INITIAL_RESPONSE' as const,
      scheduledAt: new Date(now.getTime() + 5 * 60 * 1000),
      payload: {
        templateName: WATI_TEMPLATES.INITIAL_RESPONSE,
        parameters: buildTemplateParams('INITIAL_RESPONSE', {
          leadName, eventType, propertyName, managerName,
          eventDate: eventDate || 'your event date',
        }),
        message: `Hi ${leadName}! Thank you for your interest in ${eventType} at ${propertyName}. I'm attaching our banquet brochure and would love to schedule a venue visit. Reply YES to confirm. — ${managerName}`,
      },
    },
    // Day 3 nurture
    {
      templateType: 'NURTURE_DAY3' as const,
      scheduledAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
      payload: {
        templateName: WATI_TEMPLATES.NURTURE_DAY3,
        parameters: buildTemplateParams('NURTURE_DAY3', {
          leadName, eventType, propertyName, managerName,
        }),
        message: `Hi ${leadName}, following up on your ${eventType} inquiry 😊 We have exclusive packages available and recently hosted beautiful events with rave reviews! Would you like to see our latest venue photos? — ${managerName}`,
      },
    },
    // Day 5 nurture
    {
      templateType: 'NURTURE_DAY5' as const,
      scheduledAt: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
      payload: {
        templateName: WATI_TEMPLATES.NURTURE_DAY5,
        parameters: buildTemplateParams('NURTURE_DAY5', {
          leadName, eventType, propertyName, managerName,
        }),
        message: `Hi ${leadName}, sharing testimonials from our recent ${eventType} events at ${propertyName}. Our clients love our service! Would you like to schedule a venue tour? — ${managerName}`,
      },
    },
    // Day 7 urgency close
    {
      templateType: 'NURTURE_DAY7' as const,
      scheduledAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      payload: {
        templateName: WATI_TEMPLATES.NURTURE_DAY7,
        parameters: buildTemplateParams('NURTURE_DAY7', {
          leadName, eventType, propertyName, managerName,
          eventDate: eventDate || 'your date',
        }),
        message: `Hi ${leadName}, last follow-up from my side! 🙏 ${eventDate ? `Your ${eventDate}` : 'Your preferred'} date has limited availability — a few other inquiries are pending. Can we do a quick 10-minute call today? Reply CALL and I'll reach out immediately. — ${managerName}`,
      },
    },
  ]

  await db.scheduledMessage.createMany({
    data: messages.map(m => ({
      leadId,
      phone,
      templateType: m.templateType,
      scheduledAt: m.scheduledAt,
      payload: m.payload,
    })),
  })
}

// Called when lead stage changes to BOOKED
// Schedules: post-event Day 3/30/90 re-engagement
export async function schedulePostEventSequence(
  leadId: string,
  phone: string,
  leadName: string,
  eventType: string,
  eventDate: Date | null,
  propertyName: string
) {
  const baseDate = eventDate || new Date()

  const messages = [
    {
      templateType: 'POST_EVENT_DAY3' as const,
      scheduledAt: new Date(baseDate.getTime() + 3 * 24 * 60 * 60 * 1000),
      payload: {
        templateName: WATI_TEMPLATES.POST_EVENT_DAY3,
        parameters: [
          { name: 'name', value: leadName },
          { name: 'event_type', value: eventType },
          { name: 'hotel_name', value: propertyName },
        ],
        message: `Hi ${leadName}! 🙏 Thank you for choosing ${propertyName} for your ${eventType}. We hope it was everything you envisioned! Could you spare 2 minutes to share your experience? Your feedback means the world to us.`,
      },
    },
    {
      templateType: 'POST_EVENT_DAY30' as const,
      scheduledAt: new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000),
      payload: {
        templateName: WATI_TEMPLATES.POST_EVENT_DAY30,
        parameters: [
          { name: 'name', value: leadName },
          { name: 'hotel_name', value: propertyName },
        ],
        message: `Hi ${leadName}! Greetings from ${propertyName} 😊 Do you have friends or family planning a celebration soon? We'd love to offer them our special referral discount. Know someone? Reply REFER and we'll share the details!`,
      },
    },
    {
      templateType: 'POST_EVENT_DAY90' as const,
      scheduledAt: new Date(baseDate.getTime() + 90 * 24 * 60 * 60 * 1000),
      payload: {
        templateName: WATI_TEMPLATES.POST_EVENT_DAY90,
        parameters: [
          { name: 'name', value: leadName },
          { name: 'hotel_name', value: propertyName },
        ],
        message: `Hi ${leadName}! 🌟 Greetings from ${propertyName}! Planning your next event or celebration? We have exclusive offers for our returning guests. Reply OFFER to see our latest packages!`,
      },
    },
  ]

  await db.scheduledMessage.createMany({
    data: messages.map(m => ({
      leadId,
      phone,
      templateType: m.templateType,
      scheduledAt: m.scheduledAt,
      payload: m.payload,
    })),
  })
}

// Cancel pending messages for a lead (e.g., when lead is marked LOST)
export async function cancelLeadScheduledMessages(leadId: string) {
  await db.scheduledMessage.updateMany({
    where: { leadId, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  })
}
```

---

### 6.3 `lib/openai.ts` — NEW: OpenAI integration

```typescript
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Generate professional proposal content from event details
export async function generateProposalContent(params: {
  leadName: string
  eventType: string
  guestCount: number
  eventDate: string
  budgetRange: string
  propertyName: string
  notes?: string
}): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    return getProposalTemplate(params)
  }

  const prompt = `You are a professional hotel banquet sales manager writing a formal event proposal. Write a complete, personalized proposal for the following event:

Client: ${params.leadName}
Event Type: ${params.eventType}
Guest Count: ${params.guestCount}
Event Date: ${params.eventDate}
Budget Range: ${params.budgetRange}
Venue: ${params.propertyName}
Additional Notes: ${params.notes || 'None'}

Write a professional proposal that includes:
1. A warm, personalized greeting
2. Event summary and our understanding of their requirements
3. Venue highlights relevant to their event type
4. Package inclusions (catering, décor, AV, parking, accommodation options)
5. Why our venue is the right choice for this specific event
6. A clear call to action with urgency

Format as clean paragraphs. Be specific to the event type. Use Indian hospitality conventions. Keep it under 600 words. Do NOT include pricing — that will be added separately.`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 800,
    temperature: 0.7,
  })

  return response.choices[0]?.message?.content || getProposalTemplate(params)
}

// Fallback template if OpenAI unavailable
function getProposalTemplate(params: {
  leadName: string
  eventType: string
  guestCount: number
  eventDate: string
  propertyName: string
}): string {
  return `Dear ${params.leadName},

Thank you for considering ${params.propertyName} for your ${params.eventType}. We are delighted at the opportunity to host your special occasion on ${params.eventDate}.

Our banquet facilities are designed to accommodate up to ${params.guestCount} guests in an elegant setting. We offer comprehensive packages including premium catering, customized décor, state-of-the-art audio-visual equipment, dedicated event coordination, and valet parking.

Our experienced banquet team will work closely with you to ensure every detail of your ${params.eventType} is executed flawlessly. From the initial planning stages to the final toast, we are committed to making your event a memorable celebration.

We would be honoured to host your event and are confident that ${params.propertyName} will exceed your expectations. We look forward to the opportunity to discuss this further and present our complete package options.

Please feel free to contact us at your earliest convenience to schedule a venue visit.

Warm regards,
The Banquet Team
${params.propertyName}`
}

// Generate smart insights from lead data
export async function generateSmartInsights(data: {
  totalLeads: number
  newLeads: number
  conversionRate: number
  avgResponseTime: number
  topSource: string
  overdueLeads: number
  recentLostReasons: string[]
}): Promise<string[]> {
  if (!process.env.OPENAI_API_KEY) {
    return generateRuleBasedInsights(data)
  }

  const prompt = `You are a hotel revenue management consultant analyzing banquet lead performance data. Provide 3 specific, actionable insights based on this data:

Total Leads: ${data.totalLeads}
New Leads (this period): ${data.newLeads}
Lead-to-Booking Conversion: ${data.conversionRate}%
Avg First Response Time: ${data.avgResponseTime} hours
Top Lead Source: ${data.topSource}
Overdue Follow-ups: ${data.overdueLeads}
Recent Lost Reasons: ${data.recentLostReasons.join(', ') || 'None recorded'}

Return exactly 3 insights as a JSON array of strings. Each insight must be one sentence, specific, and actionable. Focus on revenue impact. Example format:
["insight 1", "insight 2", "insight 3"]`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content || '{}'
    const parsed = JSON.parse(content)
    return parsed.insights || parsed || generateRuleBasedInsights(data)
  } catch {
    return generateRuleBasedInsights(data)
  }
}

function generateRuleBasedInsights(data: {
  avgResponseTime: number
  overdueLeads: number
  conversionRate: number
  topSource: string
}): string[] {
  const insights: string[] = []
  if (data.avgResponseTime > 1) {
    insights.push(`Response time averaging ${data.avgResponseTime}h is costing conversions — the 90-second target can recover 28–40% more bookings.`)
  }
  if (data.overdueLeads > 0) {
    insights.push(`${data.overdueLeads} overdue leads need immediate follow-up before they go cold permanently.`)
  }
  if (data.conversionRate < 15) {
    insights.push(`Conversion at ${data.conversionRate}% is below the 28% benchmark — review proposal turnaround time and negotiation stage velocity.`)
  }
  if (insights.length < 3) {
    insights.push(`${data.topSource} is your top performing channel — allocate more budget here for faster lead volume growth.`)
  }
  return insights.slice(0, 3)
}

// Personalize a WhatsApp message for a specific lead
export async function personalizeMessage(
  template: string,
  leadContext: { name: string; eventType: string; notes?: string }
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) return template

  const prompt = `Personalize this WhatsApp message template for the following lead. Keep the same structure and key information but make it feel more personal and specific to their event type. Keep it under 200 words.

Template: ${template}
Lead Name: ${leadContext.name}
Event Type: ${leadContext.eventType}
Notes: ${leadContext.notes || 'None'}

Return only the personalized message text, no explanation.`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 250,
    temperature: 0.6,
  })

  return response.choices[0]?.message?.content || template
}
```

---

### 6.4 `lib/google-sheets.ts` — NEW: Google Sheets client

```typescript
import { google } from 'googleapis'

function getAuthClient() {
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
  
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

export async function getSheetHeaders(
  sheetId: string,
  tabName: string = 'Sheet1',
  headerRow: number = 1
): Promise<{ headers: string[]; sampleRows: string[][] }> {
  const auth = getAuthClient()
  const sheets = google.sheets({ version: 'v4', auth })

  // Fetch header row + next 3 rows as sample
  const range = `'${tabName}'!A${headerRow}:Z${headerRow + 3}`
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  })

  const rows = response.data.values || []
  const headers = (rows[0] || []).map(String)
  const sampleRows = rows.slice(1).map(row => row.map(String))

  return { headers, sampleRows }
}

export async function getAllRows(
  sheetId: string,
  tabName: string = 'Sheet1',
  headerRow: number = 1
): Promise<{ headers: string[]; rows: Record<string, string>[]; rawRows: string[][] }> {
  const auth = getAuthClient()
  const sheets = google.sheets({ version: 'v4', auth })

  const range = `'${tabName}'!A${headerRow}:Z`

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  })

  const allRows = response.data.values || []
  if (allRows.length === 0) return { headers: [], rows: [], rawRows: [] }

  const headers = allRows[0].map(String)
  const rawRows = allRows.slice(1).filter(row => row.some(cell => cell?.toString().trim()))
  
  const rows = rawRows.map(row => {
    const obj: Record<string, string> = {}
    headers.forEach((header, i) => {
      obj[header] = (row[i] || '').toString().trim()
    })
    return obj
  })

  return { headers, rows, rawRows }
}

// Map a raw row to lead fields using column mapping config
// columnMap: { name: "Column A", phone: "Column B", ... }
export function mapRowToLead(
  row: Record<string, string>,
  columnMap: Record<string, string>
): Partial<{
  name: string
  phone: string
  email: string
  eventType: string
  eventDate: string
  guestCount: number
  budgetMin: number
  budgetMax: number
  notes: string
}> {
  const get = (field: string) => columnMap[field] ? (row[columnMap[field]] || '').trim() : ''

  return {
    name: get('name') || undefined,
    phone: get('phone') || undefined,
    email: get('email') || undefined,
    eventType: normalizeEventType(get('eventType')),
    eventDate: get('eventDate') || undefined,
    guestCount: parseInt(get('guestCount')) || undefined,
    budgetMin: parseFloat(get('budgetMin')) || undefined,
    budgetMax: parseFloat(get('budgetMax')) || undefined,
    notes: get('notes') || undefined,
  }
}

function normalizeEventType(raw: string): string {
  if (!raw) return 'SOCIAL_EVENTS'
  const lower = raw.toLowerCase()
  if (lower.includes('wedding') || lower.includes('roka') || lower.includes('anniversary') || lower.includes('social')) return 'SOCIAL_EVENTS'
  if (lower.includes('corporate') || lower.includes('conference') || lower.includes('meeting')) return 'CORPORATE_EVENTS'
  if (lower.includes('birthday')) return 'BIRTHDAY_SOCIAL'
  if (lower.includes('promo') || lower.includes('fashion') || lower.includes('exhibition')) return 'PROMOTIONAL_EVENTS'
  if (lower.includes('entertainment') || lower.includes('music') || lower.includes('comedy')) return 'ENTERTAINMENT_EVENTS'
  if (lower.includes('season') || lower.includes('diwali') || lower.includes('christmas') || lower.includes('new year')) return 'SEASONAL_THEMATIC'
  return 'SOCIAL_EVENTS'
}

export function generateRowHash(row: string[]): string {
  return Buffer.from(row.join('|')).toString('base64').slice(0, 32)
}
```

---

### 6.5 `lib/email.ts` — NEW: Nodemailer SMTP

```typescript
import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

interface EmailPayload {
  to: string
  subject: string
  html: string
  text?: string
}

export async function sendEmail({ to, subject, html, text }: EmailPayload): Promise<boolean> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.log(`[EMAIL STUB] To: ${to} | Subject: ${subject}`)
    return true
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'NEXORA <noreply@nexora.in>',
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ''),
    })
    return true
  } catch (err) {
    console.error('[EMAIL ERROR]', err)
    return false
  }
}

export function proposalSentEmailHtml(
  leadName: string,
  eventType: string,
  propertyName: string,
  proposalTitle: string
): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">Proposal Sent — ${proposalTitle}</h2>
      <p>Dear ${leadName},</p>
      <p>Please find attached your personalized proposal for <strong>${eventType}</strong> at <strong>${propertyName}</strong>.</p>
      <p>Our team is available to answer any questions and schedule a venue visit at your convenience.</p>
      <p>Warm regards,<br/>The Banquet Team<br/>${propertyName}</p>
    </div>
  `
}

export function newLeadNotificationHtml(
  managerName: string,
  leadName: string,
  phone: string,
  eventType: string,
  source: string
): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2 style="color: #1a1a2e;">🎯 New Lead — Action Required Within 90 Seconds</h2>
      <p>Hi ${managerName},</p>
      <p>A new lead has arrived in NEXORA:</p>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Name</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${leadName}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Phone</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${phone}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Event Type</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${eventType}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Source</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${source}</td></tr>
      </table>
      <p>WhatsApp auto-response has been sent. Open NEXORA to manage this lead.</p>
    </div>
  `
}
```

---

## 7. API ROUTES — NEW AND UPDATED

### 7.1 `app/api/leads/route.ts` — UPDATE POST handler

After creating a lead, immediately:
1. Schedule nurture sequence via `scheduleLeadNurtureSequence()`
2. Send new lead email notification to assigned manager
3. Register contact in Wati via `addContact()`

```typescript
// In the POST handler, after db.lead.create():

// Get property and manager details for automation
const property = await db.property.findUnique({ where: { id: lead.propertyId } })
const manager = lead.assignedToId 
  ? await db.user.findUnique({ where: { id: lead.assignedToId } })
  : await db.user.findFirst({ where: { organizationId: session.user.organizationId, role: { in: ['MANAGER', 'OWNER'] } } })

// Register in Wati + schedule nurture
await addContact(lead.phone, lead.name, [
  { name: 'property', value: property?.name || '' },
  { name: 'event_type', value: lead.eventType },
])

await scheduleLeadNurtureSequence(
  lead.id,
  lead.phone,
  lead.name,
  EVENT_TYPE_LABELS[lead.eventType] || lead.eventType,
  lead.eventDate ? formatDate(lead.eventDate) : null,
  property?.name || 'our venue',
  manager?.name || 'our team'
)

// Email notification to manager
if (manager?.email) {
  await sendEmail({
    to: manager.email,
    subject: `🎯 New Lead: ${lead.name} — ${EVENT_TYPE_LABELS[lead.eventType]}`,
    html: newLeadNotificationHtml(manager.name, lead.name, lead.phone, EVENT_TYPE_LABELS[lead.eventType], lead.source),
  })
}
```

### 7.2 `app/api/leads/[id]/stage/route.ts` — UPDATE PATCH handler

When stage changes to BOOKED:
- Schedule post-event re-engagement sequence
- Cancel any remaining nurture messages (PENDING → CANCELLED for NURTURE types)

When stage changes to LOST:
- Cancel all pending scheduled messages

```typescript
// After db.lead.update() in PATCH /api/leads/[id]/stage:
if (newStage === 'BOOKED') {
  const property = await db.property.findUnique({ where: { id: lead.propertyId } })
  await schedulePostEventSequence(
    lead.id,
    lead.phone,
    lead.name,
    EVENT_TYPE_LABELS[lead.eventType],
    lead.eventDate,
    property?.name || 'our venue'
  )
  // Cancel remaining nurture messages
  await db.scheduledMessage.updateMany({
    where: {
      leadId: lead.id,
      status: 'PENDING',
      templateType: { in: ['NURTURE_DAY3', 'NURTURE_DAY5', 'NURTURE_DAY7'] },
    },
    data: { status: 'CANCELLED' },
  })
}

if (newStage === 'LOST') {
  await cancelLeadScheduledMessages(lead.id)
}
```

### 7.3 `app/api/cron/process-messages/route.ts` — NEW

This route is called by Railway Cron every minute. Processes all due ScheduledMessages.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendTemplateMessage, sendSessionMessage } from '@/lib/whatsapp'

export async function POST(request: NextRequest) {
  // Verify cron secret
  const secret = request.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // Fetch due messages (up to 50 per run to avoid timeouts)
  const messages = await db.scheduledMessage.findMany({
    where: {
      status: 'PENDING',
      scheduledAt: { lte: now },
    },
    take: 50,
    orderBy: { scheduledAt: 'asc' },
    include: {
      lead: {
        select: { id: true, name: true, stage: true },
      },
    },
  })

  const results = { sent: 0, failed: 0, skipped: 0 }

  for (const msg of messages) {
    // Skip if lead is LOST or BOOKED (BOOKED handled by post-event sequence)
    if (['LOST'].includes(msg.lead.stage)) {
      await db.scheduledMessage.update({
        where: { id: msg.id },
        data: { status: 'SKIPPED', sentAt: now },
      })
      results.skipped++
      continue
    }

    try {
      const payload = msg.payload as {
        templateName: string
        parameters: { name: string; value: string }[]
        message: string
      }

      // Try template message first, fall back to session message
      let result = await sendTemplateMessage(
        msg.phone,
        payload.templateName,
        payload.parameters,
        `nexora_${msg.id.slice(0, 8)}`
      )

      // If template fails (e.g., not approved yet), try session message
      if (!result.success && payload.message) {
        result = await sendSessionMessage(msg.phone, payload.message)
      }

      if (result.success) {
        await db.scheduledMessage.update({
          where: { id: msg.id },
          data: { status: 'SENT', sentAt: now },
        })

        // Log as LeadActivity
        await db.leadActivity.create({
          data: {
            leadId: msg.leadId,
            userId: await getSystemUserId(msg.lead.id),
            type: 'WHATSAPP_SENT',
            content: `Automated ${msg.templateType.replace(/_/g, ' ').toLowerCase()} message sent`,
            metadata: { templateType: msg.templateType, automated: true },
          },
        })

        results.sent++
      } else {
        await db.scheduledMessage.update({
          where: { id: msg.id },
          data: {
            status: msg.retryCount >= 3 ? 'FAILED' : 'PENDING',
            error: result.error,
            retryCount: { increment: 1 },
            scheduledAt: msg.retryCount < 3 ? new Date(now.getTime() + 15 * 60 * 1000) : msg.scheduledAt,
          },
        })
        results.failed++
      }
    } catch (err) {
      await db.scheduledMessage.update({
        where: { id: msg.id },
        data: { status: 'FAILED', error: String(err) },
      })
      results.failed++
    }
  }

  return NextResponse.json({ processed: messages.length, ...results })
}

// Get first manager/owner user ID for activity logging (system actions)
async function getSystemUserId(leadId: string): Promise<string> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: {
      property: {
        select: {
          organization: {
            select: {
              users: { where: { role: { in: ['OWNER', 'MANAGER'] } }, take: 1, select: { id: true } }
            }
          }
        }
      }
    }
  })
  return lead?.property.organization.users[0]?.id || 'system'
}
```

### 7.4 `app/api/webhooks/wati/route.ts` — NEW

Receives incoming WhatsApp messages from Wati. Configure webhook URL in Wati dashboard.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  const body = await request.json()

  // Log raw webhook
  await db.webhookEvent.create({
    data: {
      source: 'wati',
      eventType: body.type || 'unknown',
      payload: body,
    },
  })

  // Extract incoming message data
  const waId = body.waId || body.whatsappNumber
  const messageText = body.text?.body || body.message || ''
  const senderName = body.senderName || ''

  if (!waId || !messageText) {
    return NextResponse.json({ received: true })
  }

  // Find lead by phone (strip country code variations)
  const phoneVariants = [
    waId,
    waId.startsWith('91') ? waId.slice(2) : `91${waId}`,
  ]

  const lead = await db.lead.findFirst({
    where: {
      phone: { in: phoneVariants },
      stage: { notIn: ['BOOKED', 'LOST'] },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (lead) {
    // Log as activity
    const systemUser = await db.user.findFirst({
      where: {
        organizationId: (await db.property.findUnique({ where: { id: lead.propertyId }, select: { organizationId: true } }))?.organizationId,
        role: { in: ['OWNER', 'MANAGER'] },
      },
    })

    if (systemUser) {
      await db.leadActivity.create({
        data: {
          leadId: lead.id,
          userId: systemUser.id,
          type: 'NOTE',
          content: `WhatsApp reply received: "${messageText}"`,
          metadata: { inbound: true, senderName, waId },
        },
      })
    }

    // If lead is NEW and they replied, auto-advance to CONTACTED
    if (lead.stage === 'NEW') {
      await db.lead.update({
        where: { id: lead.id },
        data: { stage: 'CONTACTED' },
      })
    }
  }

  await db.webhookEvent.updateMany({
    where: { source: 'wati', payload: { path: ['waId'], equals: waId } },
    data: { processed: true },
  })

  return NextResponse.json({ received: true })
}
```

### 7.5 `app/api/proposals/generate/route.ts` — NEW

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/access'
import { db } from '@/lib/db'
import { generateProposalContent } from '@/lib/openai'
import { EVENT_TYPE_LABELS } from '@/lib/utils/constants'
import { formatDate } from '@/lib/format'

export async function POST(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  const { leadId } = await request.json()

  const lead = await db.lead.findUnique({
    where: { id: leadId },
    include: { property: true },
  })

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  const content = await generateProposalContent({
    leadName: lead.name,
    eventType: EVENT_TYPE_LABELS[lead.eventType] || lead.eventType,
    guestCount: lead.guestCount || 100,
    eventDate: lead.eventDate ? formatDate(lead.eventDate) : 'TBD',
    budgetRange: lead.budgetMin && lead.budgetMax
      ? `₹${lead.budgetMin}L – ₹${lead.budgetMax}L`
      : 'To be discussed',
    propertyName: lead.property.name,
    notes: lead.notes || undefined,
  })

  return NextResponse.json({ content })
}
```

### 7.6 `app/api/integrations/route.ts` — NEW

```typescript
// GET: list all integration connections for current property
// POST: create new integration connection
// Body: { name, provider, source, sheetId, tabName, headerRow, columnMap }
```

### 7.7 `app/api/integrations/[id]/route.ts` — NEW

```typescript
// GET: single connection details
// PATCH: update connection config
// DELETE: remove connection
```

### 7.8 `app/api/integrations/[id]/test/route.ts` — NEW

```typescript
// POST: test connection — reads headers + 3 sample rows
// Returns: { headers, sampleRows, error? }
// Uses: getSheetHeaders() from lib/google-sheets.ts
```

### 7.9 `app/api/integrations/[id]/sync/route.ts` — NEW

```typescript
// POST: run a sync — reads all rows, maps to leads, dedupes, imports
// Returns: { created, skipped, failed, errors }
// Flow:
//   1. getAllRows(sheetId, tabName, headerRow)
//   2. For each row: mapRowToLead(row, columnMap)
//   3. Generate externalId = `${connectionId}_row_${index}`
//   4. Generate rowHash = generateRowHash(rawRow)
//   5. Check db.leadExternalSource.findUnique({ where: { provider, externalId } })
//   6. Also check duplicate by phone/email
//   7. If new: db.lead.create() + db.leadExternalSource.create()
//   8. If existing and hash changed: db.lead.update() (optional, skip for MVP)
//   9. Schedule nurture sequence for each new lead
//   10. Update connection lastSyncedAt, lastSyncCount
```

### 7.10 `app/api/leads/export/route.ts` — NEW

```typescript
// GET: stream CSV of leads matching current filters
// Query params: same as GET /api/leads (stage, eventType, source, search)
// Response: Content-Disposition: attachment; filename="leads-export.csv"
// CSV columns: Name, Phone, Email, Event Type, Event Date, Guest Count, Budget, Source, Stage, Lead Score, Assigned To, Created At
```

### 7.11 `app/api/analytics/attribution/route.ts` — NEW

```typescript
// GET: CPL and conversion by campaign, source attribution
// Returns: campaigns with actual CPL vs benchmark, source-to-revenue mapping
```

### 7.12 `app/api/whatsapp/broadcasts/[id]/send/route.ts` — NEW

```typescript
// POST: execute a broadcast — sends to all matching recipients via Wati
// Flow:
//   1. Get broadcast record
//   2. Query leads matching stage/eventType filters
//   3. For each lead: sendSessionMessage(phone, message) OR sendTemplateMessage if template set
//   4. Update broadcast: sentAt, delivered count, status = SENT
//   5. Return: { sent, failed }
// Rate limit: 10 messages/second (add 100ms delay between each)
```

---

## 8. NEW PAGES

### 8.1 `app/campaigns/new/page.tsx`

```
Purpose: Create a new campaign with type-based auto-fill

Fields:
- name* (text input)
- type* (select, 6 options — on change, auto-fills budget and shows audience hint)
- platforms (multi-checkbox: META, GOOGLE, INSTAGRAM, LINKEDIN)
- budgetAmount* (number, pre-filled from CAMPAIGN_MONTHLY_BUDGETS[type], editable)
- startDate* (date input, default today)
- endDate (date input, optional)
- keywords (comma-separated tags)
- targetAudience (textarea, pre-filled with audience from CAMPAIGN_CPL_BENCHMARKS)
- notes (textarea)

On type select: show a hint card → "Benchmark CPL: ₹X–₹Y | Target: X% conversion"
On submit: POST /api/campaigns → redirect to /campaigns/[id]

UI pattern: match /leads/new page structure (use DashboardLayout wrapper)
```

### 8.2 `app/settings/integrations/page.tsx`

```
Purpose: Manage Google Sheets lead ingestion connections

Layout: DashboardLayout wrapper, two sections:
1. Existing connections list
2. Add new connection form

Connection card shows:
- Name + provider badge + source badge
- Sheet ID + tab name
- Last synced (time ago) + last sync status (✅ OK / ❌ Error)
- Records synced count
- Buttons: Sync Now | Edit | Delete

Add connection form (modal or inline):
- Connection name* (e.g., "Website Leads — Mumbai")
- Provider* (GOOGLE_SHEETS — only option for now)
- Source type* (select from LeadSource enum)
- Google Sheet URL or Sheet ID* (extract ID from URL)
- Tab name* (default: Sheet1)
- Header row (default: 1)
- "Test Connection" button → calls POST /api/integrations/[id]/test
  → shows header row and 3 sample rows in a table
- Column mapping: after test, show dropdowns to map each field:
  { name, phone, email, eventType, eventDate, guestCount, budgetMin, budgetMax, notes }
  Each dropdown shows all detected column headers
- Save → POST /api/integrations

Sync Now button behavior:
  1. Call POST /api/integrations/[id]/sync
  2. Show loading state
  3. Show result: "X leads imported, Y skipped, Z failed"
  4. Refresh connection card
```

### 8.3 `app/whatsapp/automation/page.tsx` — UPDATE

```
Current state: displays automation flows statically
Required: add scheduling status panel

Add a new section: "Scheduled Messages Queue"
- Table showing pending scheduled messages grouped by template type
- Columns: Lead Name | Template Type | Scheduled For | Status
- Filter: All / Pending / Sent / Failed
- Data: GET /api/whatsapp/scheduled (new endpoint, returns ScheduledMessage with lead)
- Shows total pending count as a badge on the page tab
```

### 8.4 `app/proposals/[id]/page.tsx` — UPDATE

```
Add AI generation button:
- "Generate Content with AI" button → calls POST /api/proposals/generate { leadId }
- Shows loading spinner while OpenAI generates
- Fills the content textarea with generated content
- User can edit before saving

Add email send capability:
- "Send via Email" button → sends proposalSentEmailHtml to lead email
- Updates proposal status to SENT on success
```

### 8.5 `app/analytics/page.tsx` — UPDATE

```
Update Campaigns tab:
- Table now shows: Campaign | Type | Leads | Budget | Spent | Actual CPL | Benchmark CPL | Bookings | Conversion | Status
- Actual CPL = spentAmount / leadsGenerated
- Benchmark CPL shown as range from CAMPAIGN_CPL_BENCHMARKS
- Color code: actual CPL in range (green), above range (red), below range (blue)
- Data from GET /api/analytics/attribution

Update Revenue tab:
- Add "By Source" section with bar chart
- Add "By Campaign Type" section
- Add "CPL trend over time" line chart
```

### 8.6 `app/platforms/[id]/page.tsx` — UPDATE

```
Add content score management:
- Content checklist items:
  [ ] Profile photos uploaded (min 10)
  [ ] Description complete (500+ words)
  [ ] Pricing information added
  [ ] Packages/menus uploaded
  [ ] Reviews responded to
  [ ] Business hours set
  [ ] Contact information verified
  [ ] Video tour uploaded
- Each checkbox updates contentScore (each item = +12.5 points, max 100)
- Save button → PATCH /api/platforms/[id] { contentScore, contentChecklist }
- Add contentChecklist Json field to PlatformListing schema
```

---

## 9. AUTOMATION EXECUTION ENGINE

### Architecture

```
Lead Created
  └─→ scheduleLeadNurtureSequence() stores 4 ScheduledMessages in DB
       │ INITIAL_RESPONSE: +5 minutes
       │ NURTURE_DAY3:     +3 days
       │ NURTURE_DAY5:     +5 days
       └─ NURTURE_DAY7:    +7 days

Lead Stage → BOOKED
  └─→ schedulePostEventSequence() stores 3 ScheduledMessages
       │ POST_EVENT_DAY3:  event date + 3 days
       │ POST_EVENT_DAY30: event date + 30 days
       └─ POST_EVENT_DAY90: event date + 90 days

Lead Stage → LOST
  └─→ cancelLeadScheduledMessages() → all PENDING → CANCELLED

Broadcast Campaign "Send Now" clicked
  └─→ POST /api/whatsapp/broadcasts/[id]/send
       └─→ send via Wati session messages in loop with 100ms delay

Railway Cron: every minute
  └─→ POST /app-url/api/cron/process-messages (Authorization: x-cron-secret)
       └─→ find ScheduledMessages WHERE status=PENDING AND scheduledAt <= now
            └─→ sendTemplateMessage() → if fails → sendSessionMessage() fallback
                 └─→ status: SENT | FAILED (retry up to 3×, then FAILED)
                      └─→ log LeadActivity { type: WHATSAPP_SENT, automated: true }
```

### Railway Cron Setup

In Railway dashboard:
1. Go to project → New Service → Cron
2. Command: `curl -s -X POST $NEXT_APP_URL/api/cron/process-messages -H "x-cron-secret: $CRON_SECRET" || true`
3. Schedule: `* * * * *` (every minute)
4. Add env var: `NEXT_APP_URL=https://your-app.railway.app`, `CRON_SECRET=your-secret`

Alternative (if Railway Cron service unavailable): use a free cron service like cron-job.org to hit the endpoint every minute.

---

## 10. GOOGLE SHEETS INTEGRATION FLOW

### GCP Setup (one-time, do before building the feature)

1. Go to console.cloud.google.com
2. Create new project: "nexora-sheets"
3. Enable API: "Google Sheets API"
4. Go to IAM & Admin → Service Accounts → Create
5. Name: "nexora-sheets-reader", Role: Viewer
6. Create key → JSON → download
7. Copy `client_email` → GOOGLE_SERVICE_ACCOUNT_EMAIL env var
8. Copy `private_key` → GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY env var (escape newlines as \n)
9. Client instruction: "Share your Google Sheet with: nexora-sheets@your-project.iam.gserviceaccount.com (Viewer access)"

### Column Mapping Default

When client has a sheet with columns, the system tries to auto-detect common column names:
```
name → ["name", "full name", "client name", "lead name", "contact name"]
phone → ["phone", "mobile", "contact", "phone number", "mobile number", "whatsapp"]
email → ["email", "email id", "email address"]
eventType → ["event type", "event", "type", "occasion"]
eventDate → ["event date", "date", "wedding date", "function date"]
guestCount → ["guests", "pax", "guest count", "number of guests", "headcount"]
budgetMin → ["budget min", "min budget", "budget from"]
budgetMax → ["budget max", "max budget", "budget", "budget (lakhs)"]
notes → ["notes", "remarks", "comments", "message", "requirements"]
```

Auto-mapping is a suggestion. User must confirm before saving.

---

## 11. REMAINING DAY-BY-DAY EXECUTION PLAN

### June 18, 2026 (Today) — WhatsApp + Automation Foundation

**Priority: Get Wati real + automation engine running**

**Step 1: Add new packages**
```bash
npm install openai googleapis
```

**Step 2: Update Prisma schema**
- Add ScheduledMessage, WebhookEvent, IntegrationConnection, LeadExternalSource models
- Add campaignId to Lead
- Run: `npx prisma db push && npx prisma generate`

**Step 3: Create new lib files**
- `lib/automation.ts` (spec in section 6.2)
- `lib/openai.ts` (spec in section 6.3)
- `lib/google-sheets.ts` (spec in section 6.4)
- `lib/email.ts` (spec in section 6.5)
- Update `lib/whatsapp.ts` with full Wati implementation (spec in section 6.1)

**Step 4: Create cron API route**
- `app/api/cron/process-messages/route.ts` (spec in section 7.3)

**Step 5: Create webhook API route**
- `app/api/webhooks/wati/route.ts` (spec in section 7.4)

**Step 6: Update lead creation API**
- `app/api/leads/route.ts` POST → add automation scheduling (spec in section 7.1)

**Step 7: Update stage change API**
- `app/api/leads/[id]/stage/route.ts` → add post-event/cancel scheduling (spec in section 7.2)

**Step 8: Build campaigns/new page**
- `app/campaigns/new/page.tsx` (spec in section 8.1)
- Add "Create Campaign" button link to `/campaigns/new` in `app/campaigns/page.tsx`

**End of Day 18 target:**
- Wati integration live (test with real phone number)
- Lead creation triggers WhatsApp auto-response (5-min delay for testing, change to 0 for demo)
- Cron endpoint processes due messages
- campaigns/new page works

---

### June 19, 2026 — OpenAI + Integrations + Broadcast

**Step 1: Proposal AI generation**
- `app/api/proposals/generate/route.ts` (spec in section 7.5)
- Update `app/leads/[id]/proposal/new/page.tsx` to add "Generate with AI" button
- Update `app/proposals/[id]/page.tsx` to add "Generate with AI" and email send

**Step 2: Google Sheets integration backend**
- `app/api/integrations/route.ts`
- `app/api/integrations/[id]/route.ts`
- `app/api/integrations/[id]/test/route.ts`
- `app/api/integrations/[id]/sync/route.ts`

**Step 3: Google Sheets UI**
- `app/settings/integrations/page.tsx` (spec in section 8.2)
- Add "Integrations" tab to settings sidebar nav

**Step 4: Broadcast execution**
- `app/api/whatsapp/broadcasts/[id]/send/route.ts` (spec in section 7.12)
- Update broadcast list UI — add "Send Now" / "Execute" button that calls this route
- Show sent/delivered stats update after execution

**Step 5: Scheduled messages queue UI**
- `app/api/whatsapp/scheduled/route.ts` — GET pending messages with lead info
- Update `/whatsapp` page automation tab to show queue (spec in section 8.3)

**End of Day 19 target:**
- AI proposal generation works (test with real OpenAI key)
- Google Sheets test connection + sync work end-to-end
- Broadcast "Send Now" actually sends messages via Wati
- Scheduled queue visible in WhatsApp automation tab

---

### June 20, 2026 — Analytics + Platform + Attribution

**Step 1: Source-to-campaign attribution**
- Update `app/leads/new/page.tsx` → add optional campaign selector field (GET /api/campaigns for dropdown)
- Update `app/api/leads/route.ts` POST → save campaignId
- Update lead detail page to show "Source Campaign"

**Step 2: Analytics attribution endpoint**
- `app/api/analytics/attribution/route.ts` (spec in section 7.11)
- Returns: each campaign with actual CPL, leads generated, bookings, revenue

**Step 3: Update Analytics page**
- Campaigns tab: wire to attribution endpoint, show actual vs benchmark CPL with color coding
- Revenue tab: add source breakdown + campaign type breakdown charts (spec in section 8.5)

**Step 4: Platform content score management**
- Add `contentChecklist` Json field to PlatformListing in schema + db push
- Update `app/platforms/[id]/page.tsx` (spec in section 8.6)

**Step 5: Lead CSV export**
- `app/api/leads/export/route.ts` (spec in section 7.10)
- Update `app/leads/page.tsx` export button to hit this endpoint

**End of Day 20 target:**
- Analytics shows real CPL vs benchmark with color coding
- Platform content score checklist works
- CSV export downloads correctly
- Campaign attribution visible on lead detail

---

### June 21, 2026 — Polish + Deploy + Testing

**Step 1: Polish audit (morning)**

Loading skeletons — add to every page that fetches data:
```typescript
// Pattern: show skeleton cards while data loads
if (isLoading) return <LoadingSkeleton count={6} />
```
Needed on: /leads, /campaigns, /platforms, /analytics, /proposals, /whatsapp, /settings

Error states — every API call needs an error display:
```typescript
if (error) return <ErrorState message="Failed to load leads" onRetry={refetch} />
```

Toast audit — ensure these mutations show toasts:
- Lead created, stage changed, note added, task added/completed
- Campaign created/updated
- Platform updated
- Proposal created/sent/accepted/declined
- Template created/updated
- Broadcast saved/sent
- Settings saved
- Integration synced

Dark mode audit — check every new page added (campaigns/new, settings/integrations, etc.) uses consistent dark classes

Empty states — pages with no data should show EmptyState component with CTA:
- /leads: "No leads yet — Add your first lead or import from CSV"
- /campaigns: "No campaigns yet — Create your first campaign"
- /proposals: "No proposals yet"

**Step 2: Proposal PDF print**
Add print CSS to `app/proposals/[id]/page.tsx`:
```typescript
// Add to the page component
<style jsx global>{`
  @media print {
    nav, .sidebar, .no-print { display: none !important; }
    .proposal-content { max-width: 100%; padding: 2rem; }
    body { background: white; color: black; }
  }
`}</style>
```
"Download PDF" button: `onClick={() => window.print()}`

**Step 3: Railway deployment**

Setup:
1. `railway login` → `railway link` → select or create project
2. Add services: PostgreSQL (managed), Web (Next.js)
3. Set all env vars via `railway variables set KEY=VALUE` or Railway dashboard

Deploy:
```bash
railway up
```

Post-deploy:
```bash
railway run npx prisma db push
railway run node prisma/seed.js
```

Verify:
- Login works
- Lead creation sends WhatsApp (check Wati logs)
- Cron endpoint accessible at /api/cron/process-messages

**Step 4: Setup Railway Cron (section 9)**

**Step 5: Full demo script run-through**

Run through every step of the demo:
1. Login as manager@demo.com
2. Dashboard → verify KPIs load, overdue widget shows, trend chart shows
3. Add new lead → verify WhatsApp auto-response scheduled
4. Lead detail → change stage → verify timeline updates
5. Create proposal → click Generate AI → verify content appears
6. Campaigns → Create Campaign → verify type auto-fills budget
7. Analytics → check CPL vs benchmark
8. WhatsApp → Templates list → Automation tab (queue) → Broadcast → Send
9. Platforms → Edit → update content checklist
10. Settings → Integrations → Add Sheet → Test → Sync
11. Logout → verify redirect to login

**End of Day 21 target:**
- Application deployed on Railway
- All flows tested end-to-end
- Demo script verified
- Critical bugs fixed

---

### June 22, 2026 (Monday) — Demo Day Buffer

- Fix any critical bugs found in Sunday evening test
- Clear test data, re-run seed for clean demo data
- Have backup plan: if Railway has issues, run locally and screen-share
- Prepare 5-minute demo flow (keep it tight: create lead → WhatsApp → proposal AI → analytics → Sheets sync)

---

## 12. COMPLETE TESTING CHECKLIST

### WhatsApp Automation
- [ ] Create lead → WhatsApp message queued in ScheduledMessage table
- [ ] Cron processes the message and sends via Wati (check Wati logs)
- [ ] LeadActivity created: "Automated initial_response message sent"
- [ ] Day 3/5/7 messages scheduled with correct timestamps
- [ ] Stage → BOOKED → post-event messages scheduled, nurture messages cancelled
- [ ] Stage → LOST → all pending messages cancelled
- [ ] Incoming webhook: reply from customer logs as LeadActivity
- [ ] Incoming webhook: NEW lead auto-advances to CONTACTED on reply
- [ ] Broadcast "Send Now" → messages delivered to all recipients

### Proposal AI
- [ ] Create proposal from lead → "Generate AI" button shows
- [ ] AI generation returns personalized content based on event type
- [ ] Content fills textarea (editable before save)
- [ ] "Send via Email" sends email to lead email address
- [ ] "Download PDF" opens print dialog

### Google Sheets
- [ ] Add integration connection with Sheet ID and tab name
- [ ] "Test Connection" returns detected headers + 3 sample rows
- [ ] Column mapping UI shows all detected headers as dropdown options
- [ ] "Sync Now" imports new rows as leads
- [ ] Duplicate phone/email NOT imported twice
- [ ] Imported lead appears in leads list with correct source tag
- [ ] LeadActivity: "Lead imported from Google Sheet"

### Campaigns
- [ ] Create campaign at /campaigns/new
- [ ] Type selection auto-fills budget + shows audience hint
- [ ] Campaign appears in list immediately after creation
- [ ] Campaign detail shows CPL vs benchmark in analytics tab

### Analytics
- [ ] Campaigns tab: shows actual CPL for each campaign
- [ ] Color coding: CPL in benchmark range (green), over (red), under (blue)
- [ ] Revenue tab: source breakdown chart loads
- [ ] Period filter (7d/30d/90d) changes all metrics

### Platforms
- [ ] Platform detail: content checklist renders
- [ ] Checking item updates contentScore
- [ ] Score persists on page reload

### Exports
- [ ] Lead CSV export downloads with correct headers and data
- [ ] Filters applied to list are reflected in CSV

### Auth + RBAC
- [ ] Login works with all 3 demo users
- [ ] EXECUTIVE cannot delete leads (403)
- [ ] EXECUTIVE cannot see Settings > Users
- [ ] Logout clears session and redirects to login

### Polish
- [ ] Loading skeletons visible on first load of all list pages
- [ ] Error states show if API fails (test by temporarily breaking API)
- [ ] Toast on every create/update/delete
- [ ] All pages work in dark mode
- [ ] Empty states show correct CTAs when no data

---

## 13. DEMO CREDENTIALS

```
owner@demo.com    / Demo@1234  → OWNER
manager@demo.com  / Demo@1234  → MANAGER
exec@demo.com     / Demo@1234  → EXECUTIVE
```

---

## 14. CRITICAL DECISIONS (FINAL)

1. **ORM:** Prisma 6 — faster scaffold, better TypeScript support
2. **Auth:** NextAuth v5 beta.31, JWT strategy, Credentials provider
3. **WhatsApp:** Wati Business API — sendTemplateMessage for scheduled/drip, sendSessionMessage as fallback
4. **Automation:** DB-backed ScheduledMessage + Railway Cron (no BullMQ/Redis needed for Phase 1)
5. **AI:** OpenAI GPT-4o — proposal generation + smart insights; graceful fallback if key not set
6. **Google Sheets:** googleapis service account; clients share sheet with service account email
7. **Email:** Nodemailer SMTP — new lead notifications, proposal emails
8. **Deployment:** Railway — managed Postgres + web service + cron service
9. **Multi-tenancy:** Row-level by organizationId + propertyId — every query includes these
10. **File storage:** Skip for June 22 demo; add R2 post-demo for brochure/proposal PDFs
11. **App structure:** FLAT (no route groups) — all pages at app/pagename/page.tsx; DashboardLayout applied as component wrapper
12. **Cron security:** x-cron-secret header on all cron endpoints
13. **WhatsApp template fallback:** If Wati template not approved, fall back to session message automatically
14. **Lead import dedup:** By (provider, externalId) first, then by phone, then by email — stop at first match
15. **OpenAI proposal:** Always editable by user before save; never auto-save AI content

---

## 15. ENV VARS CHECKLIST FOR RAILWAY

User must provide:
- [ ] KAPSO_API_KEY (from Kapso dashboard → Settings → API Keys)
- [ ] KAPSO_PHONE_NUMBER_ID (from Kapso dashboard → WhatsApp → Phone Numbers → ID)
- [ ] OPENAI_API_KEY (from platform.openai.com)
- [ ] GOOGLE_SERVICE_ACCOUNT_EMAIL (from GCP service account JSON)
- [ ] GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (from GCP JSON — escape newlines as \n)
- [ ] SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
- [ ] NEXTAUTH_SECRET (generate: `openssl rand -base64 32`)
- [ ] NEXTAUTH_URL (your Railway app URL, e.g., https://nexora.up.railway.app)
- [ ] CRON_SECRET (generate: `openssl rand -hex 32`)

Auto-set by Railway:
- DATABASE_URL (from managed Postgres addon)

---

## 16. CURRENT CODEBASE — ACTUAL FILE LOCATIONS

**Important: Routes are FLAT, not in route groups.**

```
app/
├── layout.tsx               ← root layout
├── page.tsx                 ← dashboard
├── providers.tsx
├── globals.css
├── login/
│   ├── page.tsx
│   └── login-form.tsx
├── leads/
│   ├── page.tsx
│   ├── new/page.tsx
│   ├── import/page.tsx
│   └── [id]/
│       ├── page.tsx
│       └── proposal/new/page.tsx
├── campaigns/
│   ├── page.tsx
│   ├── [id]/page.tsx
│   └── new/page.tsx         ← MISSING, must create
├── whatsapp/
│   └── page.tsx
├── platforms/
│   ├── page.tsx
│   └── [id]/page.tsx
├── analytics/
│   └── page.tsx
├── proposals/
│   ├── page.tsx
│   └── [id]/page.tsx
├── settings/
│   ├── page.tsx
│   └── integrations/page.tsx ← MISSING, must create
└── api/
    ├── auth/[...nextauth]/route.ts
    ├── leads/route.ts, [id]/route.ts, [id]/stage/route.ts,
    │   [id]/activities/route.ts, [id]/tasks/route.ts,
    │   [id]/whatsapp/route.ts, count/route.ts, import/route.ts
    │   export/route.ts          ← MISSING
    ├── campaigns/route.ts, [id]/route.ts
    ├── platforms/route.ts, [id]/route.ts
    ├── whatsapp/templates/route.ts, [id]/route.ts,
    │   automation/route.ts, broadcasts/route.ts,
    │   broadcasts/[id]/send/route.ts  ← MISSING
    │   scheduled/route.ts            ← MISSING
    ├── proposals/route.ts, [id]/route.ts
    │   generate/route.ts             ← MISSING
    ├── tasks/[id]/route.ts
    ├── users/route.ts
    ├── integrations/route.ts         ← MISSING
    │   [id]/route.ts                 ← MISSING
    │   [id]/test/route.ts            ← MISSING
    │   [id]/sync/route.ts            ← MISSING
    ├── analytics/dashboard/route.ts, funnel/route.ts,
    │   sources/route.ts, trend/route.ts, overdue/route.ts,
    │   attribution/route.ts          ← MISSING
    ├── settings/property/route.ts, users/route.ts
    ├── cron/process-messages/route.ts ← MISSING
    └── webhooks/wati/route.ts         ← MISSING

lib/
├── db.ts, auth.ts, access.ts, utils.ts, format.ts
├── whatsapp.ts    ← UPDATE with full Wati implementation
├── automation.ts  ← MISSING
├── openai.ts      ← MISSING
├── google-sheets.ts ← MISSING
├── email.ts       ← MISSING
├── campaign-benchmarks.ts
└── validations/lead.ts, campaign.ts, platform.ts, proposal.ts,
    whatsapp.ts, settings.ts

components/
├── dashboard-layout.tsx ← DashboardLayout wrapper used in every page
├── sidebar.tsx          ← add Integrations link under Settings
├── ...existing components
```

---

## 17. SIDEBAR NAVIGATION UPDATES

`components/sidebar.tsx` — add these links to the nav:
- Under Settings section: "Integrations" → `/settings/integrations`
- WhatsApp sub-nav: "Scheduled Queue" badge showing count of pending messages

---

## 18. SEED DATA — ADDITIONS FOR DEMO

Add to `prisma/seed.js` — these records for a complete demo:

**ScheduledMessages (5):**
- For lead[0]: pending INITIAL_RESPONSE scheduled 5 mins from seed time
- For lead[1]: pending NURTURE_DAY3 scheduled 3 days from seed time
- For lead[2]: pending NURTURE_DAY7 scheduled 7 days from seed time
- For lead[3] (BOOKED): POST_EVENT_DAY3 scheduled
- For lead[4] (BOOKED): POST_EVENT_DAY30 scheduled

**IntegrationConnections (1 demo connection):**
```javascript
{
  organizationId: org.id,
  propertyId: property.id,
  provider: 'GOOGLE_SHEETS',
  name: 'Website Leads — Demo',
  source: 'DIRECT',
  sheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms', // public demo sheet
  tabName: 'Sheet1',
  headerRow: 1,
  columnMap: { name: 'Name', phone: 'Phone', email: 'Email', eventType: 'Event Type' },
  status: 'ACTIVE',
  lastSyncedAt: new Date(),
  lastSyncCount: 12,
  lastSyncStatus: 'ok',
}
```

---

## 19. WATI TEMPLATE APPROVAL NOTES

For the demo to work with real WhatsApp messages, templates need to be pre-approved in Wati:
- Log in to Wati dashboard
- Go to Templates → Create Template
- Template names must match `WATI_TEMPLATES` constants in `lib/whatsapp.ts`
- Approval takes 24–72 hours from Meta

**For demo day fallback:** The system sends session messages if template fails. Session messages work within the 24-hour window for any phone that has messaged the WhatsApp Business number first. For demo, manually send a test message TO the WhatsApp Business number to open the 24-hour window, then all session messages will work.

**Demo-safe approach:** Before the Monday presentation, send one WhatsApp message from the demo phone number to the business number. Then all automated messages will go through as session messages without needing template approval.

---

## 20. FEATURE GATES BY PRICING TIER (for future reference)

| Feature | STARTER ₹50K/mo | GROWTH ₹1L/mo |
|---|---|---|
| Lead Dashboard | Yes (100 leads/mo) | Yes (400 leads/mo) |
| Platform Listings | 2 | 4+ |
| WhatsApp Auto-Response | Yes | Yes |
| WhatsApp Broadcast | No | Yes |
| Campaigns | 2 managed | 6 managed |
| Google Sheets Integration | 1 connection | Multiple |
| AI Proposal Generation | No | Yes |
| Advanced Analytics | No | Yes |
| Priority Support | No | Yes |

Not enforced in code for June 22 demo. Will be added as `tier` check middleware in Phase 1.
```
