'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { reassignClients } from '@/app/actions/clients'
import type { ClientFilter } from '@/server/clientQuery'

export type Row = {
  id: number; name: string; sub: string; status: 'COLD' | 'WARM' | 'ACTIVE'; phone: string; email: string | null; group: 'A' | 'B' | 'UNSET'
  suppliers: string; generation: string; deals: number; managerId: number; manager: string; managerCls: string; managerInit: string; last: string
}
const ST = { ACTIVE: ['Дійсний', 'c-green'], WARM: ['Теплий', 'c-orange'], COLD: ['Холодний', 'c-blue'] } as const

export function RegistryTable({ rows, total, canBulk, managers, filter, sort, sortHref }: {
  rows: Row[]; total: number; canBulk: boolean; managers: { id: number; name: string }[]; filter: ClientFilter; sort: string; sortHref: Record<string, string>
}) {
  const r = useRouter()
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [all, setAll] = useState(false)
  const [mgr, setMgr] = useState('')
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null)
  const [pending, start] = useTransition()
  const pageAll = rows.length > 0 && rows.every((x) => sel.has(x.id))
  const count = all ? total : sel.size
  const toggle = (id: number) => { setAll(false); setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const apply = () => start(async () => {
    const res = await reassignClients({ ...(all ? { filter } : { ids: [...sel] }), managerId: Number(mgr) })
    if (res.ok) { setMsg({ t: `Перезакріплено клієнтів: ${res.count}` }); setSel(new Set()); setAll(false); setMgr(''); r.refresh() } else setMsg({ t: res.error, bad: true })
    setTimeout(() => setMsg(null), 5000)
  })
  const word = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'клієнта' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'клієнти' : 'клієнтів')

  return (
    <>
      {canBulk && count > 0 && (
        <div className="row" style={{ background: '#0f1115', color: '#fff', borderRadius: 16, padding: '12px 18px', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap' }} role="region" aria-label="Масові дії">
          <span className="s13"><b>Вибрано {count} {word(count)}</b> · дії для всіх вибраних
            {!all && pageAll && total > rows.length && <> · <button className="b" onClick={() => setAll(true)} style={{ color: '#f7c948', background: 'none', border: 0, cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}>Вибрати всіх {total} за фільтром</button></>}</span>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <label className="input" style={{ width: 320, height: 38, background: '#fff', color: '#10131a', position: 'relative', cursor: 'pointer' }}>
              <span>{managers.find((m) => String(m.id) === mgr)?.name ?? 'Перезакріпити за менеджером…'}</span><span aria-hidden="true">▾</span>
              <select aria-label="Менеджер для перезакріплення" value={mgr} onChange={(e) => setMgr(e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: 'pointer' }}>
                <option value="">Перезакріпити за менеджером…</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <button className="btn" disabled={!mgr || pending} onClick={apply} style={{ background: '#f7c948', color: '#10131a', height: 38 }}>{pending ? 'Застосовуємо…' : 'Застосувати'}</button>
            <button className="btn" onClick={() => { setSel(new Set()); setAll(false) }} style={{ background: '#2a2f3a', color: '#fff', height: 38 }}>Скасувати вибір</button>
          </div>
        </div>
      )}
      <div className="card scroll-x" style={{ padding: '8px 8px 4px' }}>
        <table className="tbl">
          <thead><tr>
            {canBulk && <th style={{ width: 36 }}><input type="checkbox" aria-label="Вибрати всіх на сторінці" checked={pageAll} onChange={() => { setAll(false); setSel(pageAll ? new Set() : new Set(rows.map((x) => x.id))) }} style={{ width: 18, height: 18, accentColor: '#0f1115' }} /></th>}
            <th><Link href={sortHref.name} style={{ textDecoration: 'none' }}>Клієнт{sort === 'name' ? ' ↑' : sort === '-name' ? ' ↓' : ''}</Link></th><th>Статус контакту</th><th>Контакти</th><th>Група</th><th>Постачальник</th><th>Генерація</th><th>Угод</th><th>Менеджер</th>
            <th><Link href={sortHref.last} style={{ textDecoration: 'none' }}>Ост. контакт{sort === '-last' ? ' ↓' : sort === 'last' ? ' ↑' : ''}</Link></th>
          </tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} style={sel.has(c.id) || all ? { background: '#f1f6fe' } : undefined}>
                {canBulk && <td><input type="checkbox" aria-label={`Вибрати ${c.name}`} checked={all || sel.has(c.id)} onChange={() => toggle(c.id)} style={{ width: 18, height: 18, accentColor: '#0f1115' }} /></td>}
                <td><Link href={`/clients/${c.id}`} style={{ textDecoration: 'none' }}><b>{c.name}</b></Link><div className="s12 muted">{c.sub}</div></td>
                <td><span className={`chip ${ST[c.status][1]}`}>{ST[c.status][0]}</span></td>
                <td className="s13 num">{c.phone}<div className="s12 muted">{c.email ?? '—'}</div></td>
                <td>{c.group === 'UNSET' ? <span className="chip c-gray">—</span> : <span className={`chip ${c.group === 'A' ? 'c-purple' : 'c-blue'}`}>{c.group === 'A' ? 'А' : 'Б'}</span>}</td>
                <td className={`s13${c.suppliers === '—' ? ' muted' : ''}`}>{c.suppliers}</td>
                <td className={`s13${c.generation === 'Немає' ? ' muted' : ''}`}>{c.generation}</td>
                <td className="num b">{c.deals}</td>
                <td><div className="row" style={{ gap: 8 }}><span className={`avatar ${c.managerCls}`} style={{ width: 28, height: 28, fontSize: 10 }}>{c.managerInit}</span><span className="s13">{c.manager}</span></div></td>
                <td className="s13">{c.last}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={canBulk ? 10 : 9}><div className="empty"><b>Клієнтів не знайдено</b>Змініть фільтри або додайте першого клієнта.</div></td></tr>}
          </tbody>
        </table>
      </div>
      {msg && <div className={`toast${msg.bad ? ' bad' : ''}`} role="status">{msg.t}</div>}
    </>
  )
}
