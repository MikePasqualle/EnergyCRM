import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/** Шифрування секретів у БД (токен Telegram). Ключ — з APP_SECRET; без нього значення зберігається відкрито (у БД, що вже містить усі дані CRM). */
const key = () => {
  const s = process.env.APP_SECRET
  return s ? createHash('sha256').update(s).digest() : null
}

export function seal(v: string): string {
  const k = key()
  if (!k) return 'plain:' + v
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', k, iv)
  const enc = Buffer.concat([c.update(v, 'utf8'), c.final()])
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64')
}

export function unseal(s: string | null | undefined): string | null {
  if (!s) return null
  if (s.startsWith('plain:')) return s.slice(6)
  if (!s.startsWith('v1:')) return null
  const k = key()
  if (!k) return null
  try {
    const b = Buffer.from(s.slice(3), 'base64')
    const d = createDecipheriv('aes-256-gcm', k, b.subarray(0, 12))
    d.setAuthTag(b.subarray(12, 28))
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8')
  } catch {
    return null
  }
}
