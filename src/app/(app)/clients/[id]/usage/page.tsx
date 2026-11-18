import Link from 'next/link'
import { Prisma } from '@/generated/prisma/client'
import { requireCan } from '@/server/auth'
import { Shell } from '@/components/Shell'
import { ClientHeader } from '@/components/ClientHeader'
import { UsageForm } from '@/components/UsageForm'
import { SelectPill } from '@/components/SelectPill'
import { db } from '@/lib/db'
import { loadClient } from '@/server/access'
import { can } from '@/server/permissions'
import { kyivDate, todayKyiv } from '@/server/period'
import { dIso, monNom, monShort, n, n1 } from '@/lib/format'
import { one, qs, type SP } from '@/lib/url'

export const metadata = { title: 'Споживання клієнта — EnergyCRM' }
const MONTH_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня']
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const mwh = (kwh: number) => n1(Math.round(kwh / 100) / 10)

export default async function UsagePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requireCan('clients')
  const id = Number((await params).id), sp = await searchParams
  const c0 = await loadClient(user, id)
  const manager = await db.user.findUniqueOrThrow({ where: { id: c0.managerId }, select: { name: true } })
  const systems = await db.system.findMany({ where: { clientId: id }, orderBy: { id: 'asc' } })
  const sel = systems.find((s) => s.id === Number(one(sp.s))) ?? systems[0]
  const t = todayKyiv()
  const base = `/clients/${id}/usage`

  if (!sel) {
    return (
      <Shell user={user} active="clients">
        <ClientHeader id={id} name={c0.name} status={c0.status} active="usage" chips={<span className="chip c-gray">Менеджер: {manager.name}</span>} />
        <div className="card"><div className="empty"><b>Спершу додайте систему</b>Графік споживання привʼязується до системи клієнта.<div style={{ marginTop: 16 }}><Link className="btn dark" href={`/clients/${id}/systems?new=1`}>+ Додати систему</Link></div></div></div>
      </Shell>
    )
  }

  // дата для добового графіка: остання з даними
  const latest = await db.consumptionHourly.findFirst({ where: { systemId: sel.id }, orderBy: { ts: 'desc' }, select: { ts: true } })
  const dateStr = one(sp.d) && /^\d{4}-\d\d-\d\d$/.test(one(sp.d)!) ? one(sp.d)! : dIso(latest?.ts ?? new Date())
  const [dy, dm, dd] = dateStr.split('-').map(Number)
  const isA = sel.group === 'A'
  const view = isA ? (['day', 'month', 'year'].includes(one(sp.v) ?? '') ? one(sp.v)! : 'day') : 'year'

  // KPI за поточний місяць
  const mStart = new Date(Date.UTC(t.y, t.m, 1))
  const [cons, peak] = await Promise.all([
    db.consumptionMonthly.findUnique({ where: { systemId_month: { systemId: sel.id, month: mStart } } }),
    db.$queryRaw<{ p: number | null }[]>(Prisma.sql`SELECT max(kwh+"genKwh")::float8 p FROM "ConsumptionHourly" WHERE "systemId"=${sel.id} AND ts >= ${kyivDate(t.y, t.m, 1, 0)}`),
  ])
  const grid = Number(cons?.kwh ?? 0), gen = Number(cons?.genKwh ?? 0), total = grid + gen

  // дані графіка
  let bars: { label: string; v: number; hi?: boolean }[] = []
  let title = '', sub = ''
  let dayVals: Record<number, number> = {}
  const dayStart = kyivDate(dy, dm - 1, dd, 0)
  const hours = await db.consumptionHourly.findMany({ where: { systemId: sel.id, ts: { gte: dayStart, lt: kyivDate(dy, dm - 1, dd + 1, 0) } } })
  for (let h = 0; h < 24; h++) { const row = hours.find((x) => x.ts.getTime() === kyivDate(dy, dm - 1, dd, h).getTime()); if (row) dayVals[h] = Number(row.kwh) + Number(row.genKwh) }
  if (view === 'day') {
    const vals = Array.from({ length: 24 }, (_, h) => dayVals[h] ?? 0)
    const max = Math.max(...vals)
    bars = vals.map((v, h) => ({ label: String(h), v, hi: v > 0 && v === max }))
    title = `Погодинний графік · група А · ${dd} ${MONTH_GEN[dm - 1]}`
    sub = `Разом за добу: <b>${n(Math.round(vals.reduce((a, b) => a + b, 0)))} кВт·год</b> · кВт·год за кожну годину`
  } else if (view === 'month') {
    const ym = one(sp.mm) && /^\d{4}-\d\d$/.test(one(sp.mm)!) ? one(sp.mm)! : dateStr.slice(0, 7)
    const [y2, m2] = ym.split('-').map(Number)
    const rows = await db.$queryRaw<{ d: number; v: number }[]>(Prisma.sql`SELECT extract(day FROM ts AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Kyiv')::int d, sum(kwh+"genKwh")::float8 v FROM "ConsumptionHourly" WHERE "systemId"=${sel.id} AND ts >= ${kyivDate(y2, m2 - 1, 1, 0)} AND ts < ${kyivDate(y2, m2, 1, 0)} GROUP BY 1 ORDER BY 1`)
    const days = new Date(Date.UTC(y2, m2, 0)).getUTCDate()
    const max = Math.max(1, ...rows.map((r) => r.v))
    bars = Array.from({ length: days }, (_, i) => { const v = rows.find((r) => r.d === i + 1)?.v ?? 0; return { label: String(i + 1), v, hi: v === max } })
    title = `Споживання по днях · ${cap(monNom(m2 - 1).toLowerCase())} ${y2}`
    sub = `Разом за місяць: <b>${mwh(rows.reduce((a, r) => a + r.v, 0))} МВт·год</b> · кВт·год за добу`
  } else {
    const first = new Date(Date.UTC(t.y, t.m - 11, 1))
    const rows = await db.consumptionMonthly.findMany({ where: { systemId: sel.id, month: { gte: first } } })
    const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(t.y, t.m - 11 + i, 1)))
    const vals = months.map((m) => { const r = rows.find((x) => x.month.getTime() === m.getTime()); return r ? Number(r.kwh) + Number(r.genKwh) : 0 })
    const max = Math.max(1, ...vals)
    bars = months.map((m, i) => ({ label: cap(monShort(m.getUTCMonth())), v: vals[i], hi: vals[i] === max }))
    title = isA ? `Споживання за 12 місяців · група А` : `${sel.name} · група Б · типовий профіль`
    sub = `Разом за рік: <b>${mwh(vals.reduce((a, b) => a + b, 0))} МВт·год</b> · кВт·год за місяць`
  }
  const maxBar = Math.max(1, ...bars.map((b) => b.v))
  const power = sel.powerKw
  const scale = view === 'day' ? (power > 0 ? 198 / power : 0.9) : 200 / maxBar
  const px = (v: number) => Math.min(226, Math.max(v > 0 ? 3 : 0, Math.round(v * scale)))

  // таблиця за місяцями
  const lastMonths = [2, 1, 0].map((k) => new Date(Date.UTC(t.y, t.m - k, 1)))
  const mrows = await db.consumptionMonthly.findMany({ where: { system: { clientId: id }, month: { in: lastMonths } } })
  const cell = (sId: number, m: Date) => { const r = mrows.find((x) => x.systemId === sId && x.month.getTime() === m.getTime()); return r ? Number(r.kwh) + Number(r.genKwh) : 0 }
  // профіль групи Б
  const bSys = systems.find((s) => s.group === 'B' && s.id !== sel.id) ?? systems.find((s) => s.group === 'B')
  const bFirst = new Date(Date.UTC(t.y, t.m - 11, 1))
  const bRows = bSys ? await db.consumptionMonthly.findMany({ where: { systemId: bSys.id, month: { gte: bFirst } } }) : []
  const bVals = Array.from({ length: 12 }, (_, i) => { const m = new Date(Date.UTC(t.y, t.m - 11 + i, 1)); const r = bRows.find((x) => x.month.getTime() === m.getTime()); return { m: m.getUTCMonth(), v: r ? Number(r.kwh) + Number(r.genKwh) : 0 } })
  const bMax = Math.max(1, ...bVals.map((x) => x.v))
  const canEdit = can(user, 'clients', 'edit')
  const tab = (v: string, l: string) => <Link key={v} href={qs(sp, { v }, base)} className={view === v ? 'on' : ''} style={{ padding: '8px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600, textDecoration: 'none', ...(view === v ? { background: '#0f1115', color: '#fff' } : { color: '#444b59' }) }}>{l}</Link>

  return (
    <Shell user={user} active="clients">
      <ClientHeader id={id} name={c0.name} status={c0.status} active="usage" chips={<span className="chip c-gray">Менеджер: {manager.name}</span>}
        right={<><SelectPill name="s" label="Система" width={290} value={String(sel.id)} options={systems.map((s) => ({ value: String(s.id), label: `${s.name} (${s.group === 'A' ? 'А' : s.group === 'B' ? 'Б' : '—'})` }))} /><a className="btn dark" href="#enter">+ Внести споживання</a></>} />

      <div className="g" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))', marginBottom: 16 }}>
        <div className="card"><div className="muted s13 b">{monNom(t.m)}, 1–{t.d}</div><div className="stat num" style={{ margin: '10px 0 6px', fontSize: 40 }}>{mwh(total)}</div><div className="s12 muted">МВт·год загалом</div></div>
        <div className="card"><div className="muted s13 b">З мережі</div><div className="stat num" style={{ margin: '10px 0 6px', fontSize: 40 }}>{mwh(grid)}</div><div className="s12 muted">МВт·год</div></div>
        <div className="card"><div className="muted s13 b">Власна генерація{sel.hasGeneration && sel.genType ? ` (${sel.genType.startsWith('Сонячна') ? 'СЕС' : sel.genType})` : ''}</div><div className="stat num" style={{ margin: '10px 0 6px', fontSize: 40 }}>{mwh(gen)}</div><div className="s12 muted">МВт·год · {total ? Math.round((gen / total) * 100) : 0}% від споживання</div></div>
        <div className="yel"><div className="s13 b" style={{ color: '#3b2f00' }}>Пік навантаження</div><div className="stat num" style={{ margin: '10px 0 6px', fontSize: 40 }}>{peak[0].p ? n(Math.round(peak[0].p)) : '—'}</div><div className="s13 b" style={{ color: '#3b2f00' }}>кВт · дозволено {n(power)}</div></div>
      </div>

      <div className="g resp" style={{ gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1fr)', alignItems: 'start' }}>
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 6 }}>
            <h3 style={{ margin: 0 }}>{title}</h3>
            {isA && <div className="row"><div className="seg" style={{ background: '#eef1f5' }}>{tab('day', 'Доба')}{tab('month', 'Місяць')}{tab('year', 'Рік')}</div></div>}
          </div>
          {view === 'day' && isA && <form className="row" style={{ gap: 8, marginBottom: 8 }} action={base}><input type="hidden" name="s" value={sel.id} /><label className="s12 muted" htmlFor="gd">Дата:</label><input className="input num" id="gd" name="d" type="date" defaultValue={dateStr} style={{ width: 160, height: 34 }} /><button className="btn light sm">Показати</button></form>}
          <div className="s13 muted" style={{ marginBottom: 8 }} dangerouslySetInnerHTML={{ __html: sub }} />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: bars.length > 24 ? 3 : 5, height: 230, paddingTop: 12, borderBottom: '1px solid #e7eaf0', position: 'relative' }}>
            {view === 'day' && power > 0 && <><div style={{ position: 'absolute', left: 0, right: 0, top: 31, borderTop: '1px dashed #e8837a' }} /><div style={{ position: 'absolute', right: 0, top: 12, fontSize: 11, fontWeight: 600, color: '#9c1f16' }}>Дозволено {n(power)} кВт</div></>}
            {bars.map((b, i) => <div className="hb" key={i}><i title={`${n(Math.round(b.v))} кВт·год`} style={{ height: px(b.v), background: b.hi ? '#f7c948' : undefined }} /></div>)}
          </div>
          <div style={{ display: 'flex', gap: bars.length > 24 ? 3 : 5, marginTop: 6 }}>{bars.map((b, i) => <span key={i} className={`s12 ${b.hi ? 'b' : 'muted'}`} style={{ flex: 1, textAlign: 'center', fontSize: bars.length > 24 ? 10 : undefined }}>{view === 'month' && i % 2 === 1 ? '' : b.label}</span>)}</div>
          {bars.every((b) => b.v === 0) && <div className="muted s13" style={{ marginTop: 10 }}>Даних за цей період немає — внесіть значення справа.</div>}
        </div>
        <UsageForm systems={systems.map((s) => ({ id: s.id, name: s.name, group: s.group, hasGeneration: s.hasGeneration }))} current={sel.id} defaultDate={dateStr} canEdit={canEdit} dayValues={dayVals} key={`${sel.id}-${dateStr}-${Object.keys(dayVals).length}`} />
      </div>

      <div className="g resp" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', marginTop: 16, alignItems: 'start' }}>
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}><h3 style={{ margin: '0 0 14px' }}>Обсяги за місяцями, МВт·год</h3><span className="s12 muted">Група А — сума погодин, група Б — місячний обсяг</span></div>
          <div className="scroll-x"><table className="tbl"><thead><tr><th>Місяць</th>{systems.map((s) => <th key={s.id} style={{ textAlign: 'right' }}>{s.name.split(',')[0]} ({s.group === 'A' ? 'А' : s.group === 'B' ? 'Б' : '—'})</th>)}<th style={{ textAlign: 'right' }}>Разом</th></tr></thead><tbody>
            {lastMonths.map((m) => {
              const cur = m.getUTCMonth() === t.m && m.getUTCFullYear() === t.y
              return <tr key={m.getTime()}><td>{monNom(m.getUTCMonth())}{cur ? ` (1–${t.d})` : ''}</td>{systems.map((s) => <td className="num" key={s.id} style={{ textAlign: 'right' }}>{mwh(cell(s.id, m))}</td>)}<td className="num b" style={{ textAlign: 'right' }}>{mwh(systems.reduce((a, s) => a + cell(s.id, m), 0))}</td></tr>
            })}
          </tbody></table></div>
        </div>
        {bSys ? (
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: '0 0 14px' }}>{bSys.name} · група Б · типовий профіль</h3><span className="chip c-blue">Б</span></div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>{bVals.map((x, i) => <div className="hb" key={i}><i title={`${mwh(x.v)} МВт·год`} style={{ height: Math.max(x.v ? 3 : 0, Math.round((x.v / bMax) * 90)), background: '#a9c7f5' }} /><span>{cap(monShort(x.m))}</span></div>)}</div>
          </div>
        ) : <div className="card"><div className="muted s13">Для систем групи Б тут зʼявиться типовий профіль споживання за місяцями.</div></div>}
      </div>
    </Shell>
  )
}
