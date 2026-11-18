'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { saveDay, saveMonth } from '@/app/actions/consumption'

export function UsageForm({ systems, current, defaultDate, canEdit, dayValues }: {
  systems: { id: number; name: string; group: 'A' | 'B' | 'UNSET'; hasGeneration: boolean }[]; current: number; defaultDate: string; canEdit: boolean; dayValues: Record<number, number>
}) {
  const r = useRouter()
  const [sid, setSid] = useState(current)
  const sys = systems.find((s) => s.id === sid) ?? systems[0]
  const [date, setDate] = useState(defaultDate)
  const [mode, setMode] = useState<'hour' | 'day'>('hour')
  const [hour, setHour] = useState(11)
  const [val, setVal] = useState('')
  const [gen, setGen] = useState('')
  const [month, setMonth] = useState(defaultDate.slice(0, 7))
  const [day, setDay] = useState<string[]>(Array.from({ length: 24 }, (_, h) => (dayValues[h] !== undefined ? String(Math.round(dayValues[h] * 10) / 10) : '')))
  const [manual, setManual] = useState(true)
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null)
  const [pending, start] = useTransition()
  useEffect(() => { setSid(current) }, [current])
  if (!sys) return null
  const isA = sys.group === 'A'
  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))
  const say = (t: string, bad = false) => { setMsg({ t, bad }); setTimeout(() => setMsg(null), 4000) }
  const done = (res: { ok: boolean; error?: string }) => { if (res.ok) { say('Збережено'); setVal(''); r.refresh() } else say(res.error ?? 'Помилка', true) }

  const submit = () => start(async () => {
    if (!manual) return say('Підтвердіть, що значення внесено вручну', true)
    if (!isA) { const v = num(val); if (v === null) return say('Вкажіть обсяг', true); return done(await saveMonth(sys.id, month, Math.round(v * 1000), Math.round((num(gen) ?? 0) * 1000))) }
    if (mode === 'day') return done(await saveDay(sys.id, date, day.map(num)))
    const v = num(val); if (v === null) return say('Вкажіть обсяг', true)
    const vals: (number | null)[] = Array(24).fill(null), g: (number | null)[] = Array(24).fill(null)
    vals[hour] = v; g[hour] = num(gen) ?? 0
    done(await saveDay(sys.id, date, vals, g))
  })

  return (
    <div className="card" id="enter">
      <h3>Внести споживання</h3>
      <div className="g" style={{ gap: 14 }}>
        <div><label className="lbl" htmlFor="us">Система</label>
          <select className="input" id="us" value={sid} onChange={(e) => { const n = Number(e.target.value); setSid(n); r.push(`?s=${n}`) }}>{systems.map((s) => <option key={s.id} value={s.id}>{s.name} · група {s.group === 'A' ? 'А' : s.group === 'B' ? 'Б' : '—'}</option>)}</select></div>
        {isA ? (<>
          <div className="seg" role="radiogroup" aria-label="Режим внесення" style={{ background: '#eef1f5', width: 'fit-content' }}>
            {([['hour', 'Година'], ['day', 'Уся доба']] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)} style={{ border: 0, cursor: 'pointer', font: '600 13px Inter,system-ui,sans-serif', padding: '8px 16px', borderRadius: 999, background: mode === k ? '#0f1115' : 'none', color: mode === k ? '#fff' : '#444b59' }}>{l}</button>)}
          </div>
          <div className="g" style={{ gridTemplateColumns: mode === 'hour' ? '1fr 1fr' : '1fr', gap: 12 }}>
            <div><label className="lbl" htmlFor="ud">Дата</label><input className="input num" id="ud" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            {mode === 'hour' && <div><label className="lbl" htmlFor="uh">Година</label><select className="input num" id="uh" value={hour} onChange={(e) => setHour(Number(e.target.value))}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00 – {String((h + 1) % 24).padStart(2, '0')}:00</option>)}</select></div>}
          </div>
          {mode === 'hour' ? (<>
            <div><label className="lbl" htmlFor="uv">Обсяг, кВт·год</label><input className="input num" id="uv" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} placeholder="напр. 210" /><div className="hint">Для групи Б вносяться місячні обсяги в МВт·год</div></div>
            {sys.hasGeneration && <div><label className="lbl" htmlFor="ug">Власна генерація, кВт·год (входить в обсяг)</label><input className="input num" id="ug" inputMode="decimal" value={gen} onChange={(e) => setGen(e.target.value)} /></div>}
          </>) : (
            <div><span className="lbl">Обсяг за кожну годину, кВт·год</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>{day.map((v, h) => <label key={h} className="s12 muted" style={{ display: 'block' }}>{String(h).padStart(2, '0')}<input className="input num" style={{ height: 34, padding: '0 8px' }} inputMode="decimal" value={v} onChange={(e) => setDay((d) => d.map((x, i) => (i === h ? e.target.value : x)))} aria-label={`Година ${h}`} /></label>)}</div></div>
          )}
        </>) : (<>
          <div><label className="lbl" htmlFor="um">Місяць</label><input className="input num" id="um" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
          <div><label className="lbl" htmlFor="uv">Обсяг, МВт·год</label><input className="input num" id="uv" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} /><div className="hint">Для групи Б вносяться місячні обсяги в МВт·год</div></div>
        </>)}
        <label className="row" style={{ gap: 10, cursor: 'pointer' }}><input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#0f1115' }} /><span className="s13">Значення внесено вручну</span></label>
        {canEdit ? <div className="row"><button className="btn line" style={{ flex: 1 }} onClick={() => { setVal(''); setGen('') }}>Скасувати</button><button className="btn dark" style={{ flex: 1 }} disabled={pending} onClick={submit}>{pending ? '…' : 'Зберегти'}</button></div> : <div className="muted s12">Лише перегляд</div>}
      </div>
      {msg && <div className={`toast${msg.bad ? ' bad' : ''}`} role="status">{msg.t}</div>}
    </div>
  )
}
