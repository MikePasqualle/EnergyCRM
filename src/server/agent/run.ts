import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'
import type { SessionUser } from '@/server/permissions'
import { getAgentConfig, getSecret } from './config'
import { SYSTEM, ctxPrefix, stripCtx } from './prompt'
import { STEP_LABELS, TOOLS, runTool, type Card, type Mode } from './tools'

export type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'step'; tool: string; label: string }
  | { type: 'pending'; id: string; card: Card }
  | { type: 'error'; message: string }
  | { type: 'done'; threadId: number }

const MAX_STEPS = 10
const MAX_THREAD_ROWS = 120
type Msg = Anthropic.Beta.BetaMessageParam

const g = globalThis as unknown as { __agentBusy?: Set<number>; __agentRate?: Map<number, number[]>; __agentClient?: { key: string; c: Anthropic } }
const busy = () => (g.__agentBusy ??= new Set())
const client = (key: string) => { if (g.__agentClient?.key !== key) g.__agentClient = { key, c: new Anthropic({ apiKey: key }) }; return g.__agentClient.c }

/** Не більше 20 запитів на хвилину на користувача. */
function rateLimited(userId: number) {
  const m: Map<number, number[]> = (g.__agentRate ??= new Map())
  const now = Date.now()
  const arr = (m.get(userId) ?? []).filter((t: number) => now - t < 60_000)
  if (arr.length >= 20) { m.set(userId, arr); return true }
  arr.push(now); m.set(userId, arr)
  return false
}

export async function getActiveThread(userId: number, channel: 'web' | 'telegram') {
  const t = await db.agentThread.findFirst({ where: { userId, channel }, orderBy: { updatedAt: 'desc' }, include: { _count: { select: { messages: true } } } })
  if (t && t._count.messages < MAX_THREAD_ROWS) return t.id
  return (await db.agentThread.create({ data: { userId, channel } })).id
}
export async function newThread(userId: number, channel: 'web' | 'telegram') {
  return (await db.agentThread.create({ data: { userId, channel } })).id
}

const stripThinking = (messages: Msg[]): Msg[] =>
  messages.map((m) => (m.role === 'assistant' && Array.isArray(m.content) ? { ...m, content: m.content.filter((b) => b.type !== 'thinking' && b.type !== 'redacted_thinking') } : m)).filter((m) => !Array.isArray(m.content) || m.content.length > 0)

async function save(threadId: number, role: 'user' | 'assistant', content: unknown) {
  await db.agentMessage.create({ data: { threadId, role, content: content as Prisma.InputJsonValue } })
  await db.agentThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } })
}

