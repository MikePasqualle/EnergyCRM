import { agentUser, json } from '@/server/agent/http'
import { hasClaudeKey } from '@/server/agent/config'
import { getActiveThread, loadHistory, newThread } from '@/server/agent/run'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const u = await agentUser(req, false)
  if (!u) return json({ error: 'Потрібен вхід' }, 401)
  const threadId = await getActiveThread(u.id, 'web')
  return json({ ready: await hasClaudeKey(), ...(await loadHistory(threadId, u.id)) })
}

/** Нова розмова */
export async function POST(req: Request) {
  const u = await agentUser(req, true)
  if (!u) return json({ error: 'Потрібен вхід' }, 401)
  await newThread(u.id, 'web')
  return json({ ok: true })
}
