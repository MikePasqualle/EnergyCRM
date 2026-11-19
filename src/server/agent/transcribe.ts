import 'server-only'
import { getSecret } from './config'

/** Розпізнавання мовлення. В Anthropic власного рішення немає, тому використовується OpenAI (ключ OPENAI_API_KEY). Модель — TRANSCRIBE_MODEL. */
export async function transcribe(audio: Buffer, filename = 'voice.ogg'): Promise<string> {
  const key = (await getSecret('openai')).value
  if (!key) throw new Error('Не задано ключ розпізнавання голосу')
  const fd = new FormData()
  fd.append('file', new Blob([new Uint8Array(audio)]), filename)
  fd.append('model', process.env.TRANSCRIBE_MODEL || 'gpt-4o-transcribe')
  fd.append('prompt', 'CRM, електроенергія, клієнт, угода, воронка, ТОВ, ФОП, МВт·год, менеджер, продукт')
  const r = await fetch(`${process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd, signal: AbortSignal.timeout(90_000) })
  if (!r.ok) throw new Error(`Розпізнавання не вдалося (${r.status})`)
  const j = (await r.json()) as { text?: string }
  return (j.text ?? '').trim()
}
