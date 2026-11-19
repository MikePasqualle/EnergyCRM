import 'server-only'
import { getAgentConfig, hasVoiceKey, saveTelegramMode, type AgentMode } from './config'
import { getActiveThread, newThread, recordOutcome, runAgent } from './run'
import { confirmAction, type Card } from './tools'
import { loadSessionUser } from './user'
import { transcribe } from './transcribe'

/** Telegram-бот: той самий агент, що й у веб-панелі. Режим long polling — публічна адреса та HTTPS не потрібні. */
type State = { run: number; abort?: AbortController; status: 'off' | 'starting' | 'running' | 'error'; error?: string; botName?: string }
const g = globalThis as unknown as { __tg?: State }
const st = (): State => (g.__tg ??= { run: 0, status: 'off' })
export const telegramStatus = () => ({ ...st() })

const API = process.env.TELEGRAM_API_URL || 'https://api.telegram.org'
async function api<T = unknown>(token: string, method: string, body?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const r = await fetch(`${API}/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}), signal })
  const j = (await r.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string; error_code?: number } | null
  if (!j?.ok) throw Object.assign(new Error(j?.description ?? `Telegram ${r.status}`), { code: j?.error_code ?? r.status })
  return j.result as T
}

export async function verifyToken(token: string): Promise<{ username: string }> {
  const me = await api<{ username: string }>(token, 'getMe')
  return { username: me.username }
}

export async function sendTest(token: string, chatId: string) {
  await api(token, 'sendMessage', { chat_id: chatId, text: 'EnergyCRM: звʼязок із Telegram працює. Напишіть запит або надішліть голосове.' })
}

/* ===================== Форматування ===================== */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Markdown відповіді моделі → HTML, який розуміє Telegram. Таблиці стають блоком <pre>. */
export function toTelegramHtml(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*\|/.test(line)) {
      const tbl: string[] = []
      while (i < lines.length && /^\s*\|/.test(lines[i])) { if (!/^\s*\|[\s:|-]+\|?\s*$/.test(lines[i])) tbl.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.replace(/\*\*/g, '').trim()).join(' · ')); i++ }
      i--
      out.push(`<pre>${esc(tbl.join('\n'))}</pre>`)
      continue
    }
    let t = esc(line)
    t = t.replace(/^#{1,6}\s+(.*)$/, '<b>$1</b>').replace(/^\s*[-*]\s+/, '• ')
    t = t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>')
    t = t.replace(/\[([^\]]+)\]\((\/[^)]*)\)/g, (_m, text: string, href: string) => (process.env.PUBLIC_URL ? `<a href="${process.env.PUBLIC_URL.replace(/\/$/, '')}${href}">${text}</a>` : text))
    out.push(t)
  }
  return out.join('\n')
}

function chunks(s: string, max = 3900): string[] {
  const res: string[] = []
  let cur = ''
  for (const para of s.split('\n\n')) {
    if ((cur + '\n\n' + para).length > max && cur) { res.push(cur); cur = para } else cur = cur ? cur + '\n\n' + para : para
    while (cur.length > max) { res.push(cur.slice(0, max)); cur = cur.slice(max) }
  }
  if (cur) res.push(cur)
  return res
}

async function say(token: string, chatId: string, md: string, markup?: unknown) {
  const parts = chunks(toTelegramHtml(md))
  for (let i = 0; i < parts.length; i++) {
    const body = { chat_id: chatId, text: parts[i], parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...(markup && i === parts.length - 1 ? { reply_markup: markup } : {}) }
    try { await api(token, 'sendMessage', body) } catch { await api(token, 'sendMessage', { chat_id: chatId, text: parts[i].replace(/<[^>]+>/g, ''), ...(markup && i === parts.length - 1 ? { reply_markup: markup } : {}) }) }
  }
}

const cardHtml = (c: Card) => `<b>${esc(c.title)}</b>\n` + c.rows.map(([k, v]) => `${esc(k)}: <b>${esc(v)}</b>`).join('\n')

/* ===================== Обробка оновлень ===================== */
type TgMessage = { message_id: number; from?: { id: number }; chat: { id: number; type: string }; text?: string; voice?: { file_id: string; duration: number; file_size?: number }; audio?: { file_id: string; duration: number; file_size?: number }; video_note?: { file_id: string; duration: number; file_size?: number } }
type TgUpdate = { update_id: number; message?: TgMessage; callback_query?: { id: string; from: { id: number }; data?: string; message?: TgMessage } }

async function handle(u: TgUpdate) {
  const cfg = await getAgentConfig()
  const token = cfg.tg.token
  if (!token || !cfg.tg.enabled) return
  const fromId = u.message?.from?.id ?? u.callback_query?.from.id
  // Бот відповідає лише одному дозволеному акаунту; усі інші повідомлення мовчки ігноруються.
  if (!fromId || String(fromId) !== cfg.tg.chatId) return
  const chatId = cfg.tg.chatId
  const user = cfg.tg.userId ? await loadSessionUser(cfg.tg.userId) : null
  if (!user) { await api(token, 'sendMessage', { chat_id: chatId, text: 'Користувача CRM, від імені якого працює бот, не знайдено або його заблоковано. Перевірте Налаштування → AI-агент.' }).catch(() => {}); return }

  if (u.callback_query) {
    const cb = u.callback_query
    const [kind, id] = (cb.data ?? '').split(':')
    if ((kind !== 'ok' && kind !== 'no') || !id) return
    const r = await confirmAction(user, id, kind === 'ok')
    if (r.threadId && !r.message.startsWith('Цю дію вже')) await recordOutcome(r.threadId, user.id, r.ok, r.message, r.href)
    await api(token, 'answerCallbackQuery', { callback_query_id: cb.id }).catch(() => {})
    if (cb.message) await api(token, 'editMessageReplyMarkup', { chat_id: chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {})
    await say(token, chatId, `${r.ok ? 'Готово' : 'Не виконано'}: ${r.message}${r.ok && r.href && process.env.PUBLIC_URL ? ` [відкрити](${r.href})` : ''}`)
    return
  }

  const m = u.message
  if (!m || m.chat.type !== 'private') return
  let text = (m.text ?? '').trim()
  let voice = false

  if (text.startsWith('/')) {
    const cmd = text.split(/[\s@]/)[0].toLowerCase()
    if (cmd === '/start' || cmd === '/help') {
      await say(token, chatId, `Я AI-агент EnergyCRM. Пишіть або надсилайте голосові: шукаю клієнтів, рахую аналітику, а в режимі «Дії» готую зміни, які ви підтверджуєте кнопкою.\n\n/act — режим «Дії» (зміни з підтвердженням)\n/chat — режим «Чат» (лише читання)\n/new — нова розмова\n\nЗараз: **${cfg.tg.mode === 'actions' ? 'Дії' : 'Чат'}**.`)
    } else if (cmd === '/new') { await newThread(user.id, 'telegram'); await say(token, chatId, 'Нова розмова розпочата.') }
    else if (cmd === '/chat' || cmd === '/act') { const mode: AgentMode = cmd === '/act' ? 'actions' : 'chat'; await saveTelegramMode(mode); await say(token, chatId, mode === 'actions' ? 'Режим «Дії»: можу готувати зміни, виконую лише після вашого підтвердження.' : 'Режим «Чат»: лише читання даних.') }
    else await say(token, chatId, 'Невідома команда. Доступні: /act, /chat, /new, /help')
    return
  }

  const v = m.voice ?? m.audio ?? m.video_note
  if (v) {
    if (!(await hasVoiceKey())) { await say(token, chatId, 'Голосові поки не підтримуються: не задано ключ розпізнавання (Налаштування → AI-агент). Напишіть текстом.'); return }
    if (v.duration > 300 || (v.file_size ?? 0) > 20 * 1024 * 1024) { await say(token, chatId, 'Голосове задовге (максимум 5 хвилин). Надішліть коротше.'); return }
    try {
      const f = await api<{ file_path: string }>(token, 'getFile', { file_id: v.file_id })
      const r = await fetch(`${API}/file/bot${token}/${f.file_path}`, { signal: AbortSignal.timeout(60_000) })
      if (!r.ok) throw new Error('download')
      text = await transcribe(Buffer.from(await r.arrayBuffer()), f.file_path.split('/').pop() || 'voice.ogg')
    } catch (e) {
      console.error('[telegram] розпізнавання', e)
      await say(token, chatId, 'Не вдалося розпізнати голосове. Спробуйте ще раз або напишіть текстом.')
      return
    }
    if (!text) { await say(token, chatId, 'У голосовому не розпізнано мовлення.'); return }
    voice = true
    await say(token, chatId, `Розпізнано: «${text}»`)
  }
  if (!text) return

  const typing = setInterval(() => { void api(token, 'sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {}) }, 4000)
  void api(token, 'sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {})
  let answer = '', err = ''
  const pending: { id: string; card: Card }[] = []
  try {
    const threadId = await getActiveThread(user.id, 'telegram')
    await runAgent({ threadId, user, mode: cfg.tg.mode, text, channel: 'telegram', voice, emit: (e) => {
      if (e.type === 'text') answer += e.delta
      else if (e.type === 'pending') pending.push({ id: e.id, card: e.card })
      else if (e.type === 'error') err = e.message
    } })
  } finally { clearInterval(typing) }
  if (answer.trim()) await say(token, chatId, answer.trim())
  if (err) await say(token, chatId, err)
  for (const p of pending) {
    await api(token, 'sendMessage', {
      chat_id: chatId, text: cardHtml(p.card), parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: p.card.confirm, callback_data: `ok:${p.id}` }, { text: 'Скасувати', callback_data: `no:${p.id}` }]] },
    }).catch((e) => console.error('[telegram] картка', e))
  }
}

/* ===================== Цикл опитування ===================== */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function stopTelegram() {
  const s = st()
  s.run++
  s.abort?.abort()
  s.status = 'off'
  s.error = undefined
}

/** Запускає (або перезапускає) бота за поточними налаштуваннями. Безпечно викликати повторно. */
export async function startTelegram() {
  stopTelegram()
  const s = st()
  const cfg = await getAgentConfig()
  if (!cfg.tg.enabled || !cfg.tg.token || !cfg.tg.chatId || !cfg.tg.userId) return
  const token = cfg.tg.token
  const run = s.run
  s.status = 'starting'
  try {
    const me = await verifyToken(token)
    s.botName = me.username
    await api(token, 'deleteWebhook', { drop_pending_updates: false })
  } catch (e) {
    s.status = 'error'; s.error = e instanceof Error ? e.message : 'Токен недійсний'
    return
  }
  s.status = 'running'; s.error = undefined
  void (async () => {
    let offset = 0
    while (st().run === run) {
      const ac = (st().abort = new AbortController())
      try {
        const ups = await api<TgUpdate[]>(token, 'getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] }, ac.signal)
        for (const u of ups) { offset = u.update_id + 1; handle(u).catch((e) => console.error('[telegram] обробка', e)) }
      } catch (e) {
        if (st().run !== run) return
        const code = (e as { code?: number }).code
        if (code === 401) { st().status = 'error'; st().error = 'Токен відхилено Telegram'; return }
        st().error = code === 409 ? 'Інший екземпляр бота з цим токеном уже опитує Telegram' : undefined
        await sleep(code === 409 ? 15_000 : 5_000)
      }
    }
  })()
}
