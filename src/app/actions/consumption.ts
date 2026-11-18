'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { assertCan, getUser } from '@/server/auth'
import { audit } from '@/server/audit'
import { canAccessClient } from '@/server/access'
import { kyivDate } from '@/server/period'
import { recomputeMonth } from '@/server/consumption'

async function ctx(systemId: number) {
  const u = await getUser()
  if (!u || u.mustChangePassword) throw new Error('Потрібен вхід')
  assertCan(u, 'clients', 'edit')
  const sys = await db.system.findUnique({ where: { id: systemId }, include: { client: true } })
  if (!sys || !(await canAccessClient(u, sys.clientId))) throw new Error('Систему не знайдено')
  return { u, sys }
}
type R = { ok: true } | { ok: false; error: string }
const kwh = z.number().min(0, 'Обсяг не може бути відʼємним').max(10_000_000, 'Занадто велике значення')
const dateRe = /^(\d{4})-(\d\d)-(\d\d)$/

/** UC-11: погодинні значення групи А. values — 24 числа (null = не змінювати); gen — власна генерація за годину */
export async function saveDay(systemId: number, date: string, values: (number | null)[], gen: (number | null)[] = []): Promise<R> {
  const { u, sys } = await ctx(systemId)
  const m = dateRe.exec(date)
  if (!m) return { ok: false, error: 'Вкажіть коректну дату' }
  if (sys.group !== 'A') return { ok: false, error: 'Погодинні значення вносяться для групи А. Для групи Б — місячні обсяги.' }
  if (values.length !== 24) return { ok: false, error: 'Потрібно 24 значення' }
  const y = +m[1], mo = +m[2] - 1, d = +m[3]
  const rows: { h: number; kwh: number; gen: number }[] = []
  for (let h = 0; h < 24; h++) {
    const v = values[h]; if (v === null || v === undefined || Number.isNaN(v)) continue
    const p = kwh.safeParse(v); if (!p.success) return { ok: false, error: `Година ${h}: ${p.error.issues[0].message}` }
    const g = gen[h] ?? 0; const pg = kwh.safeParse(g); if (!pg.success) return { ok: false, error: `Година ${h}: генерація — ${pg.error.issues[0].message}` }
    rows.push({ h, kwh: v, gen: g })
  }
  if (!rows.length) return { ok: false, error: 'Немає значень для збереження' }
  await db.$transaction(async (tx) => {
    for (const r of rows) {
      const ts = kyivDate(y, mo, d, r.h)
      await tx.consumptionHourly.upsert({ where: { systemId_ts: { systemId, ts } }, create: { systemId, ts, kwh: r.kwh, genKwh: r.gen }, update: { kwh: r.kwh, genKwh: r.gen } })
    }
    await recomputeMonth(systemId, y, mo, tx)
    await audit(u, 'Споживання', 'Система', `${sys.client.name} · ${sys.name}`, `${date}: внесено ${rows.length} год.`, tx)
  })
  revalidatePath(`/clients/${sys.clientId}`, 'layout'); revalidatePath('/dashboard')
  return { ok: true }
}

/** Група Б (і разові значення для А без погодин): місячний обсяг, кВт·год */
export async function saveMonth(systemId: number, month: string, kwhValue: number, genValue = 0): Promise<R> {
  const { u, sys } = await ctx(systemId)
  const m = /^(\d{4})-(\d\d)$/.exec(month)
  if (!m) return { ok: false, error: 'Вкажіть місяць' }
  const a = kwh.safeParse(kwhValue); if (!a.success) return { ok: false, error: a.error.issues[0].message }
  const g = kwh.safeParse(genValue); if (!g.success) return { ok: false, error: g.error.issues[0].message }
  const monthDate = new Date(Date.UTC(+m[1], +m[2] - 1, 1))
  const hourly = await db.consumptionMonthly.findUnique({ where: { systemId_month: { systemId, month: monthDate } } })
  if (hourly?.source === 'hourly') return { ok: false, error: 'За цей місяць уже є погодинні значення — обсяг рахується як їх сума.' }
  await db.consumptionMonthly.upsert({ where: { systemId_month: { systemId, month: monthDate } }, create: { systemId, month: monthDate, kwh: kwhValue, genKwh: genValue, source: 'manual' }, update: { kwh: kwhValue, genKwh: genValue, source: 'manual' } })
  await audit(u, 'Споживання', 'Система', `${sys.client.name} · ${sys.name}`, `${month}: ${kwhValue} кВт·год`)
  revalidatePath(`/clients/${sys.clientId}`, 'layout'); revalidatePath('/dashboard')
  return { ok: true }
}
