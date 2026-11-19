import 'server-only'
import { z } from 'zod'
import { db } from '@/lib/db'
import { audit } from './audit'
import { canAccessClient } from './access'
import { findDuplicates, type Dup } from './dupes'
import { reval } from './revalidate'
import type { SessionUser } from './permissions'
import { normEmail, normPhone, validEmail, validPhone } from '@/lib/phone'

/** Спільна схема клієнта: форма «Додати клієнта» і AI-агент перевіряють дані однаково. */
export const clientSchema = z.object({
  type: z.enum(['COMPANY', 'FOP', 'PERSON']),
  name: z.string().trim().min(1, 'Вкажіть назву або ПІБ').max(200),
  edrpou: z.string().trim().max(20).optional(),
  contactPerson: z.string().trim().max(120).optional(),
  phone: z.string().trim().min(1, 'Вкажіть телефон'),
  email: z.string().trim().optional(),
  city: z.string().trim().max(80).optional(),
  address: z.string().trim().max(250).optional(),
  status: z.enum(['COLD', 'WARM', 'ACTIVE']),
  source: z.string().trim().max(80).optional(),
  managerId: z.coerce.number().int().positive('Оберіть менеджера'),
})
export type ClientInput = z.infer<typeof clientSchema>

export function validateClient(raw: unknown) {
  const p = clientSchema.safeParse(raw)
  const fields: Record<string, string> = {}
  if (!p.success) p.error.issues.forEach((i) => { fields[String(i.path[0])] = i.message })
  const d = p.success ? p.data : null
  if (d && !validPhone(d.phone)) fields.phone = 'Формат: +380 XX XXX XX XX'
  if (d?.email && !validEmail(d.email)) fields.email = 'Некоректний email'
  return { d, fields }
}

export type NewClientExtras = {
  managerId: number
  group?: 'A' | 'B' | 'UNSET'
  supplierId?: number | null
  gen?: { type: string; powerKw: number; mode: string } | null
}

/** Створення клієнта (+ за потреби основного обʼєкта) однією транзакцією. */
export async function insertClient(u: SessionUser, d: ClientInput, x: NewClientExtras) {
  const group = x.group ?? 'UNSET'
  const gen = x.gen ?? null
  const client = await db.$transaction(async (tx) => {
    const c = await tx.client.create({
      data: { type: d.type, name: d.name, edrpou: d.edrpou ?? null, contactPerson: d.contactPerson ?? null, phone: d.phone, phoneNorm: normPhone(d.phone), email: d.email ?? null, emailNorm: normEmail(d.email),
        city: d.city ?? null, address: d.address ?? null, source: d.source ?? null, status: d.status, managerId: x.managerId },
    })
    await tx.clientAssignment.create({ data: { clientId: c.id, toUserId: x.managerId, byUserId: u.id } })
    if (group !== 'UNSET' || x.supplierId || gen) {
      const s = await tx.system.create({
        data: { clientId: c.id, name: 'Основний обʼєкт', address: d.address ?? null, group, meterType: group === 'B' ? 'Місячний (інтегральний)' : 'Почасовий (інтервальний)', hasGeneration: !!gen,
          genType: gen?.type ?? null, genPowerKw: gen?.powerKw ?? null, genMode: gen?.mode ?? null, updatedBy: u.name },
      })
      if (x.supplierId) await tx.supplierShare.create({ data: { systemId: s.id, supplierId: x.supplierId, validFrom: new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z'), sharePct: 100 } })
      await tx.systemHistory.create({ data: { systemId: s.id, userName: u.name, summary: 'Систему створено разом із клієнтом' } })
    }
    await audit(u, 'Клієнт', 'Клієнт', c.name, 'Створено', tx)
    return c
  })
  reval('/clients', '/dashboard')
  return client
}

export type UpdateResult = { ok: true } | { ok: false; error: string; dups?: Dup[] }

/** Оновлення клієнта; менеджер лишається незмінним (перезакріплення — окрема дія). */
export async function updateClientCore(u: SessionUser, clientId: number, d: ClientInput, force: boolean): Promise<UpdateResult> {
  if (!(await canAccessClient(u, clientId))) return { ok: false, error: 'Клієнта не знайдено' }
  const ex = await db.client.findUniqueOrThrow({ where: { id: clientId } })
  if (!force) {
    const dups = await findDuplicates(d.phone, d.email, clientId, u)
    if (dups.length) return { ok: false, error: 'Знайдено схожого клієнта', dups }
  }
  const changes: string[] = []
  if (ex.name !== d.name) changes.push(`Назва: ${ex.name} → ${d.name}`)
  if (ex.phone !== d.phone) changes.push(`Телефон: ${ex.phone} → ${d.phone}`)
  if (ex.status !== d.status) changes.push(`Статус: ${ex.status} → ${d.status}`)
  await db.client.update({ where: { id: clientId }, data: { type: d.type, name: d.name, edrpou: d.edrpou ?? null, contactPerson: d.contactPerson ?? null, phone: d.phone, phoneNorm: normPhone(d.phone), email: d.email ?? null, emailNorm: normEmail(d.email), city: d.city ?? null, address: d.address ?? null, source: d.source ?? null, status: d.status } })
  await audit(u, 'Клієнт', 'Клієнт', d.name, changes.join('; ') || 'Дані оновлено')
  reval(`/clients/${clientId}`, '/clients')
  return { ok: true }
}

export const commSchema = z.object({ channel: z.string().min(1), summary: z.string().trim().min(1, 'Напишіть, що обговорили').max(2000) })

export async function insertCommunication(u: SessionUser, clientId: number, channel: string, summary: string) {
  await db.$transaction([
    db.communication.create({ data: { clientId, channel, summary, authorId: u.id, authorName: u.name } }),
    db.client.update({ where: { id: clientId }, data: { lastContactAt: new Date() } }),
  ])
  reval(`/clients/${clientId}`, '/dashboard')
}
