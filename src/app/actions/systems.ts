'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { assertCan, getUser } from '@/server/auth'
import { audit } from '@/server/audit'
import { canAccessClient } from '@/server/access'
import { sharesSummary } from '@/lib/shares'

async function me() {
  const u = await getUser()
  if (!u || u.mustChangePassword) throw new Error('Потрібен вхід')
  return u
}

const schema = z.object({
  name: z.string().trim().min(1, 'Вкажіть назву системи').max(120),
  objectType: z.string().trim().max(60),
  powerKw: z.number().int('Потужність — ціле число').min(0, 'Потужність не може бути відʼємною').max(1_000_000),
  address: z.string().trim().max(250).nullable(),
  eic: z.string().trim().toUpperCase().regex(/^[0-9A-Z]{16}$/, 'EIC — 16 символів (цифри та латинські літери)').nullable().or(z.literal('').transform(() => null)),
  group: z.enum(['A', 'B', 'UNSET']),
  meterType: z.string().trim().max(60),
  hasGeneration: z.boolean(),
  genType: z.string().trim().nullable(), genPowerKw: z.number().nullable(), genMode: z.string().trim().nullable(),
  shares: z.array(z.object({ supplierId: z.number().int().positive(), validFrom: z.string(), validTo: z.string().nullable(), pct: z.number() })),
})
export type SystemInput = z.input<typeof schema>

const GROUP = { A: 'А', B: 'Б', UNSET: 'не визначено' } as const

/** FR-7.5, 7.7, 7.8, UC-10: налаштування споживача зі збереженням історії змін (NFR-12) */
export async function saveSystem(systemId: number, input: SystemInput): Promise<{ ok: true } | { ok: false; error: string; field?: string }> {
  const u = await me()
  assertCan(u, 'clients', 'edit')
  const sys = await db.system.findUnique({ where: { id: systemId }, include: { shares: { include: { supplier: true } } } })
  if (!sys || !(await canAccessClient(u, sys.clientId))) return { ok: false, error: 'Систему не знайдено' }
  const p = schema.safeParse(input)
  if (!p.success) return { ok: false, error: p.error.issues[0].message, field: String(p.error.issues[0].path[0]) }
  const d = p.data
  if (d.hasGeneration) {
    if (!d.genType) return { ok: false, error: 'Вкажіть тип генерації', field: 'genType' }
    if (!(Number(d.genPowerKw) > 0)) return { ok: false, error: 'Вкажіть встановлену потужність генерації', field: 'genPowerKw' }
    if (!d.genMode) return { ok: false, error: 'Вкажіть режим генерації', field: 'genMode' }
  }
  const sum = sharesSummary(d.shares)
  if (!sum.ok) return { ok: false, error: sum.error ?? 'Сума часток має дорівнювати 100 %', field: 'shares' }
  const sups = await db.supplier.findMany({ where: { id: { in: [...new Set(d.shares.map((s) => s.supplierId))] } } })
  if (sups.length !== new Set(d.shares.map((s) => s.supplierId)).size) return { ok: false, error: 'Постачальника не знайдено', field: 'shares' }

  const label = (list: { name: string; pct: number }[]) => list.map((x) => `${x.name.replace(/^(ТОВ|ПрАТ)\s*/, '').replace(/[«»]/g, '')} ${x.pct}%`).join(' · ') || 'немає'
  const oldSh = label(sys.shares.map((s) => ({ name: s.supplier.name, pct: s.sharePct })))
  const newSh = label(d.shares.map((s) => ({ name: sups.find((x) => x.id === s.supplierId)!.name, pct: s.pct })))
  const ch: string[] = []
  if (sys.name !== d.name) ch.push(`Назва: ${sys.name} → ${d.name}`)
  if (sys.objectType !== d.objectType) ch.push(`Тип обʼєкта: ${sys.objectType} → ${d.objectType}`)
  if (sys.powerKw !== d.powerKw) ch.push(`Дозволена потужність: ${sys.powerKw} → ${d.powerKw} кВт`)
  if ((sys.address ?? '') !== (d.address ?? '')) ch.push('Адресу змінено')
  if ((sys.eic ?? '') !== (d.eic ?? '')) ch.push('Номер точки обліку (EIC) змінено')
  if (sys.group !== d.group) ch.push(`Група: ${GROUP[sys.group]} → ${GROUP[d.group]}`)
  if (sys.meterType !== d.meterType) ch.push(`Вид обліку: ${sys.meterType} → ${d.meterType}`)
  if (oldSh !== newSh || JSON.stringify(sys.shares.map((s) => [s.supplierId, s.sharePct, s.validFrom.toISOString().slice(0, 10), s.validTo?.toISOString().slice(0, 10) ?? null]).sort()) !== JSON.stringify(d.shares.map((s) => [s.supplierId, s.pct, s.validFrom, s.validTo]).sort()))
    ch.push(`Постачальники: ${oldSh} → ${newSh}`)
  const og = sys.hasGeneration ? `${sys.genType}, ${sys.genPowerKw} кВт, ${sys.genMode}` : 'немає'
  const ng = d.hasGeneration ? `${d.genType}, ${d.genPowerKw} кВт, ${d.genMode}` : 'немає'
  if (og !== ng) ch.push(`Генерація: ${og} → ${ng}`)

  await db.$transaction(async (tx) => {
    await tx.system.update({ where: { id: systemId }, data: {
      name: d.name, objectType: d.objectType, powerKw: d.powerKw, address: d.address, eic: d.eic, group: d.group, meterType: d.meterType,
      hasGeneration: d.hasGeneration, genType: d.hasGeneration ? d.genType : null, genPowerKw: d.hasGeneration ? d.genPowerKw : null, genMode: d.hasGeneration ? d.genMode : null,
      updatedAt: new Date(), updatedBy: u.name,
    } })
    await tx.supplierShare.deleteMany({ where: { systemId } })
    if (d.shares.length) await tx.supplierShare.createMany({ data: d.shares.map((s) => ({ systemId, supplierId: s.supplierId, validFrom: new Date(s.validFrom + 'T00:00:00Z'), validTo: s.validTo ? new Date(s.validTo + 'T00:00:00Z') : null, sharePct: s.pct })) })
    if (ch.length) {
      await tx.systemHistory.create({ data: { systemId, userName: u.name, summary: ch.join('; ') } })
      const client = await tx.client.findUniqueOrThrow({ where: { id: sys.clientId } })
      await audit(u, 'Налаштування споживача', 'Система', `${client.name} · ${d.name}`, ch.join('; '), tx)
    }
  })
  revalidatePath(`/clients/${sys.clientId}`, 'layout')
  return { ok: true }
}

