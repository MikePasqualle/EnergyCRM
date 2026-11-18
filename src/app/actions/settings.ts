'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { assertCan, getUser, hashPassword, tempPassword, validatePassword } from '@/server/auth'
import { audit } from '@/server/audit'
import { SECTIONS, type Perms } from '@/server/permissions'
import { validEmail } from '@/lib/phone'
import { n } from '@/lib/format'

async function me() {
  const u = await getUser()
  if (!u || u.mustChangePassword) throw new Error('Потрібен вхід')
  return u
}
type R<T = {}> = ({ ok: true } & T) | { ok: false; error: string; fields?: Record<string, string> }

/* ===================== Продукти (FR-5) ===================== */
const productSchema = z.object({
  name: z.string().trim().min(1, 'Вкажіть назву').max(80),
  description: z.string().max(1000),
  price: z.number({ error: 'Вкажіть ціну' }).positive('Ціна має бути більшою за 0').max(1_000_000),
  tariffModel: z.string().trim().min(1).max(80),
  termMonths: z.number().int('Цілі місяці').min(1, 'Мінімум 1 місяць').max(120),
  minVolumeMwh: z.number().int('Ціле число').min(0),
  group: z.enum(['A', 'B', 'BOTH']),
  terms: z.string().max(2000),
})
export type ProductInput = z.input<typeof productSchema>

/** UC-3: створення/редагування продукту. FR-5.3: зміна ціни не чіпає вже створені угоди (ціна зафіксована в угоді). */
export async function saveProduct(id: number | null, input: ProductInput): Promise<R<{ id: number }>> {
  const u = await me()
  assertCan(u, 'products', id ? 'edit' : 'create')
  const p = productSchema.safeParse(input)
  if (!p.success) { const fields: Record<string, string> = {}; p.error.issues.forEach((i) => { fields[String(i.path[0])] = i.message }); return { ok: false, error: p.error.issues[0].message, fields } }
  const d = p.data
  const clash = await db.product.findFirst({ where: { name: d.name, ...(id ? { NOT: { id } } : {}) } })
  if (clash) return { ok: false, error: 'Продукт з такою назвою вже є', fields: { name: 'Продукт з такою назвою вже є' } }
  if (!id) {
    const x = await db.product.create({ data: { ...d, price: d.price } })
    await audit(u, 'Продукт', 'Продукт', d.name, `Створено: ${n(d.price)} ₴/МВт·год`)
    revalidatePath('/products')
    return { ok: true, id: x.id }
  }
  const old = await db.product.findUnique({ where: { id } })
  if (!old) return { ok: false, error: 'Продукт не знайдено' }
  await db.product.update({ where: { id }, data: d })
  const ch: string[] = []
  if (Number(old.price) !== d.price) ch.push(`Ціна: ${n(Number(old.price))} → ${n(d.price)} ₴/МВт·год`)
  if (old.name !== d.name) ch.push(`Назва: ${old.name} → ${d.name}`)
  if (old.termMonths !== d.termMonths) ch.push(`Термін: ${old.termMonths} → ${d.termMonths} міс.`)
  await audit(u, 'Продукт', 'Продукт', d.name, ch.join('; ') || 'Збережено')
  revalidatePath('/products')
  return { ok: true, id }
}

/** FR-5.4: архівний продукт не пропонується для нових угод, але лишається в історичних */
export async function setProductArchived(id: number, archived: boolean): Promise<R> {
  const u = await me()
  assertCan(u, 'products', 'edit')
  const p = await db.product.update({ where: { id }, data: { status: archived ? 'ARCHIVED' : 'ACTIVE' } })
  await audit(u, 'Продукт', 'Продукт', p.name, archived ? 'В архів' : 'Відновлено з архіву')
  revalidatePath('/products')
  return { ok: true }
}

