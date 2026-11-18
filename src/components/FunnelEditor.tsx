'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { saveFunnel } from '@/app/actions/funnels'

type St = { key: string; id: number | null; name: string; type: 'WORKING' | 'WON' | 'LOST'; color: string; deals: number }
const TYPES = { WORKING: { l: 'В роботі', c: 'c-blue' }, WON: { l: 'Виграно', c: 'c-green' }, LOST: { l: 'Втрачено', c: 'c-red' } } as const
const PALETTE = ['#a9c7f5', '#7fa9ee', '#f7c948', '#0f1115', '#4cbf78', '#e8837a', '#d3b9f3']

export function FunnelEditor({ funnelId, initial }: { funnelId: number; initial: { name: string; description: string; active: boolean; stages: Omit<St, 'key'>[] } }) {
  const r = useRouter()
  const [name, setName] = useState(initial.name)
  const [desc, setDesc] = useState(initial.description)
  const [active, setActive] = useState(initial.active)
  const [stages, setStages] = useState<St[]>(initial.stages.map((s, i) => ({ ...s, key: `s${s.id ?? i}` })))
  const [moves, setMoves] = useState<Record<string, number>>({})
  const [del, setDel] = useState<St | null>(null)
  const [target, setTarget] = useState<string>('')
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null)
  const [pending, start] = useTransition()
  const [drag, setDrag] = useState<number | null>(null)

  const up = (i: number, p: Partial<St>) => setStages((s) => s.map((x, k) => (k === i ? { ...x, ...p } : x)))
  const move = (from: number, to: number) => setStages((s) => { if (to < 0 || to >= s.length) return s; const a = [...s]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a })
  const add = () => setStages((s) => { const at = Math.max(0, s.findIndex((x) => x.type !== 'WORKING')); const a = [...s]; a.splice(at < 0 ? a.length : at, 0, { key: `n${Date.now()}`, id: null, name: 'Новий етап', type: 'WORKING', color: '#a9c7f5', deals: 0 }); return a })
  const askDelete = (s: St) => { if (s.deals > 0) { setDel(s); setTarget(String(stages.find((x) => x.id && x.id !== s.id)?.id ?? '')) } else remove(s) }
  const remove = (s: St, to?: number) => {
    if (to && s.id) setMoves((m) => ({ ...m, [String(s.id)]: to }))
    setStages((a) => a.filter((x) => x.key !== s.key)); setDel(null)
  }
  const save = () => start(async () => {
    const res = await saveFunnel(funnelId, { name, description: desc, active, stages: stages.map(({ id, name, type, color }) => ({ id, name, type, color })), moves })
    if (res.ok) { setMsg({ t: 'Зміни збережено' }); setMoves({}); r.refresh() } else setMsg({ t: res.error, bad: true })
    setTimeout(() => setMsg(null), 5000)
  })

  return (
    <>
      <div className="head" style={{ marginTop: 0 }}>
        <div style={{ flex: 1 }} />
        <div className="row"><Link className="btn line" href="/funnels">Скасувати</Link><button className="btn dark" onClick={save} disabled={pending}>{pending ? 'Зберігаємо…' : 'Зберегти зміни'}</button></div>
      </div>
      <div className="g">
        <div className="card">
          <h3>Основне</h3>
          <div className="g resp" style={{ gridTemplateColumns: '1.2fr 2fr auto', gap: 16, alignItems: 'end' }}>
            <div><label className="lbl" htmlFor="fn">Назва воронки</label><input className="input" id="fn" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><label className="lbl" htmlFor="fd">Опис</label><input className="input" id="fd" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
            <div><span className="lbl" id="fa">Активна</span>
              <button type="button" role="switch" aria-checked={active} aria-labelledby="fa" className={`sw${active ? ' on' : ''}`} onClick={() => setActive(!active)} style={{ margin: '9px 0', border: 0, cursor: 'pointer', display: 'block' }} /></div>
          </div>
        </div>
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}><h3 style={{ margin: 0 }}>Етапи</h3><span className="s13 muted">Перетягніть за ⠿, щоб змінити порядок</span></div>
          <div className="scroll-x"><table className="tbl" style={{ marginTop: 8 }}>
            <thead><tr><th style={{ width: 36 }} /><th style={{ width: 36 }}>№</th><th>Назва етапу</th><th>Тип етапу</th><th>Колір</th><th>Угод</th><th style={{ textAlign: 'right' }}>Дії</th></tr></thead>
            <tbody>
              {stages.map((s, i) => (
                <tr key={s.key} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag !== null) move(drag, i); setDrag(null) }} style={{ opacity: drag === i ? 0.5 : 1 }}>
                  <td><button type="button" className="muted b" aria-label={`Перемістити етап «${s.name}». Стрілки вгору/вниз`} style={{ border: 0, background: 'none', cursor: 'grab', fontSize: 16 }}
                    onKeyDown={(e) => { if (e.key === 'ArrowUp') { e.preventDefault(); move(i, i - 1) } if (e.key === 'ArrowDown') { e.preventDefault(); move(i, i + 1) } }}>⠿</button></td>
                  <td className="num">{i + 1}</td>
                  <td><input className="input" style={{ height: 38 }} value={s.name} aria-label={`Назва етапу ${i + 1}`} onChange={(e) => up(i, { name: e.target.value })} /></td>
                  <td><label style={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }}><span className={`chip ${TYPES[s.type].c}`}>{TYPES[s.type].l}</span>
                    <select aria-label={`Тип етапу ${i + 1}`} value={s.type} onChange={(e) => up(i, { type: e.target.value as St['type'] })} style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: 'pointer' }}>
                      <option value="WORKING">В роботі</option><option value="WON">Виграно</option><option value="LOST">Втрачено</option></select></label></td>
                  <td><label style={{ position: 'relative', display: 'inline-block', width: 22, height: 22 }}><i style={{ display: 'inline-block', width: 22, height: 22, borderRadius: '50%', background: s.color, boxShadow: '0 0 0 1px rgba(0,0,0,.1)' }} />
                    <input type="color" aria-label={`Колір етапу ${i + 1}`} list="pal" value={s.color} onChange={(e) => up(i, { color: e.target.value })} style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} /></label></td>
                  <td className="num b">{s.deals}</td>
                  <td style={{ textAlign: 'right' }}><button className="btn line" style={{ padding: '7px 12px', fontSize: 13 }} onClick={() => askDelete(s)} disabled={stages.length <= 3}>Видалити</button></td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <datalist id="pal">{PALETTE.map((c) => <option key={c} value={c} />)}</datalist>
          <button className="btn light" style={{ marginTop: 12 }} onClick={add}>+ Додати етап</button>
          <div className="s13" style={{ marginTop: 18, background: '#fff6dc', border: '1px solid #f1dc94', borderRadius: 14, padding: '14px 16px' }}>
            <b>Етап із угодами не можна видалити.</b> Спершу перенесіть угоди{stages[1] ? <>, наприклад з «{stages[1].name}» ({stages[1].deals}) на інший етап,</> : null} — система запропонує це під час видалення.
          </div>
        </div>
      </div>
      {del && (
        <div className="modal-bg" role="dialog" aria-modal="true" aria-label="Перенесення угод">
          <div className="modal narrow" style={{ marginTop: 100 }}>
            <h2>Видалити етап «{del.name}»?</h2><div className="muted s13" style={{ margin: '6px 0 16px' }}>У ньому {del.deals} угод. Оберіть етап, на який їх перенести — переміщення збережеться в історії.</div>
            <label className="lbl" htmlFor="mv">Перенести на етап</label>
            <select className="input" id="mv" value={target} onChange={(e) => setTarget(e.target.value)}>{stages.filter((x) => x.key !== del.key && x.id).map((x) => <option key={x.key} value={x.id!}>{x.name}</option>)}</select>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 20 }}><button className="btn light" onClick={() => setDel(null)}>Скасувати</button><button className="btn danger" disabled={!target} onClick={() => remove(del, Number(target))}>Перенести й видалити</button></div>
          </div>
        </div>
      )}
      {msg && <div className={`toast${msg.bad ? ' bad' : ''}`} role="status">{msg.t}</div>}
    </>
  )
}