export async function runAgent(p: { threadId: number; user: SessionUser; mode: Mode; text: string; channel: 'web' | 'telegram'; voice?: boolean; emit: (e: AgentEvent) => void }) {
  const { threadId, user, mode, emit } = p
  const apiKey = (await getSecret('anthropic')).value
  if (!apiKey) { emit({ type: 'error', message: 'Агент не налаштований: додайте ключ Claude API в Налаштування → AI-агент і Telegram.' }); return }
  if (rateLimited(user.id)) { emit({ type: 'error', message: 'Забагато запитів. Зачекайте хвилину.' }); return }
  if (busy().has(threadId)) { emit({ type: 'error', message: 'Попередній запит ще виконується.' }); return }
  busy().add(threadId)
  try {
    const owns = await db.agentThread.findFirst({ where: { id: threadId, userId: user.id }, select: { id: true } })
    if (!owns) { emit({ type: 'error', message: 'Розмову не знайдено' }); return }
    const cfg = await getAgentConfig()
    const rows = await db.agentMessage.findMany({ where: { threadId }, orderBy: { id: 'asc' } })
    const messages: Msg[] = rows.map((r) => ({ role: r.role as 'user' | 'assistant', content: r.content as never }))
    const userContent = `${ctxPrefix({ mode, userName: user.name, role: user.role.name, channel: p.channel, voice: p.voice })}\n${p.text}`
    messages.push({ role: 'user', content: userContent })
    await save(threadId, 'user', userContent)

    let needSep = false
    for (let step = 0; step < MAX_STEPS; step++) {
      const params = {
        model: cfg.model, max_tokens: 16000, system: SYSTEM, tools: TOOLS as unknown as Anthropic.Beta.BetaTool[],
        output_config: { effort: cfg.effort },
        // серверний fallback при відмові моделі недоступний для Haiku 5.5
        ...(cfg.model === 'claude-haiku-5-5' ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
      }
      const call = async (msgs: Msg[]) => {
        const stream = client(apiKey).beta.messages.stream({ ...params, messages: msgs } as never)
        stream.on('text', (d: string) => { if (needSep) { emit({ type: 'text', delta: '\n\n' }); needSep = false } emit({ type: 'text', delta: d }) })
        return (await stream.finalMessage()) as Anthropic.Beta.BetaMessage
      }
      let final: Anthropic.Beta.BetaMessage
      try {
        final = await call(messages)
      } catch (e) {
        // історія з блоками міркування, привʼязаними до іншої розмови/моделі, може бути відхилена — повторюємо без них
        if (e instanceof Anthropic.BadRequestError && /think/i.test(e.message)) final = await call(stripThinking(messages))
        else throw e
      }
      messages.push({ role: 'assistant', content: final.content as never })
      await save(threadId, 'assistant', final.content)
      if (final.stop_reason === 'refusal') { emit({ type: 'error', message: 'Запит відхилено політиками безпеки моделі. Сформулюйте інакше.' }); break }
      if (final.stop_reason === 'max_tokens') { emit({ type: 'error', message: 'Відповідь обірвано через ліміт довжини. Попросіть коротше або по частинах.' }); break }
      if (final.stop_reason !== 'tool_use') break
      if (final.content.some((b) => b.type === 'text' && b.text.trim())) needSep = true
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
      for (const b of final.content) {
        if (b.type !== 'tool_use') continue
        emit({ type: 'step', tool: b.name, label: STEP_LABELS[b.name] ?? b.name })
        const r = await runTool({ u: user, mode, threadId }, b.name, (b.input ?? {}) as Record<string, unknown>)
        if (r.pending) emit({ type: 'pending', id: r.pending.id, card: r.pending.card })
        results.push({ type: 'tool_result', tool_use_id: b.id, content: r.text, ...(r.isError ? { is_error: true } : {}) })
      }
      messages.push({ role: 'user', content: results })
      await save(threadId, 'user', results)
      if (step === MAX_STEPS - 1) emit({ type: 'error', message: 'Забагато кроків в одному запиті. Уточніть завдання.' })
    }
    emit({ type: 'done', threadId })
  } catch (e) {
    console.error('[agent] помилка запиту', e)
    const m = e instanceof Anthropic.AuthenticationError ? 'Ключ Claude API недійсний. Перевірте ключ у налаштуваннях.'
      : e instanceof Anthropic.RateLimitError ? 'Claude API: перевищено ліміт запитів. Спробуйте за хвилину.'
      : e instanceof Anthropic.APIError ? `Помилка Claude API (${e.status ?? 'мережа'}). Спробуйте ще раз.` : 'Не вдалося отримати відповідь агента.'
    emit({ type: 'error', message: m })
  } finally {
    busy().delete(threadId)
  }
}

/* ===================== Історія для інтерфейсу ===================== */
export type UiMessage = { role: 'me' | 'bot'; text: string; steps?: string[] }
export type UiPending = { id: string; card: Card }

export async function loadHistory(threadId: number, userId: number): Promise<{ messages: UiMessage[]; pending: UiPending[] }> {
  const rows = await db.agentMessage.findMany({ where: { thread: { id: threadId, userId } }, orderBy: { id: 'asc' } })
  const out: UiMessage[] = []
  let bot: UiMessage | null = null
  for (const r of rows) {
    const c = r.content as unknown
    if (r.role === 'user') {
      if (typeof c === 'string') {
        bot = null
        if (c.startsWith('⟦sys')) continue
        out.push({ role: 'me', text: stripCtx(c) })
      }
      continue
    }
    if (typeof c === 'string') { out.push({ role: 'bot', text: c }); bot = null; continue }
    if (!Array.isArray(c)) continue
    if (!bot) { bot = { role: 'bot', text: '', steps: [] }; out.push(bot) }
    for (const b of c as { type: string; text?: string; name?: string }[]) {
      if (b.type === 'text' && b.text) bot.text += (bot.text ? '\n\n' : '') + b.text
      if (b.type === 'tool_use' && b.name) bot.steps!.push(STEP_LABELS[b.name] ?? b.name)
    }
  }
  const pend = await db.agentAction.findMany({ where: { threadId, userId, status: 'PENDING' }, orderBy: { createdAt: 'asc' } })
  return { messages: out.filter((m) => m.text || m.steps?.length), pending: pend.map((a) => ({ id: a.id, card: a.card as unknown as Card })) }
}

/** Записує результат підтвердження в розмову: системна нотатка для моделі + підсумок для користувача. */
export async function recordOutcome(threadId: number, userId: number, ok: boolean, message: string, href?: string) {
  const owns = await db.agentThread.findFirst({ where: { id: threadId, userId }, select: { id: true } })
  if (!owns) return
  await save(threadId, 'user', `⟦sys⟧ Користувач ${ok ? 'підтвердив, система виконала' : 'не підтвердив або виконання не вдалося'}: ${message}`)
  await save(threadId, 'assistant', [{ type: 'text', text: `${ok ? 'Готово' : 'Не виконано'}: ${message}${href ? ` ([відкрити](${href}))` : ''}` }])
}