/* ===================== Користувачі та ролі (FR-1, FR-6.1) ===================== */
export async function createUser(_: unknown, fd: FormData): Promise<{ error?: string; fields?: Record<string, string>; created?: { name: string; email: string; password: string } }> {
  const u = await me()
  assertCan(u, 'users', 'create')
  const name = String(fd.get('name') ?? '').trim(), email = String(fd.get('email') ?? '').trim().toLowerCase()
  const roleId = Number(fd.get('roleId')), password = String(fd.get('password') ?? '')
  const fields: Record<string, string> = {}
  if (!name) fields.name = 'Вкажіть імʼя'
  if (!validEmail(email)) fields.email = 'Некоректний email'
  const role = await db.role.findUnique({ where: { id: roleId } })
  if (!role) fields.roleId = 'Оберіть роль'
  const bad = validatePassword(password); if (bad) fields.password = bad
  if (Object.keys(fields).length) return { error: 'Перевірте поля', fields }
  if (await db.user.findUnique({ where: { email } })) return { error: 'Користувач з таким email уже є в системі', fields: { email: 'Такий email уже зареєстрований' } }
  await db.user.create({ data: { name, email, roleId, passwordHash: await hashPassword(password), mustChangePassword: true } })
  await audit(u, 'Користувач', 'Користувач', name, `Створено, роль: ${role!.name}`)
  revalidatePath('/settings/users')
  return { created: { name, email, password } }
}

export async function setUserBlocked(id: number, blocked: boolean): Promise<R> {
  const u = await me()
  assertCan(u, 'users', 'edit')
  const t = await db.user.findUnique({ where: { id } })
  if (!t) return { ok: false, error: 'Користувача не знайдено' }
  if (t.isOwner) return { ok: false, error: 'Власника акаунта не можна заблокувати' }
  if (t.id === u.id) return { ok: false, error: 'Не можна заблокувати себе' }
  await db.$transaction([db.user.update({ where: { id }, data: { status: blocked ? 'BLOCKED' : 'ACTIVE', failedAttempts: 0, lockedUntil: null } }), ...(blocked ? [db.session.deleteMany({ where: { userId: id } })] : [])])
  await audit(u, 'Користувач', 'Користувач', t.name, `Статус: ${blocked ? 'активний → заблокований' : 'заблокований → активний'}`)
  revalidatePath('/settings/users')
  return { ok: true }
}

/** FR-1.3: скидання пароля — новий тимчасовий пароль показується адміну один раз */
export async function resetPassword(id: number): Promise<R<{ password: string }>> {
  const u = await me()
  assertCan(u, 'users', 'edit')
  const t = await db.user.findUnique({ where: { id } })
  if (!t) return { ok: false, error: 'Користувача не знайдено' }
  if (t.isOwner && t.id !== u.id) return { ok: false, error: 'Пароль власника скидає лише він сам' }
  const password = tempPassword()
  await db.$transaction([db.user.update({ where: { id }, data: { passwordHash: await hashPassword(password), mustChangePassword: true, failedAttempts: 0, lockedUntil: null } }), db.session.deleteMany({ where: { userId: id } })])
  await audit(u, 'Користувач', 'Користувач', t.name, 'Пароль скинуто')
  revalidatePath('/settings/users')
  return { ok: true, password }
}

export async function changeUserRole(id: number, roleId: number): Promise<R> {
  const u = await me()
  assertCan(u, 'users', 'edit')
  const [t, r] = await Promise.all([db.user.findUnique({ where: { id }, include: { role: true } }), db.role.findUnique({ where: { id: roleId } })])
  if (!t || !r) return { ok: false, error: 'Не знайдено' }
  if (t.isOwner) return { ok: false, error: 'Роль власника акаунта змінити не можна' }
  if (t.id === u.id) return { ok: false, error: 'Не можна змінити власну роль' }
  await db.user.update({ where: { id }, data: { roleId } })
  await audit(u, 'Роль', 'Користувач', t.name, `Роль: ${t.role.name} → ${r.name}`)
  revalidatePath('/settings/users')
  return { ok: true }
}

export async function saveRole(roleId: number, perms: Perms, seeAllClients: boolean): Promise<R> {
  const u = await me()
  assertCan(u, 'users', 'edit')
  const role = await db.role.findUnique({ where: { id: roleId } })
  if (!role) return { ok: false, error: 'Роль не знайдено' }
  if (role.isAdmin) return { ok: false, error: 'Права ролі «Адмін» незмінні — вона бачить і керує всім' }
  const clean: Perms = {}
  for (const s of SECTIONS) { clean[s.key] = {}; for (const a of s.actions) if (perms[s.key]?.[a]) clean[s.key][a] = true }
  // логіка залежностей: створення/редагування/видалення неможливі без перегляду
  for (const k of Object.keys(clean)) if (!clean[k].view) clean[k] = {}
  await db.role.update({ where: { id: roleId }, data: { permissions: clean, seeAllClients } })
  await audit(u, 'Права ролі', 'Роль', role.name, `Збережено; доступ до реєстру: ${seeAllClients ? 'усі клієнти' : 'лише закріплені'}`)
  revalidatePath('/settings/users')
  return { ok: true }
}

