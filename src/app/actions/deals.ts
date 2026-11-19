'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { assertCan, getUser } from '@/server/auth'
import { audit } from '@/server/audit'
import { canAccessClient, canAccessDeal } from '@/server/access'
import { sees_all } from '@/server/permissions'
import { n, uah } from '@/lib/format'

import { insertDeal, moveDealCore } from '@/server/dealsCore'

type R<T = {}> = ({ ok: true } & T) | { ok: false; error: string }

async function me() {
  const u = await getUser()
  if (!u || u.mustChangePassword) throw new Error('Потрібен вхід')
  return u
}
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

/** FR-3.2: переміщення картки; кожен перехід — в історію. FR-3.5: «втрачено» потребує причини. */
export async function moveDeal(dealId: number, stageId: number, lostReason?: string): Promise<R<{ suggestActive?: number }>> {
  const u = await me()
  assertCan(u, 'deals', 'edit')
  return moveDealCore(u, dealId, stageId, lostReason)
}

const dealSchema = z.object({
  clientId: z.coerce.number().int().positive('Оберіть клієнта'),
  funnelId: z.coerce.number().int().positive('Оберіть воронку'),
  productId: z.coerce.number().int().positive('Оберіть продукт'),
  stageId: z.coerce.number().int().optional(),
  volumeMwh: z.coerce.number().positive('Вкажіть очікуваний обсяг'),
  amount: z.coerce.number().positive().optional(),
  note: z.string().max(2000).optional(),
})

/** FR-3.7 / UC-6: нова угода з картки клієнта або з воронки; сума = обсяг × ціна ÷ 12, можна змінити вручну */
export async function createDeal(_: unknown, fd: FormData): Promise<{ error?: string; fields?: Record<string, string>; created?: number }> {
  const u = await me()
  assertCan(u, 'deals', 'create')
  const p = dealSchema.safeParse({
    clientId: fd.get('clientId'), funnelId: fd.get('funnelId'), productId: fd.get('productId'), stageId: fd.get('stageId') || undefined,
    volumeMwh: String(fd.get('volumeMwh') ?? '').replace(',', '.'), amount: fd.get('amount') ? String(fd.get('amount')).replace(/\s/g, '').replace(',', '.') : undefined, note: fd.get('note') || undefined,
  })
  if (!p.success) { const f: Record<string, string> = {}; p.error.issues.forEach((i) => { f[String(i.path[0])] = i.message }); return { error: 'Перевірте поля', fields: f } }
  const r = await insertDeal(u, p.data)
  if ('error' in r) return { error: r.error, fields: r.field ? { [r.field]: r.error } : undefined }
  return { created: r.id }
}

export async function updateDeal(dealId: number, data: { note?: string; volumeMwh?: number; amount?: number; ownerId?: number }): Promise<R> {
  const u = await me()
  assertCan(u, 'deals', 'edit')
  if (!(await canAccessDeal(u, dealId))) return fail('Угоду не знайдено')
  const deal = await db.deal.findUniqueOrThrow({ where: { id: dealId } })
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (data.note !== undefined) patch.note = data.note.slice(0, 2000)
  if (data.volumeMwh !== undefined) { if (!(data.volumeMwh > 0)) return fail('Обсяг має бути більшим за 0'); patch.volumeMwh = data.volumeMwh }
  if (data.amount !== undefined) { if (!(data.amount > 0)) return fail('Сума має бути більшою за 0'); patch.amount = data.amount }
  if (data.ownerId !== undefined) { if (!sees_all(u)) return fail('Недостатньо прав'); patch.ownerId = data.ownerId }
  await db.deal.update({ where: { id: dealId }, data: patch })
  await audit(u, 'Угода', 'Угода', `Угода №${String(deal.number).padStart(4, '0')}`, `Змінено: ${Object.keys(patch).filter((k) => k !== 'updatedAt').join(', ')}`)
  revalidatePath(`/deals/${dealId}`); revalidatePath('/funnels')
  return { ok: true }
}

export async function deleteDeal(dealId: number): Promise<R> {
  const u = await me()
  assertCan(u, 'deals', 'delete')
  const deal = await db.deal.findUnique({ where: { id: dealId } })
  if (!deal) return fail('Угоду не знайдено')
  await db.deal.delete({ where: { id: dealId } })
  await audit(u, 'Видалення', 'Угода', `Угода №${String(deal.number).padStart(4, '0')}`)
  revalidatePath('/funnels')
  return { ok: true }
}

const paySchema = z.object({ date: z.string().regex(/^\d{4}-\d\d-\d\d$/, 'Вкажіть дату'), purpose: z.string().min(1, 'Вкажіть призначення').max(120), amount: z.coerce.number().positive('Сума має бути більшою за 0'), status: z.enum(['PAID', 'PENDING']) })
/** Оплати лише вручну (аванс і рахунки); до аналітики йде статус «Оплачено» */
export async function addPayment(dealId: number, _: unknown, fd: FormData): Promise<{ error?: string; fields?: Record<string, string>; ok?: boolean }> {
  const u = await me()
  assertCan(u, 'deals', 'edit')
  if (!(await canAccessDeal(u, dealId))) return { error: 'Угоду не знайдено' }
  const p = paySchema.safeParse({ date: fd.get('date'), purpose: fd.get('purpose'), amount: String(fd.get('amount') ?? '').replace(/\s/g, '').replace(',', '.'), status: fd.get('status') ?? 'PAID' })
  if (!p.success) { const f: Record<string, string> = {}; p.error.issues.forEach((i) => { f[String(i.path[0])] = i.message }); return { error: 'Перевірте поля', fields: f } }
  const deal = await db.deal.findUniqueOrThrow({ where: { id: dealId } })
  await db.payment.create({ data: { dealId, clientId: deal.clientId, date: new Date(p.data.date + 'T00:00:00Z'), purpose: p.data.purpose, amount: p.data.amount, status: p.data.status } })
  await audit(u, 'Оплата', 'Угода', `Угода №${String(deal.number).padStart(4, '0')}`, `${p.data.purpose}: ${n(p.data.amount)} ₴ (${p.data.status === 'PAID' ? 'оплачено' : 'очікується'})`)
  revalidatePath(`/deals/${dealId}`); revalidatePath('/dashboard')
  return { ok: true }
}

export async function setPaymentStatus(paymentId: number, status: 'PAID' | 'PENDING'): Promise<R> {
  const u = await me()
  assertCan(u, 'deals', 'edit')
  const pay = await db.payment.findUnique({ where: { id: paymentId }, include: { deal: true } })
  if (!pay || !(await canAccessDeal(u, pay.dealId))) return fail('Оплату не знайдено')
  await db.payment.update({ where: { id: paymentId }, data: { status } })
  await audit(u, 'Оплата', 'Угода', `Угода №${String(pay.deal.number).padStart(4, '0')}`, `${pay.purpose}: ${status === 'PAID' ? 'оплачено' : 'очікується'}`)
  revalidatePath(`/deals/${pay.dealId}`); revalidatePath('/dashboard')
  return { ok: true }
}

export async function markClientActive(clientId: number): Promise<R> {
  const u = await me()
  assertCan(u, 'clients', 'edit')
  if (!(await canAccessClient(u, clientId))) return fail('Клієнта не знайдено')
  const c = await db.client.update({ where: { id: clientId }, data: { status: 'ACTIVE' } })
  await audit(u, 'Статус контакту', 'Клієнт', c.name, 'Статус: → дійсний')
  revalidatePath('/clients'); revalidatePath(`/clients/${clientId}`)
  return { ok: true }
}
