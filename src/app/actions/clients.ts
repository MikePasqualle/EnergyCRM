'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import type { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { assertCan, getUser } from '@/server/auth'
import { audit } from '@/server/audit'
import { canAccessClient, clientWhere } from '@/server/access'
import { can, sees_all } from '@/server/permissions'
import { insertDeal } from '@/server/dealsCore'
import { normEmail, normPhone, validEmail, validPhone } from '@/lib/phone'
import { findDuplicates } from '@/server/dupes'
import { buildClientWhere, type ClientFilter } from '@/server/clientQuery'

async function me() {
  const u = await getUser()
  if (!u || u.mustChangePassword) throw new Error('Потрібен вхід')
  return u
}
import type { Dup } from '@/server/dupes'
export type ClientState = { error?: string; fields?: Record<string, string>; dups?: Dup[]; created?: number; again?: boolean; merged?: number } | undefined

const clientSchema = z.object({
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
const opt = (v: FormDataEntryValue | null) => { const s = String(v ?? '').trim(); return s === '' ? undefined : s }

function parseClient(fd: FormData) {
  const raw = {
    type: fd.get('type'), name: fd.get('name'), edrpou: opt(fd.get('edrpou')), contactPerson: opt(fd.get('contactPerson')), phone: fd.get('phone'), email: opt(fd.get('email')),
    city: opt(fd.get('city')), address: opt(fd.get('address')), status: fd.get('status') ?? 'COLD', source: opt(fd.get('source')), managerId: fd.get('managerId'),
  }
  const p = clientSchema.safeParse(raw)
  const fields: Record<string, string> = {}
  if (!p.success) p.error.issues.forEach((i) => { fields[String(i.path[0])] = i.message })
  const d = p.success ? p.data : null
  if (d && !validPhone(d.phone)) fields.phone = 'Формат: +380 XX XXX XX XX'
  if (d?.email && !validEmail(d.email)) fields.email = 'Некоректний email'
  return { d, fields }
}

/** FR-4.2, FR-4.3, UC-5: додавання клієнта; перед збереженням — перевірка дублікатів; опційно — одразу угода і налаштування споживача */
export async function createClient(_: ClientState, fd: FormData): Promise<ClientState> {
  const u = await me()
  assertCan(u, 'clients', 'create')
  const { d, fields } = parseClient(fd)
  if (!d) return { error: 'Перевірте поля', fields }
  // користувач без доступу до всього реєстру додає клієнтів лише за собою
  const managerId = sees_all(u) ? d.managerId : u.id
  const mgr = await db.user.findFirst({ where: { id: managerId, status: 'ACTIVE' } })
  if (!mgr) fields.managerId = 'Менеджера не знайдено'
  const gen = fd.get('hasGeneration') === 'on'
  const group = (['A', 'B'].includes(String(fd.get('group'))) ? String(fd.get('group')) : 'UNSET') as 'A' | 'B' | 'UNSET'
  if (gen) {
    if (!opt(fd.get('genType'))) fields.genType = 'Оберіть тип генерації'
    if (!(Number(fd.get('genPower')) > 0)) fields.genPower = 'Вкажіть потужність'
    if (!opt(fd.get('genMode'))) fields.genMode = 'Оберіть режим'
  }
  const makeDeal = fd.get('makeDeal') === 'on'
  if (makeDeal) {
    if (!Number(fd.get('funnelId'))) fields.funnelId = 'Оберіть воронку'
    if (!Number(fd.get('productId'))) fields.productId = 'Оберіть продукт'
    if (!(Number(String(fd.get('volumeMwh')).replace(',', '.')) > 0)) fields.volumeMwh = 'Вкажіть обсяг'
  }
  if (Object.keys(fields).length) return { error: 'Перевірте поля', fields }
  if (fd.get('force') !== '1') {
    const dups = await findDuplicates(d.phone, d.email, undefined, u)
    if (dups.length) return { error: 'Знайдено схожого клієнта', dups, fields: dups.some((x) => x.by === 'телефоном') ? { phone: 'Такий номер уже є в реєстрі' } : { email: 'Такий email уже є в реєстрі' } }
  }
  const supplierId = Number(fd.get('supplierId')) || null
  const client = await db.$transaction(async (tx) => {
    const c = await tx.client.create({
      data: { type: d.type, name: d.name, edrpou: d.edrpou ?? null, contactPerson: d.contactPerson ?? null, phone: d.phone, phoneNorm: normPhone(d.phone), email: d.email ?? null, emailNorm: normEmail(d.email),
        city: d.city ?? null, address: d.address ?? null, source: d.source ?? null, status: d.status, managerId },
    })
    await tx.clientAssignment.create({ data: { clientId: c.id, toUserId: managerId, byUserId: u.id } })
    if (group !== 'UNSET' || supplierId || gen) {
      const s = await tx.system.create({
        data: { clientId: c.id, name: 'Основний обʼєкт', address: d.address ?? null, group, meterType: group === 'B' ? 'Місячний (інтегральний)' : 'Почасовий (інтервальний)', hasGeneration: gen,
          genType: gen ? String(fd.get('genType')) : null, genPowerKw: gen ? Number(fd.get('genPower')) : null, genMode: gen ? String(fd.get('genMode')) : null, updatedBy: u.name },
      })
      if (supplierId) await tx.supplierShare.create({ data: { systemId: s.id, supplierId, validFrom: new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z'), sharePct: 100 } })
      await tx.systemHistory.create({ data: { systemId: s.id, userName: u.name, summary: 'Систему створено разом із клієнтом' } })
    }
    await audit(u, 'Клієнт', 'Клієнт', c.name, 'Створено', tx)
    return c
  })
  if (makeDeal) {
    const r = await insertDeal(u, { clientId: client.id, funnelId: Number(fd.get('funnelId')), productId: Number(fd.get('productId')), volumeMwh: Number(String(fd.get('volumeMwh')).replace(',', '.')) })
    if ('error' in r) return { created: client.id, error: `Клієнта збережено, але угоду не створено: ${r.error}` }
  }
  revalidatePath('/clients'); revalidatePath('/dashboard')
  if (fd.get('again') === '1') return { created: client.id, again: true }
  redirect(`/clients/${client.id}`)
}

/** «Обʼєднати»: дописати відсутні дані в існуючого клієнта замість створення нового */
export async function mergeClient(existingId: number, _: ClientState, fd: FormData): Promise<ClientState> {
  const u = await me()
  assertCan(u, 'clients', 'edit')
  if (!(await canAccessClient(u, existingId))) return { error: 'Цей клієнт закріплений за іншим менеджером. Зверніться до адміністратора.' }
  const { d, fields } = parseClient(fd)
  if (!d) return { error: 'Перевірте поля', fields }
  const ex = await db.client.findUniqueOrThrow({ where: { id: existingId } })
  await db.client.update({ where: { id: existingId }, data: {
    edrpou: ex.edrpou ?? d.edrpou ?? null, contactPerson: ex.contactPerson ?? d.contactPerson ?? null, email: ex.email ?? d.email ?? null, emailNorm: ex.emailNorm ?? normEmail(d.email),
    city: ex.city ?? d.city ?? null, address: ex.address ?? d.address ?? null, source: ex.source ?? d.source ?? null,
  } })
  if (fd.get('makeDeal') === 'on' && Number(fd.get('funnelId')) && Number(fd.get('productId'))) {
    await insertDeal(u, { clientId: existingId, funnelId: Number(fd.get('funnelId')), productId: Number(fd.get('productId')), volumeMwh: Number(String(fd.get('volumeMwh')).replace(',', '.')) || 1 })
  }
  await audit(u, 'Клієнт', 'Клієнт', ex.name, 'Дані обʼєднано зі знайденим дублікатом')
  revalidatePath('/clients')
  redirect(`/clients/${existingId}`)
}

export async function updateClient(clientId: number, _: ClientState, fd: FormData): Promise<ClientState> {
  const u = await me()
  assertCan(u, 'clients', 'edit')
  if (!(await canAccessClient(u, clientId))) return { error: 'Клієнта не знайдено' }
  const ex = await db.client.findUniqueOrThrow({ where: { id: clientId } })
  const f2 = new FormData(); for (const [k, v] of fd.entries()) f2.append(k, v)
  f2.set('managerId', String(ex.managerId))
  const { d, fields } = parseClient(f2)
  if (!d) return { error: 'Перевірте поля', fields }
  if (Object.keys(fields).length) return { error: 'Перевірте поля', fields }
  if (fd.get('force') !== '1') {
    const dups = await findDuplicates(d.phone, d.email, clientId, u)
    if (dups.length) return { error: 'Знайдено схожого клієнта', dups, fields: { phone: 'Такий номер/email уже є в реєстрі' } }
  }
  const changes: string[] = []
  if (ex.name !== d.name) changes.push(`Назва: ${ex.name} → ${d.name}`)
  if (ex.phone !== d.phone) changes.push(`Телефон: ${ex.phone} → ${d.phone}`)
  if (ex.status !== d.status) changes.push(`Статус: ${ex.status} → ${d.status}`)
  await db.client.update({ where: { id: clientId }, data: { type: d.type, name: d.name, edrpou: d.edrpou ?? null, contactPerson: d.contactPerson ?? null, phone: d.phone, phoneNorm: normPhone(d.phone), email: d.email ?? null, emailNorm: normEmail(d.email), city: d.city ?? null, address: d.address ?? null, source: d.source ?? null, status: d.status } })
  await audit(u, 'Клієнт', 'Клієнт', d.name, changes.join('; ') || 'Дані оновлено')
  revalidatePath(`/clients/${clientId}`); revalidatePath('/clients')
  return { created: clientId }
}

/** UC-9, FR-7.1: перезакріплення (по одному або масово). Клієнт і його активні угоди переходять разом; пишеться історія й журнал. */
export async function reassignClients(input: { ids?: number[]; filter?: ClientFilter; managerId: number }): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const u = await me()
  if (!sees_all(u) || !can(u, 'clients', 'edit')) return { ok: false, error: 'Перезакріплювати клієнтів може лише адміністратор' }
  const mgr = await db.user.findFirst({ where: { id: input.managerId, status: 'ACTIVE', role: { isAdmin: false } } })
  if (!mgr) return { ok: false, error: 'Оберіть активного менеджера' }
  const where: Prisma.ClientWhereInput = input.ids?.length ? { id: { in: input.ids.slice(0, 5000) } } : input.filter ? buildClientWhere(input.filter, u) : { id: -1 }
  const rows = await db.client.findMany({ where: { ...where, NOT: { managerId: mgr.id } }, select: { id: true, managerId: true, name: true } })
  if (!rows.length) return { ok: true, count: 0 }
  await db.$transaction(async (tx) => {
    await tx.client.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { managerId: mgr.id } })
    await tx.deal.updateMany({ where: { clientId: { in: rows.map((r) => r.id) }, stage: { type: 'WORKING' } }, data: { ownerId: mgr.id } })
    await tx.clientAssignment.createMany({ data: rows.map((r) => ({ clientId: r.id, fromUserId: r.managerId, toUserId: mgr.id, byUserId: u.id })) })
    await audit(u, 'Закріплення', 'Клієнт', rows.length === 1 ? rows[0].name : `${rows.length} клієнтів`, `Менеджер → ${mgr.name}`, tx)
  })
  revalidatePath('/clients'); revalidatePath('/dashboard/managers'); revalidatePath('/dashboard')
  return { ok: true, count: rows.length }
}

const commSchema = z.object({ channel: z.string().min(1), summary: z.string().trim().min(1, 'Напишіть, що обговорили').max(2000) })
export async function addCommunication(clientId: number, _: unknown, fd: FormData): Promise<{ error?: string; ok?: number }> {
  const u = await me()
  assertCan(u, 'clients', 'edit')
  if (!(await canAccessClient(u, clientId))) return { error: 'Клієнта не знайдено' }
  const p = commSchema.safeParse({ channel: fd.get('channel'), summary: fd.get('summary') })
  if (!p.success) return { error: p.error.issues[0].message }
  await db.$transaction([
    db.communication.create({ data: { clientId, channel: p.data.channel, summary: p.data.summary, authorId: u.id, authorName: u.name } }),
    db.client.update({ where: { id: clientId }, data: { lastContactAt: new Date() } }),
  ])
  revalidatePath(`/clients/${clientId}`); revalidatePath('/dashboard')
  return { ok: Date.now() }
}

export async function changeManager(clientId: number, managerId: number) { return reassignClients({ ids: [clientId], managerId }) }

/** NFR-9: клієнт з активними угодами видаляється лише з підтвердженням */
export async function deleteClient(clientId: number, confirmActive: boolean): Promise<{ ok: true } | { ok: false; error: string; needsConfirm?: boolean }> {
  const u = await me()
  assertCan(u, 'clients', 'delete')
  const c = await db.client.findUnique({ where: { id: clientId } })
  if (!c) return { ok: false, error: 'Клієнта не знайдено' }
  const active = await db.deal.count({ where: { clientId, stage: { type: 'WORKING' } } })
  if (active > 0 && !confirmActive) return { ok: false, needsConfirm: true, error: `У клієнта ${active} активних угод. Підтвердіть видалення разом із ними.` }
  await db.$transaction(async (tx) => {
    await tx.payment.deleteMany({ where: { clientId } })
    await tx.deal.deleteMany({ where: { clientId } })
    await tx.client.delete({ where: { id: clientId } })
    await audit(u, 'Видалення', 'Клієнт', c.name, active ? `Разом з ${active} активними угодами` : '', tx)
  })
  revalidatePath('/clients')
  return { ok: true }
}

/** NFR-4: анонімізація персональних даних за запитом клієнта (історія угод і сум лишається знеособленою) */
export async function anonymizeClient(clientId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const u = await me()
  assertCan(u, 'clients', 'delete')
  const c = await db.client.findUnique({ where: { id: clientId } })
  if (!c) return { ok: false, error: 'Клієнта не знайдено' }
  await db.$transaction(async (tx) => {
    await tx.client.update({ where: { id: clientId }, data: { name: `Анонімізований клієнт №${clientId}`, contactPerson: null, phone: '—', phoneNorm: `anon-${clientId}`, email: null, emailNorm: null, address: null, edrpou: null, anonymizedAt: new Date() } })
    await tx.communication.updateMany({ where: { clientId }, data: { summary: '[видалено на запит клієнта]' } })
    await tx.system.updateMany({ where: { clientId }, data: { address: null, eic: null } })
    await audit(u, 'Анонімізація', 'Клієнт', `Клієнт №${clientId}`, 'Персональні дані видалено', tx)
  })
  revalidatePath('/clients'); revalidatePath(`/clients/${clientId}`)
  return { ok: true }
}

export async function saveFilter(name: string, params: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
  const u = await me()
  const n = name.trim()
  if (!n) return { ok: false, error: 'Вкажіть назву фільтра' }
  await db.savedFilter.create({ data: { userId: u.id, name: n.slice(0, 60), params } })
  revalidatePath('/clients')
  return { ok: true }
}
export async function deleteFilter(id: number) {
  const u = await me()
  await db.savedFilter.deleteMany({ where: { id, userId: u.id } })
  revalidatePath('/clients')
}
void clientWhere