export async function createSystem(clientId: number, _: unknown, fd: FormData): Promise<{ error?: string }> {
  const u = await me()
  assertCan(u, 'clients', 'edit')
  if (!(await canAccessClient(u, clientId))) return { error: 'Клієнта не знайдено' }
  const name = String(fd.get('name') ?? '').trim()
  if (!name) return { error: 'Вкажіть назву системи' }
  const group = (['A', 'B'].includes(String(fd.get('group'))) ? String(fd.get('group')) : 'UNSET') as 'A' | 'B' | 'UNSET'
  const power = Math.max(0, Math.round(Number(fd.get('powerKw')) || 0))
  const s = await db.system.create({ data: { clientId, name, objectType: String(fd.get('objectType') || 'Виробничий'), address: String(fd.get('address') ?? '').trim() || null, powerKw: power, group, meterType: group === 'B' ? 'Місячний (інтегральний)' : 'Почасовий (інтервальний)', updatedBy: u.name } })
  await db.systemHistory.create({ data: { systemId: s.id, userName: u.name, summary: 'Систему створено' } })
  const c = await db.client.findUniqueOrThrow({ where: { id: clientId } })
  await audit(u, 'Налаштування споживача', 'Система', `${c.name} · ${name}`, 'Систему створено')
  revalidatePath(`/clients/${clientId}`, 'layout')
  redirect(`/clients/${clientId}/systems?s=${s.id}`)
}

export async function deleteSystem(systemId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const u = await me()
  assertCan(u, 'clients', 'delete')
  const s = await db.system.findUnique({ where: { id: systemId }, include: { client: true } })
  if (!s) return { ok: false, error: 'Систему не знайдено' }
  await db.system.delete({ where: { id: systemId } })
  await audit(u, 'Видалення', 'Система', `${s.client.name} · ${s.name}`)
  revalidatePath(`/clients/${s.clientId}`, 'layout')
  return { ok: true }
}
