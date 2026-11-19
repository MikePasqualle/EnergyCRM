'use server'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { assertCan, getUser } from '@/server/auth'
import { audit } from '@/server/audit'
import { MODELS, clearSecret, clearTelegram, getAgentConfig, saveModel, saveSecret, saveTelegram, type Effort, type SecretName } from '@/server/agent/config'
import { sendTest, startTelegram, stopTelegram, verifyToken } from '@/server/agent/telegram'

async function admin() {
  const u = await getUser()
  if (!u || u.mustChangePassword) throw new Error('Потрібен вхід')
  assertCan(u, 'users', 'edit')
  return u
}
export type AgentFormState = { ok?: string; error?: string } | undefined

export async function saveAgentModel(model: string, effort: string): Promise<AgentFormState> {
  const u = await admin()
  if (!MODELS.some((m) => m.id === model)) return { error: 'Невідома модель' }
  const e: Effort = effort === 'low' ? 'low' : effort === 'high' ? 'high' : 'medium'
  await saveModel(model, e)
  await audit(u, 'Налаштування', 'AI-агент', 'Модель', `${model}, глибина: ${e}`)
  revalidatePath('/settings/agent')
  return { ok: 'Збережено' }
}

/** Підключення Telegram-бота: токен від @BotFather + єдиний дозволений Telegram ID. */
export async function saveTelegramSettings(_: AgentFormState, fd: FormData): Promise<AgentFormState> {
  const u = await admin()
  const cfg = await getAgentConfig()
  const newToken = String(fd.get('token') ?? '').trim()
  const chatId = String(fd.get('chatId') ?? '').replace(/\s/g, '')
  const userId = Number(fd.get('userId'))
  const enabled = fd.get('enabled') === 'on'
  const token = newToken || cfg.tg.token
  if (!token) return { error: 'Вставте токен бота від @BotFather' }
  if (!/^\d{5,15}$/.test(chatId)) return { error: 'Telegram ID — лише цифри (дізнатися можна в @userinfobot)' }
  if (!(await db.user.findFirst({ where: { id: userId, status: 'ACTIVE' } }))) return { error: 'Оберіть активного користувача CRM' }
  let botName = cfg.tg.botName
  try { botName = (await verifyToken(token)).username } catch { return { error: 'Telegram не прийняв токен. Перевірте, що вставили його повністю.' } }
  await saveTelegram({ token: newToken || undefined, chatId, userId, enabled, botName })
  await audit(u, 'Налаштування', 'AI-агент', `Telegram-бот @${botName}`, enabled ? `Підключено, дозволений ID ${chatId}` : 'Вимкнено')
  if (enabled) await startTelegram(); else stopTelegram()
  revalidatePath('/settings/agent')
  return { ok: enabled ? `Бот @${botName} підключено` : 'Збережено, бот вимкнено' }
}

export async function testTelegram(): Promise<AgentFormState> {
  await admin()
  const c = await getAgentConfig()
  if (!c.tg.token || !c.tg.chatId) return { error: 'Спершу збережіть токен і Telegram ID' }
  try { await sendTest(c.tg.token, c.tg.chatId); return { ok: 'Тестове повідомлення надіслано' } } catch (e) {
    return { error: `Не вдалося надіслати: ${e instanceof Error ? e.message : 'помилка Telegram'}. Спершу напишіть боту /start зі свого акаунта.` }
  }
}

export async function disconnectTelegram(): Promise<AgentFormState> {
  const u = await admin()
  stopTelegram()
  await clearTelegram()
  await audit(u, 'Налаштування', 'AI-агент', 'Telegram-бот', 'Відключено, токен видалено')
  revalidatePath('/settings/agent')
  return { ok: 'Бота відключено, токен видалено' }
}

/** Ключі API з інтерфейсу: зберігаються в БД зашифрованими (APP_SECRET), назад не показуються. */
export async function saveSecretKey(name: SecretName, value: string): Promise<AgentFormState> {
  const u = await admin()
  const v = value.trim()
  if (name !== 'anthropic' && name !== 'openai') return { error: 'Невідомий ключ' }
  if (v.length < 20 || /\s/.test(v)) return { error: 'Ключ має бути одним рядком без пробілів' }
  await saveSecret(name, v)
  await audit(u, 'Налаштування', 'AI-агент', name === 'anthropic' ? 'Ключ Claude API' : 'Ключ розпізнавання голосу', 'Збережено')
  revalidatePath('/settings/agent')
  return { ok: 'Ключ збережено' }
}
export async function removeSecretKey(name: SecretName): Promise<AgentFormState> {
  const u = await admin()
  await clearSecret(name)
  await audit(u, 'Налаштування', 'AI-агент', name === 'anthropic' ? 'Ключ Claude API' : 'Ключ розпізнавання голосу', 'Видалено з налаштувань')
  revalidatePath('/settings/agent')
  return { ok: 'Ключ видалено з налаштувань' }
}
