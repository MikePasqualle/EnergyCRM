import { agentUser, json } from '@/server/agent/http'
import { recordOutcome } from '@/server/agent/run'
import { confirmAction } from '@/server/agent/tools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Підтвердження або скасування зміни, запропонованої агентом. */
export async function POST(req: Request) {
  const u = await agentUser(req, true)
  if (!u) return json({ error: 'Потрібен вхід' }, 401)
  const b = (await req.json().catch(() => null)) as { id?: unknown; approve?: unknown } | null
  if (typeof b?.id !== 'string') return json({ error: 'Некоректний запит' }, 400)
  const r = await confirmAction(u, b.id, b.approve === true)
  if (r.threadId && !r.message.startsWith('Цю дію вже')) await recordOutcome(r.threadId, u.id, r.ok, r.message, r.href)
  return json(r)
}
