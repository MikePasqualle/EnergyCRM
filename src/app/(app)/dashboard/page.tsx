import Link from 'next/link'
import { requireCan } from '@/server/auth'
import { Shell } from '@/components/Shell'
import { SelectPill } from '@/components/SelectPill'
import { db } from '@/lib/db'
import { dashboard } from '@/server/analytics'
import { getScope } from '@/server/scope'
import { parsePeriod, todayKyiv } from '@/server/period'
import { sees_all } from '@/server/permissions'
import { Av, Empty } from '@/components/ui'
import { avCls, dLong, initials, mln, monShort, n, n1 } from '@/lib/format'
import { one, qs, type SP } from '@/lib/url'

export const metadata = { title: 'Аналітика — EnergyCRM' }

const vocative = (name: string) => {
  const f = name.split(' ')[0]
  if (/ій$/.test(f)) return f.replace(/ій$/, 'ію')
  if (/ія$/.test(f)) return f.replace(/ія$/, 'іє')
  if (/о$/.test(f)) return f.replace(/о$/, 'е')
  if (/а$/.test(f)) return f.replace(/а$/, 'о')
  if (/я$/.test(f)) return f.replace(/я$/, 'ю')
  return f + 'е'
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireCan('analytics')
  const sp = await searchParams
  const scope = await getScope(user)
  const per = parsePeriod(one(sp.p), one(sp.from), one(sp.to))
  const funnels = await db.funnel.findMany({ where: { status: 'ACTIVE' }, orderBy: { position: 'asc' } })
  const fParam = one(sp.f)
  const funnelId = fParam === 'all' ? null : Number(fParam) || funnels[0]?.id || null
  const canPickMgr = scope === 'team' && sees_all(user)
  const mgrParam = Number(one(sp.m)) || null
  const mgr = scope === 'mine' ? user.id : canPickMgr ? mgrParam : null
  const managers = canPickMgr ? await db.user.findMany({ where: { status: 'ACTIVE', role: { isAdmin: false } }, orderBy: { name: 'asc' } }) : []
  const d = await dashboard({ mgr, funnelId }, per)
  const t = todayKyiv()
  const today = dLong(new Date())
  const base = (patch: Record<string, string | null>) => qs(sp, patch, '/dashboard')

  const c = d.clients
  const cons = d.cons
  const aPct = cons.a + cons.b ? Math.round((cons.a / (cons.a + cons.b)) * 100) : 0
  const growth = d.payPrevAmt ? Math.round(((d.pay.amt - d.payPrevAmt) / d.payPrevAmt) * 100) : null
  const maxWork = Math.max(1, ...d.stageRows.filter((s) => s.type === 'WORKING').map((s) => s.n))
  const maxSer = Math.max(1, ...d.ser.map((s) => s.total))
  const cur = d.ser[d.ser.length - 1]
  const maxContacts = Math.max(50, Math.ceil(Math.max(0, ...d.contacts.map((x) => x.n)) / 50) * 50)
  const empty = c.total === 0

  return (
    <Shell user={user} active="analytics">
      <div className="head">
        <div className="row" style={{ gap: 14 }}>
          <div className={`avatar ${avCls(user.id)}`} style={{ width: 52, height: 52, fontSize: 17 }}>{initials(user.name)}</div>
          <div><h1 className="title">Доброго дня, {vocative(user.name)}!</h1><div className="sub">Стан продажів на {today} · роль: {user.role.name}</div></div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div className="seg" style={{ background: 'rgba(255,255,255,.7)' }}>
            <Link href={base({ p: 'week', from: null, to: null })} className={per.key === 'week' ? 'on' : ''}>Тиждень</Link>
            <Link href={base({ p: 'month', from: null, to: null })} className={per.key === 'month' ? 'on' : ''}>Місяць</Link>
            <Link href={base({ p: 'quarter', from: null, to: null })} className={per.key === 'quarter' ? 'on' : ''}>Квартал</Link>
            <Link href={base({ p: 'range' })} className={per.key === 'range' ? 'on' : ''}>Свій діапазон</Link>
          </div>
          <SelectPill name="f" label="Воронка" value={funnelId ? String(funnelId) : 'all'} options={[{ value: 'all', label: 'Усі' }, ...funnels.map((f) => ({ value: String(f.id), label: f.name }))]} />
          {canPickMgr
            ? <SelectPill name="m" label="Менеджер" value={mgrParam ? String(mgrParam) : ''} options={[{ value: '', label: 'Усі' }, ...managers.map((m) => ({ value: String(m.id), label: m.name }))]} />
            : <SelectPill name="m" label="Менеджер" value="me" disabled options={[{ value: 'me', label: scope === 'mine' ? 'Мої клієнти' : 'Усі' }]} />}
        </div>
      </div>
      {per.key === 'range' && (
        <form className="row" style={{ gap: 10, marginBottom: 16, flexWrap: 'wrap' }} action="/dashboard">
          <input type="hidden" name="p" value="range" />{one(sp.f) && <input type="hidden" name="f" value={one(sp.f)} />}{one(sp.m) && <input type="hidden" name="m" value={one(sp.m)} />}
          <label className="s13 b" htmlFor="from">З</label><input className="input" id="from" name="from" type="date" defaultValue={one(sp.from) ?? ''} style={{ width: 170 }} required />
          <label className="s13 b" htmlFor="to">по</label><input className="input" id="to" name="to" type="date" defaultValue={one(sp.to) ?? ''} style={{ width: 170 }} required />
          <button className="btn dark" type="submit">Застосувати</button>
        </form>
      )}

      {empty ? (
        <div className="card"><Empty title="Поки що немає даних" text="Додайте першого клієнта, щоб побачити показники." action={<Link className="btn dark" href="/clients?new=1">+ Додати клієнта</Link>} /></div>
      ) : (<>
        <div className="g" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
          <div className="card">
            <div className="muted s13 b">Клієнти</div>
            <div className="stat num" style={{ margin: '12px 0 14px' }}>{n(c.total)}</div>
            <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
              <i style={{ flex: c.cold, background: '#a9c7f5' }} /><i style={{ flex: c.warm, background: '#f7c948' }} /><i style={{ flex: c.active, background: '#0f1115' }} />
            </div>
            <div className="row s12" style={{ gap: 12, marginTop: 10, flexWrap: 'wrap' }}><span><b>{n(c.cold)}</b> холодні</span><span><b>{n(c.warm)}</b> теплі</span><span><b>{n(c.active)}</b> дійсні</span></div>
          </div>
          <div className="card">
            <div className="muted s13 b">Угоди в роботі</div>
            <div className="stat num" style={{ margin: '12px 0 14px' }}>{n(d.work.n)}</div>
            <div className="s13">На суму <b>{mln(d.work.amt)}</b></div>
            <div className="row s12" style={{ gap: 8, marginTop: 10 }}><span className="chip c-green">Виграно {d.won}</span><span className="chip c-red">Втрачено {d.lost}</span></div>
          </div>
          <div className="card">
            <div className="muted s13 b">Оплати за період</div>
            <div className="stat num" style={{ margin: '12px 0 14px' }}>{n(d.pay.n)}</div>
            <div className="s13">Отримано <b>{mln(d.pay.amt)}</b></div>
            {growth !== null && <div className="row s12" style={{ marginTop: 10 }}><span className={`chip ${growth >= 0 ? 'c-green' : 'c-red'}`}>{growth >= 0 ? '▲' : '▼'} {Math.abs(growth)}% {per.prevWord}</span></div>}
          </div>
          <div className="yel">
            <div className="s13 b" style={{ color: '#3b2f00' }}>Споживання клієнтів</div>
            <div className="stat num" style={{ margin: '12px 0 6px' }}>{n(Math.round(cons.total / 1e4) / 100)}</div>
            <div className="s13 b" style={{ color: '#3b2f00' }}>ГВт·год {per.monthWord}</div>
            <div className="row s12" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}><span className="chip" style={{ background: '#fff' }}>Група А {aPct}%</span><span className="chip" style={{ background: '#fff' }}>Група Б {cons.a + cons.b ? 100 - aPct : 0}%</span></div>
          </div>
        </div>

        <div className="g" style={{ gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)', marginTop: 16 }}>
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <h3 style={{ margin: 0 }}>Угоди по етапах воронки «{d.funnel?.name ?? '—'}»</h3>
              <Link className="btn light" href={d.funnel ? `/funnels?f=${d.funnel.id}` : '/funnels'} style={{ padding: '8px 14px' }}>Відкрити воронку</Link>
            </div>
            <div className="g" style={{ gap: 14, marginTop: 16 }}>
              {d.stageRows.map((s) => (
                <div key={s.id}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="b s13">{s.name}{s.type === 'WON' ? ' (виграно)' : ''}</span>
                    <span className="s13 muted num">{n(s.n)} {plural(s.n, 'угода', 'угоди', 'угод')} · {mln(s.amt)}</span>
                  </div>
                  <div className="bar" style={{ marginTop: 7, height: 14 }}><i style={{ width: `${Math.min(100, (s.n / maxWork) * 100)}%`, background: s.color }} /></div>
                </div>
              ))}
              {!d.stageRows.length && <div className="muted s13">Воронку не обрано.</div>}
            </div>
          </div>
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}><h3 style={{ margin: 0 }}>Споживання за 12 місяців, МВт·год</h3></div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9, height: 210, marginTop: 20, paddingTop: 30 }}>
              {d.ser.map((s, i) => {
                const last = i === d.ser.length - 1
                return (
                  <div key={i} style={{ flex: 1, textAlign: 'center', position: last ? 'relative' : undefined }}>
                    {last && <div style={{ position: 'absolute', top: -34, left: '50%', transform: 'translateX(-50%)', background: '#0f1115', color: '#fff', borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{n(Math.round(cur.total / 1000))}</div>}
                    <div title={`${n(Math.round(s.total / 1000))} МВт·год`} style={{ height: Math.max(4, Math.round((s.total / maxSer) * 158)), background: last ? '#f7c948' : '#cfd8e6', borderRadius: 8 }} />
                    <div className={`s12 ${last ? 'b' : 'muted'}`} style={{ marginTop: 8 }}>{cap(monShort(s.m))}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="g" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))', marginTop: 16 }}>
          <div className="card">
            <h3>Споживання за групою та постачальником</h3>
            <div className="row" style={{ gap: 22 }}>
              <div style={{ position: 'relative', width: 124, height: 124, borderRadius: '50%', background: `conic-gradient(#0f1115 0 ${aPct}%,#f7c948 ${aPct}% 100%)`, flex: 'none' }}>
                <div style={{ position: 'absolute', inset: 24, background: '#fff', borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 14 }}>А / Б</div>
              </div>
              <div className="g s13" style={{ gap: 10, flex: 1 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}><span className="row" style={{ gap: 8 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: '#0f1115' }} />Група А</span><b className="num">{n(Math.round(cons.a / 1000))}</b></div>
                <div className="row" style={{ justifyContent: 'space-between' }}><span className="row" style={{ gap: 8 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: '#f7c948' }} />Група Б</span><b className="num">{n(Math.round(cons.b / 1000))}</b></div>
                <div className="sep" style={{ margin: '2px 0' }} />
                {d.topSup ? (<>
                  <div className="row" style={{ justifyContent: 'space-between' }}><span>{d.topSup.name}</span><b className="num">{d.topSup.pct}%</b></div>
                  <div className="row" style={{ justifyContent: 'space-between' }}><span>Інші постачальники</span><b className="num">{100 - d.topSup.pct}%</b></div>
                </>) : <div className="muted">Постачальників не задано</div>}
              </div>
            </div>
          </div>
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: '0 0 14px' }}>Останні оплати</h3><span className="s13 muted">за {per.key === 'month' ? 'місяць' : per.key === 'quarter' ? 'квартал' : 'період'}</span></div>
            <table className="tbl"><tbody>
              {d.recent.map((r, i) => (
                <tr key={i}><td><b>{r.client}</b><div className="s12 muted">{r.purpose === 'Аванс' ? 'Аванс' : 'Договір'} · {r.product}</div></td><td className="num b" style={{ textAlign: 'right' }}>{n(Math.round(r.amount))} ₴</td></tr>
              ))}
              {!d.recent.length && <tr><td className="muted">Оплат за період немає</td></tr>}
            </tbody></table>
          </div>
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: '0 0 14px' }}>Менеджери — відпрацьовано</h3>{can2(user) && <Link className="s13 b" href="/dashboard/managers" style={{ color: '#1a479a' }}>Усі →</Link>}</div>
            <div className="g" style={{ gap: 12 }}>
              {d.contacts.map((m) => (
                <div className="row" key={m.id}><Av id={m.id} name={m.name} size={38} fs={13} /><div style={{ flex: 1 }}><div className="b s13">{m.name}</div><div className="bar" style={{ marginTop: 6 }}><i style={{ width: `${Math.min(100, (m.n / maxContacts) * 100)}%` }} /></div></div><span className="num b s13">{m.n}</span></div>
              ))}
              <div className="s12 muted">Контактів за {per.label} (дзвінки, листи, зустрічі)</div>
            </div>
          </div>
        </div>
      </>)}
      <span hidden>{t.y}{n1(0)}</span>
    </Shell>
  )
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const can2 = (u: { role: { isAdmin: boolean } }) => u.role.isAdmin
function plural(k: number, a: string, b: string, c: string) {
  const m10 = k % 10, m100 = k % 100
  return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c
}
