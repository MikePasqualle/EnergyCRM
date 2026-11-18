import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireCan } from '@/server/auth'
import { Shell } from '@/components/Shell'
import { SelectPill } from '@/components/SelectPill'
import { db } from '@/lib/db'
import { managersReport } from '@/server/analytics'
import { parsePeriod, monthFor } from '@/server/period'
import { sees_all } from '@/server/permissions'
import { Av } from '@/components/ui'
import { monShort, n, uah } from '@/lib/format'
import { one, qs, type SP } from '@/lib/url'

export const metadata = { title: 'Менеджери — EnergyCRM' }

export default async function ManagersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireCan('analytics')
  if (!sees_all(user)) redirect('/dashboard')
  const sp = await searchParams
  const per = parsePeriod(one(sp.p), one(sp.from), one(sp.to))
  const funnels = await db.funnel.findMany({ where: { status: 'ACTIVE' }, orderBy: { position: 'asc' } })
  const funnelId = one(sp.f) === 'all' ? null : Number(one(sp.f)) || funnels[0]?.id || null
  const { rows, daily } = await managersReport(funnelId, per)
  const base = (patch: Record<string, string | null>) => qs(sp, patch, '/dashboard/managers')

  const tot = rows.reduce((a, r) => ({ clients: a.clients + r.clients, contacts: a.contacts + r.calls + r.mails + r.meets, work: a.work + r.work, won: a.won + r.won, lost: a.lost + r.lost, sum: a.sum + r.wonSum, vol: a.vol + r.wonVol }), { clients: 0, contacts: 0, work: 0, won: 0, lost: 0, sum: 0, vol: 0 })
  const closedPct = (w: number, l: number) => (w + l ? Math.round((w / (w + l)) * 100) : 0)

  // діаграма контактів по чотири дні
  const days = [...new Set(daily.map((x) => x.d))].sort()
  const first = per.startDay, lastDay = days.length ? days[days.length - 1] : first
  const nDays = Math.max(1, Math.round((Date.parse(lastDay) - Date.parse(first)) / 864e5) + 1)
  const chunks: { a: number; b: number }[] = []
  for (let i = 0; i < nDays; i += 4) chunks.push({ a: i, b: Math.min(i + 3, nDays - 1) })
  if (chunks.length > 1 && chunks[chunks.length - 1].b - chunks[chunks.length - 1].a < 2) { const l = chunks.pop()!; chunks[chunks.length - 1].b = l.b }
  const dayAt = (i: number) => new Date(Date.parse(first) + i * 864e5)
  const buckets = chunks.map((c) => {
    const from = dayAt(c.a), to = dayAt(c.b)
    const inB = daily.filter((x) => x.d >= from.toISOString().slice(0, 10) && x.d <= to.toISOString().slice(0, 10))
    const sum = (ch: string) => inB.filter((x) => x.ch === ch).reduce((a, x) => a + x.n, 0)
    const calls = sum('Дзвінок'), mails = sum('Лист'), meets = sum('Зустріч')
    return { label: `${from.getUTCDate()}–${to.getUTCDate()} ${monShort(to.getUTCMonth())}`, calls, mails, meets, total: calls + mails + meets }
  })
  const maxB = Math.max(1, ...buckets.map((b) => b.total))
  const exportHref = qs(sp, { f: funnelId ? String(funnelId) : 'all' }, '/dashboard/managers/export')
  const totalClients = rows.reduce((a, r) => a + r.clients, 0) || 1

  return (
    <Shell user={user} active="analytics">
      <div className="head">
        <div>
          <div className="subtabs" style={{ marginBottom: 14 }}><Link href="/dashboard">Огляд</Link><Link className="on" href="/dashboard/managers">Менеджери</Link></div>
          <h1 className="title">Відпрацьовано менеджерами</h1><div className="sub">Контакти й угоди кожного менеджера за обраний період</div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div className="seg" style={{ background: 'rgba(255,255,255,.7)' }}>
            <Link href={base({ p: 'week', from: null, to: null })} className={per.key === 'week' ? 'on' : ''}>Тиждень</Link>
            <Link href={base({ p: 'month', from: null, to: null })} className={per.key === 'month' ? 'on' : ''}>{cap(monthFor(per.months[0].m))} {per.months[0].y}</Link>
            <Link href={base({ p: 'quarter', from: null, to: null })} className={per.key === 'quarter' ? 'on' : ''}>Квартал</Link>
            <Link href={base({ p: 'range' })} className={per.key === 'range' ? 'on' : ''}>Свій діапазон</Link>
          </div>
          <SelectPill name="f" label="Воронка" value={funnelId ? String(funnelId) : 'all'} options={[{ value: 'all', label: 'Усі' }, ...funnels.map((f) => ({ value: String(f.id), label: f.name }))]} />
          <a className="btn dark" href={exportHref}>Експорт у Excel</a>
        </div>
      </div>
      {per.key === 'range' && (
        <form className="row" style={{ gap: 10, marginBottom: 16, flexWrap: 'wrap' }} action="/dashboard/managers">
          <input type="hidden" name="p" value="range" />
          <label className="s13 b" htmlFor="from">З</label><input className="input" id="from" name="from" type="date" defaultValue={one(sp.from) ?? ''} style={{ width: 170 }} required />
          <label className="s13 b" htmlFor="to">по</label><input className="input" id="to" name="to" type="date" defaultValue={one(sp.to) ?? ''} style={{ width: 170 }} required />
          <button className="btn dark" type="submit">Застосувати</button>
        </form>
      )}

      <div className="g" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
        <div className="card"><div className="muted s13 b">Контактів</div><div className="stat num" style={{ marginTop: 12 }}>{n(tot.contacts)}</div><div className="s12 muted" style={{ marginTop: 10 }}>дзвінки · листи · зустрічі</div></div>
        <div className="card"><div className="muted s13 b">Угод у роботі</div><div className="stat num" style={{ marginTop: 12 }}>{n(tot.work)}</div><div className="s12 muted" style={{ marginTop: 10 }}>у {rows.filter((r) => r.work > 0).length} менеджерів</div></div>
        <div className="card"><div className="muted s13 b">Виграно / втрачено</div><div className="stat num" style={{ marginTop: 12 }}>{tot.won} / {tot.lost}</div><div className="s12 muted" style={{ marginTop: 10 }}>частка виграних — {closedPct(tot.won, tot.lost)}%</div></div>
        <div className="yel"><div className="s13 b" style={{ color: '#3b2f00' }}>Сума виграних угод</div><div className="stat num" style={{ marginTop: 12 }}>{n(Math.round(tot.sum / 1e4) / 100)}</div><div className="s13 b" style={{ marginTop: 10, color: '#3b2f00' }}>млн ₴ · {n(Math.round(tot.vol))} МВт·год</div></div>
      </div>

      <div className="card scroll-x" style={{ marginTop: 16, padding: '8px 8px 4px' }}>
        <table className="tbl">
          <thead><tr><th>Менеджер</th><th>Клієнтів</th><th>Контакти: дзвінки / листи / зустрічі</th><th>Угод у роботі</th><th>Виграно</th><th>Втрачено</th><th style={{ textAlign: 'right' }}>Сума виграних</th><th style={{ textAlign: 'right' }}>Обсяг, МВт·год</th><th>Виграно від закритих</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><div className="row" style={{ gap: 10 }}><Av id={r.id} name={r.name} size={38} fs={13} /><div><div className="b">{r.name}</div><div className="s12 muted">{r.email}</div></div></div></td>
                <td className="num">{n(r.clients)}</td>
                <td className="num"><b>{r.calls + r.mails + r.meets}</b> <span className="muted s13">· {r.calls} / {r.mails} / {r.meets}</span></td>
                <td className="num">{r.work}</td>
                <td className="num"><span className="chip c-green">{r.won}</span></td>
                <td className="num"><span className="chip c-red">{r.lost}</span></td>
                <td className="num b" style={{ textAlign: 'right' }}>{uah(r.wonSum)}</td>
                <td className="num" style={{ textAlign: 'right' }}>{n(Math.round(r.wonVol))}</td>
                <td><div className="row" style={{ gap: 8 }}><div className="bar" style={{ width: 70 }}><i style={{ width: `${closedPct(r.won, r.lost)}%` }} /></div><b className="num s13">{closedPct(r.won, r.lost)}%</b></div></td>
              </tr>
            ))}
            <tr style={{ background: '#f6f8fb' }}><td className="b">Разом</td><td className="num b">{n(tot.clients)}</td><td className="num b">{n(tot.contacts)}</td><td className="num b">{tot.work}</td><td className="num b">{tot.won}</td><td className="num b">{tot.lost}</td><td className="num b" style={{ textAlign: 'right' }}>{uah(tot.sum)}</td><td className="num b" style={{ textAlign: 'right' }}>{n(Math.round(tot.vol))}</td><td className="b num">{closedPct(tot.won, tot.lost)}%</td></tr>
          </tbody>
        </table>
      </div>

      <div className="g" style={{ gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)', marginTop: 16 }}>
        <div className="card">
          <h3>Контакти за {per.key === 'month' ? monthFor(per.months[0].m) : per.label} (по чотири дні)</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28, height: 180, marginTop: 10, padding: '0 20px' }}>
            {buckets.map((b) => {
              const H = Math.round((b.total / maxB) * 170)
              const seg = (v: number) => Math.max(v ? 3 : 0, Math.round((v / (b.total || 1)) * H))
              return (
                <div key={b.label} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, height: H, justifyContent: 'flex-end', marginTop: 170 - H > 0 ? 0 : 0 }}>
                    <i style={{ height: seg(b.calls), background: '#0f1115', borderRadius: 6 }} /><i style={{ height: seg(b.mails), background: '#f7c948', borderRadius: 6 }} /><i style={{ height: seg(b.meets), background: '#a9c7f5', borderRadius: 6 }} />
                  </div>
                  <div className="s12 muted" style={{ marginTop: 8 }}>{b.label} · {b.total}</div>
                </div>
              )
            })}
          </div>
          <div className="row s12" style={{ gap: 16, marginTop: 16 }}>
            <span className="row" style={{ gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: '#0f1115' }} />Дзвінки</span>
            <span className="row" style={{ gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: '#f7c948' }} />Листи</span>
            <span className="row" style={{ gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: '#a9c7f5' }} />Зустрічі</span>
          </div>
        </div>
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: '0 0 14px' }}>Розподіл клієнтів за менеджерами</h3><Link className="btn light" href="/clients" style={{ padding: '8px 14px' }}>Перезакріпити</Link></div>
          <div className="g" style={{ gap: 14 }}>
            {[...rows].sort((a, b) => b.clients - a.clients).map((r) => (
              <div key={r.id}><div className="row s13" style={{ justifyContent: 'space-between' }}><b>{r.name}</b><span className="num muted">{n(r.clients)} · {Math.round((r.clients / totalClients) * 100)}%</span></div><div className="bar" style={{ marginTop: 6 }}><i style={{ width: `${Math.round((r.clients / totalClients) * 100)}%` }} /></div></div>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  )
}
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
