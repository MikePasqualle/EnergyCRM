'use client'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { markClientActive, moveDeal } from '@/app/actions/deals'
import { n, mln } from '@/lib/format'
import { avCls, initials } from '@/lib/format'

export type BCard = { id: number; number: number; client: string; clientId: number; product: string; group: 'A' | 'B' | 'UNSET'; amount: number; vol: number; ownerId: number; ownerName: string; tag: string; tagCls: string; lostReason: string | null; note: string }
export type BCol = { id: number; name: string; type: 'WORKING' | 'WON' | 'LOST'; color: string; count: number; sum: number; cards: BCard[] }

const shortName = (full: string) => { const p = full.split(' '); return p.length > 1 ? `${p[0]} ${p[1][0]}.` : full }
const chipG = (g: string) => (g === 'A' ? 'c-purple' : g === 'B' ? 'c-blue' : 'c-gray')

export function Board({ cols: init, reasons, canMove, canCreate, funnelId, more }: { cols: BCol[]; reasons: string[]; canMove: boolean; canCreate: boolean; funnelId: number; more: string }) {
  const [cols, setCols] = useState(init)
  const [drag, setDrag] = useState<{ id: number; from: number } | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const [lost, setLost] = useState<{ id: number; to: number } | null>(null)
  const [reason, setReason] = useState(reasons[0] ?? '')
  const [toast, setToast] = useState<{ t: string; bad?: boolean; active?: { id: number; name: string } } | null>(null)
  const [, start] = useTransition()
  const say = (t: string, bad = false) => { setToast({ t, bad }); setTimeout(() => setToast(null), 4500) }

  const place = (prev: BCol[], dealId: number, to: number, lostReason?: string) => {
    let card: BCard | undefined
    const out = prev.map((c) => {
      const f = c.cards.find((x) => x.id === dealId)
      if (f) { card = f; return { ...c, cards: c.cards.filter((x) => x.id !== dealId), count: c.count - 1, sum: c.sum - f.amount } }
      return c
    })
    if (!card) return prev
    const cd = { ...card, lostReason: lostReason ?? null }
    return out.map((c) => (c.id === to ? { ...c, cards: [cd, ...c.cards], count: c.count + 1, sum: c.sum + cd.amount } : c))
  }
  const doMove = (dealId: number, to: number, lostReason?: string) => {
    const snapshot = cols
    setCols((p) => place(p, dealId, to, lostReason))
    start(async () => {
      const r = await moveDeal(dealId, to, lostReason)
      if (!r.ok) { setCols(snapshot); say(r.error, true); return }
      const card = snapshot.flatMap((c) => c.cards).find((c) => c.id === dealId)
      if (r.suggestActive && card) setToast({ t: `Угоду виграно. Позначити клієнта «${card.client}» як «Дійсний»?`, active: { id: r.suggestActive, name: card.client } })
      else say('Угоду переміщено')
    })
  }
  const drop = (to: number) => {
    setOver(null)
    if (!drag || drag.from === to) return setDrag(null)
    const target = cols.find((c) => c.id === to)!
    if (target.type === 'LOST') { setLost({ id: drag.id, to }) } else doMove(drag.id, to)
    setDrag(null)
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }} className="scroll-x">
        {cols.map((c) => (
          <section key={c.id} className={`kcol${over === c.id ? ' drop' : ''}`} aria-label={c.name} style={{ ...(c.type === 'LOST' ? { flex: '0 0 190px' } : { minWidth: 210 }), }}
            onDragOver={(e) => { if (canMove && drag) { e.preventDefault(); setOver(c.id) } }} onDragLeave={() => setOver((o) => (o === c.id ? null : o))} onDrop={(e) => { e.preventDefault(); drop(c.id) }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b>{c.name}</b>
              <span className={`chip ${c.type === 'WON' ? 'c-green' : c.type === 'LOST' ? 'c-red' : 'c-gray'}`}>{c.count}{c.type === 'WON' ? ' · виграно' : ''}</span>
            </div>
            <div className="s12 muted num" style={{ margin: '4px 0 8px' }}>{mln(c.sum)}</div>
            <div style={{ height: 4, borderRadius: 4, background: c.color }} />
            {c.cards.map((d) =>
              c.type === 'LOST' ? (
                <Link key={d.id} className="deal" href={`/deals/${d.id}`} draggable={canMove} onDragStart={() => setDrag({ id: d.id, from: c.id })} onDragEnd={() => setDrag(null)}>
                  <b className="s13">{d.client}</b>
                  <div className="s12 muted" style={{ margin: '3px 0 8px' }}>{d.product} · {n(d.amount)} ₴</div>
                  {d.lostReason && <span className="chip c-red">{d.lostReason}</span>}
                </Link>
              ) : (
                <Link key={d.id} className={`deal${drag?.id === d.id ? ' dragging' : ''}`} href={`/deals/${d.id}`} draggable={canMove} onDragStart={() => setDrag({ id: d.id, from: c.id })} onDragEnd={() => { setDrag(null); setOver(null) }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}><b className="s13">{d.client}</b><span className={`chip ${chipG(d.group)}`}>{d.group === 'UNSET' ? '—' : d.group === 'A' ? 'А' : 'Б'}</span></div>
                  <div className="s12 muted" style={{ margin: '3px 0 10px' }}>{d.product}</div>
                  <div className="row" style={{ justifyContent: 'space-between' }}><b className="num">{n(d.amount)} ₴</b><span className="s12 muted num">{n(d.vol)} МВт·год</span></div>
                  <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
                    <div className="row s12 muted" style={{ gap: 6 }}><div className={`avatar ${avCls(d.ownerId)}`} style={{ width: 24, height: 24, fontSize: 10 }}>{initials(d.ownerName)}</div>{shortName(d.ownerName)}</div>
                    {d.tagCls ? <span className={`chip ${d.tagCls}`}>{d.tag}</span> : <span className="s12 muted">{d.tag}</span>}
                  </div>
                </Link>
              ),
            )}
            {c.cards.length < c.count && <Link className="s12 b" style={{ display: 'block', textAlign: 'center', marginTop: 10, color: '#1a479a' }} href={more}>Показати ще {c.count - c.cards.length}…</Link>}
            {c.type === 'WORKING' && canCreate && <Link className="btn light" href={`/funnels?f=${funnelId}&new=1&stage=${c.id}`} style={{ width: '100%', marginTop: 12, fontSize: 13 }}>+ Додати угоду</Link>}
          </section>
        ))}
      </div>

      {lost && (
        <div className="modal-bg" role="dialog" aria-modal="true" aria-label="Причина втрати">
          <div className="modal narrow" style={{ marginTop: 100 }}>
            <h2>Угоду втрачено</h2><div className="muted s13" style={{ marginBottom: 16 }}>Вкажіть причину — це обовʼязково.</div>
            <label className="lbl" htmlFor="lr">Причина втрати *</label>
            <select className="input" id="lr" value={reason} onChange={(e) => setReason(e.target.value)}>{reasons.map((r) => <option key={r}>{r}</option>)}</select>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn light" onClick={() => setLost(null)}>Скасувати</button>
              <button className="btn danger" onClick={() => { doMove(lost.id, lost.to, reason); setLost(null) }}>Позначити втраченою</button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className={`toast${toast.bad ? ' bad' : ''}`} role="status">
          {toast.t}
          {toast.active && <button className="btn" style={{ marginLeft: 12, background: '#f7c948', padding: '6px 12px' }} onClick={async () => { await markClientActive(toast.active!.id); say('Статус клієнта змінено') }}>Так</button>}
        </div>
      )}
    </>
  )
}