export async function createRole(_: unknown, fd: FormData): Promise<{ error?: string; id?: number }> {
  const u = await me()
  assertCan(u, 'users', 'create')
  const name = String(fd.get('name') ?? '').trim()
  if (!name) return { error: 'Вкажіть назву ролі' }
  if (await db.role.findUnique({ where: { name } })) return { error: 'Роль з такою назвою вже є' }
  const r = await db.role.create({ data: { name, permissions: { analytics: { view: true }, clients: { view: true }, deals: { view: true }, funnels: { view: true } }, seeAllClients: false } })
  await audit(u, 'Роль', 'Роль', name, 'Створено')
  revalidatePath('/settings/users')
  return { id: r.id }
}

/* ===================== Довідники (FR-6.2, FR-7.10) ===================== */
const KINDS = ['SOURCE', 'LOSS_REASON', 'OBJECT_TYPE', 'CHANNEL'] as const
export async function addDictItem(kind: string, name: string): Promise<R> {
  const u = await me()
  assertCan(u, 'users', 'edit')
  if (!KINDS.includes(kind as (typeof KINDS)[number])) return { ok: false, error: 'Невідомий довідник' }
  const v = name.trim()
  if (!v) return { ok: false, error: 'Вкажіть значення' }
  if (await db.dictionary.findUnique({ where: { kind_name: { kind, name: v } } })) return { ok: false, error: 'Таке значення вже є' }
  const pos = (await db.dictionary.aggregate({ where: { kind }, _max: { position: true } }))._max.position ?? 0
  await db.dictionary.create({ data: { kind, name: v, position: pos + 1 } })
  await audit(u, 'Довідник', 'Довідник', v, `Додано (${kind})`)
  revalidatePath('/settings/dictionaries')
  return { ok: true }
}
export async function removeDictItem(id: number): Promise<R> {
  const u = await me()
  assertCan(u, 'users', 'edit')
  const d = await db.dictionary.findUnique({ where: { id } })
  if (!d) return { ok: false, error: 'Не знайдено' }
  await db.dictionary.delete({ where: { id } })
  await audit(u, 'Довідник', 'Довідник', d.name, `Видалено (${d.kind})`)
  revalidatePath('/settings/dictionaries')
  return { ok: true }
}
export async function saveSupplier(id: number | null, _: unknown, fd: FormData): Promise<{ error?: string; ok?: boolean }> {
  const u = await me()
  assertCan(u, 'users', 'edit')
  const name = String(fd.get('name') ?? '').trim(), phone = String(fd.get('phone') ?? '').trim() || null
  if (!name) return { error: 'Вкажіть назву постачальника' }
  if (await db.supplier.findFirst({ where: { name, ...(id ? { NOT: { id } } : {}) } })) return { error: 'Постачальник з такою назвою вже є' }
  if (id) await db.supplier.update({ where: { id }, data: { name, phone } }); else await db.supplier.create({ data: { name, phone } })
  await audit(u, 'Постачальник', 'Постачальник', name, id ? 'Змінено' : 'Створено')
  revalidatePath('/settings/dictionaries')
  return { ok: true }
}
export async function setSupplierArchived(id: number, archived: boolean): Promise<R> {
  const u = await me()
  assertCan(u, 'users', 'edit')
  const s = await db.supplier.update({ where: { id }, data: { status: archived ? 'ARCHIVED' : 'ACTIVE' } })
  await audit(u, 'Постачальник', 'Постачальник', s.name, archived ? 'В архів' : 'Відновлено')
  revalidatePath('/settings/dictionaries')
  return { ok: true }
}
export async function saveSetting(key: string, value: string): Promise<R> {
  const u = await me()
  assertCan(u, 'users', 'edit')
  if (!['currency', 'unit', 'timezone'].includes(key)) return { ok: false, error: 'Невідомий параметр' }
  await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
  await audit(u, 'Налаштування', 'Налаштування', key, value)
  revalidatePath('/settings/dictionaries')
  return { ok: true }
}
