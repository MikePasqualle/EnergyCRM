import { agentUser, json } from '@/server/agent/http'
import { getActiveThread, runAgent, type AgentEvent } from '@/server/agent/run'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Запит до агента; відповідь — потік подій (SSE): text, step, pending, error, done. */
export async function POST(req: Request) {
  const u = await agentUser(req, true)
  if (!u) return json({ error: 'Потрібен вхід' }, 401)
  const b = (await req.json().catch(() => null)) as { text?: unknown; mode?: unknown } | null
  const text = typeof b?.text === 'string' ? b.text.trim() : ''
  if (!text || text.length > 4000) return json({ error: 'Напишіть запит (до 4000 символів)' }, 400)
  const mode = b?.mode === 'actions' ? 'actions' : 'chat'
  const threadId = await getActiveThread(u.id, 'web')
  const enc = new TextEncoder()
  const stream = new ReadableStream({
    async start(ctrl) {
      const emit = (e: AgentEvent) => { try { ctrl.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`)) } catch { /* клієнт відключився */ } }
      await runAgent({ threadId, user: u, mode, text, channel: 'web', emit })
      try { ctrl.close() } catch { /* вже закрито */ }
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' } })
}
