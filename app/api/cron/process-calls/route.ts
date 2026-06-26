import { NextRequest, NextResponse } from 'next/server'

import { prisma } from '@/lib/db'
import { initiateAiCall } from '@/lib/ai-calling'

// Railway calls this every minute (same cron as process-messages).
// Add to railway.toml: [[cron]] schedule = "* * * * *" command = "curl -X POST $APP_URL/api/cron/process-calls -H 'x-cron-secret: $CRON_SECRET'"
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const pendingCalls = await prisma.aiCall.findMany({
    where: {
      status: 'PENDING',
      scheduledAt: { lte: new Date() },
    },
    take: 10,
    orderBy: { scheduledAt: 'asc' },
  })

  const results = { dialed: 0, failed: 0 }

  for (const call of pendingCalls) {
    try {
      await initiateAiCall(call.id)
      results.dialed++
    } catch (err) {
      console.error(`[process-calls] Failed to dial AiCall ${call.id}:`, err)
      await prisma.aiCall.update({
        where: { id: call.id },
        data: { status: 'FAILED', notes: err instanceof Error ? err.message : 'Unknown error' },
      })
      results.failed++
    }
  }

  return NextResponse.json({ processed: pendingCalls.length, ...results })
}
