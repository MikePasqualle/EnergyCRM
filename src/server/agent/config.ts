import 'server-only'
import { db } from '@/lib/db'
import { seal, unseal } from './secretbox'

export const MODELS = [
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
] as const
export type Effort = 'low' | 'medium' | 'high'
export type AgentMode = 'chat' | 'actions'

export type AgentConfig = {
  model: string
  effort: Effort
  tg: { token: string | null; chatId: string; userId: number | null; enabled: boolean; botName: string; mode: AgentMode }
}

export type SecretName = 'anthropic' | 'openai'
const ENV: Record<SecretName, string> = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY' }

/** Ключ API: спершу з налаштувань (шифрований у БД), інакше зі змінної середовища. */
export async function getSecret(name: SecretName): Promise<{ value: string | null; source: 'settings' | 'env' | null }> {
  const row = await db.setting.findUnique({ where: { key: `agent.${name}.key` } })
  const v = unseal(row?.value)
  if (v) return { value: v, source: 'settings' }
  const e = process.env[ENV[name]]
  return e ? { value: e, source: 'env' } : { value: null, source: null }
}
export const hasClaudeKey = async () => !!(await getSecret('anthropic')).value
export const hasVoiceKey = async () => !!(await getSecret('openai')).value

const K = {
  model: 'agent.model', effort: 'agent.effort', token: 'agent.tg.token', chatId: 'agent.tg.chatId', userId: 'agent.tg.userId',
  enabled: 'agent.tg.enabled', botName: 'agent.tg.botName', mode: 'agent.tg.mode',
} as const

export async function getAgentConfig(): Promise<AgentConfig> {
  const rows = await db.setting.findMany({ where: { key: { startsWith: 'agent.' } } })
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  const model = MODELS.some((x) => x.id === m[K.model]) ? m[K.model] : (process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5')
  const effort: Effort = m[K.effort] === 'low' ? 'low' : m[K.effort] === 'high' ? 'high' : 'medium'
  return {
    model, effort,
    tg: {
      token: unseal(m[K.token]), chatId: m[K.chatId] ?? '', userId: m[K.userId] ? Number(m[K.userId]) : null,
      enabled: m[K.enabled] === '1', botName: m[K.botName] ?? '', mode: m[K.mode] === 'chat' ? 'chat' : 'actions',
    },
  }
}

async function put(entries: Record<string, string | null>) {
  for (const [key, value] of Object.entries(entries)) {
    if (value === null) await db.setting.deleteMany({ where: { key } })
    else await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
  }
}

export const saveModel = (model: string, effort: Effort) => put({ [K.model]: model, [K.effort]: effort })
export const saveTelegram = (p: { token?: string; chatId: string; userId: number; enabled: boolean; botName: string }) =>
  put({ ...(p.token ? { [K.token]: seal(p.token) } : {}), [K.chatId]: p.chatId, [K.userId]: String(p.userId), [K.enabled]: p.enabled ? '1' : '0', [K.botName]: p.botName })
export const clearTelegram = () => put({ [K.token]: null, [K.chatId]: null, [K.userId]: null, [K.enabled]: null, [K.botName]: null })
export const saveTelegramMode = (mode: AgentMode) => put({ [K.mode]: mode })
export const saveSecret = (name: SecretName, value: string) => put({ [`agent.${name}.key`]: seal(value) })
export const clearSecret = (name: SecretName) => put({ [`agent.${name}.key`]: null })
