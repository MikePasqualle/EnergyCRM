'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { deleteSystem, saveSystem } from '@/app/actions/systems'
import { fmtDate, sharesSummary } from '@/lib/shares'

type Sh = { key: string; supplierId: number; validFrom: string; validTo: string; pct: number }
export type SysData = {
  id: number; name: string; objectType: string; powerKw: number; address: string; eic: string; group: 'A' | 'B' | 'UNSET'; meterType: string
  hasGeneration: boolean; genType: string; genPowerKw: string; genMode: string; shares: { supplierId: number; validFrom: string; validTo: string | null; pct: number }[]; updatedLabel: string
}
const GEN_TYPES = ['Сонячна електростанція (СЕС)', 'Вітрова', 'Когенерація', 'Інше']
const BAR = ['#0f1115', '#f7c948', '#a9c7f5', '#d3b9f3']

export function SystemEditor({ sys, suppliers, objectTypes, usageHref, canEdit, canDelete, cancelHref }: {
  sys: SysData; suppliers: { id: number; name: string }[]; objectTypes: string[]; usageHref: string; canEdit: boolean; canDelete: boolean; cancelHref: string
}) {
  const r = useRouter()
  const [d, setD] = useState(sys)
  const [shares, setShares] = useState<Sh[]>(sys.shares.map((s, i) => ({ key: `k${i}`, supplierId: s.supplierId, validFrom: s.validFrom, validTo: s.validTo ?? '', pct: s.pct })))
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null)
  const [err, setErr] = useState<{ field?: string; text: string } | null>(null)
  const [pending, start] = useTransition()
  const upd = (p: Partial<SysData>) => setD((x) => ({ ...x, ...p }))
  const upSh = (k: string, p: Partial<Sh>) => setShares((s) => s.map((x) => (x.key === k ? { ...x, ...p } : x)))
  const sum = useMemo(() => sharesSummary(shares.map((s) => ({ supplierId: s.supplierId, validFrom: s.validFrom, validTo: s.validTo || null, pct: s.pct }))), [shares])
  const dis = !canEdit
  const toast = (t: string, bad = false) => { setMsg({ t, bad }); setTimeout(() => setMsg(null), 4500) }

  const save = () => start(async () => {
    setErr(null)
    const res = await saveSystem(sys.id, {
      name: d.name, objectType: d.objectType, powerKw: Math.round(Number(d.powerKw)) , address: d.address || null, eic: d.eic || null, group: d.group, meterType: d.meterType,
      hasGeneration: d.hasGeneration, genType: d.genType || null, genPowerKw: d.genPowerKw ? Number(d.genPowerKw) : null, genMode: d.genMode || null,
      shares: shares.map((s) => ({ supplierId: s.supplierId, validFrom: s.validFrom, validTo: s.validTo || null, pct: Number(s.pct) })),
    })
    if (res.ok) { toast('Налаштування збережено'); r.refresh() } else { setErr({ field: res.field, text: res.error }); toast(res.error, true) }
  })
  const addShare = () => { const today = new Date().toISOString().slice(0, 10); setShares((s) => [...s, { key: `n${Date.now()}`, supplierId: suppliers[0]?.id ?? 0, validFrom: today, validTo: '', pct: shares.length ? Math.max(1, 100 - shares.reduce((a, x) => a + x.pct, 0)) : 100 }]) }
  const lastCheck = sum.checks[sum.checks.length - 1]

  return (
    <div className="g">
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap' }}><h3 style={{ margin: '0 0 14px' }}>Налаштування споживача · {sys.name}</h3><span className="s12 muted">Остання зміна: {sys.updatedLabel}</span></div>
        <div className="g resp" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 16 }}>
          <div><label className="lbl" htmlFor="sn">Назва системи</label><input className={`input${err?.field === 'name' ? ' err' : ''}`} id="sn" value={d.name} disabled={dis} onChange={(e) => upd({ name: e.target.value })} /></div>
          <div><label className="lbl" htmlFor="so">Тип обʼєкта</label><select className="input" id="so" value={d.objectType} disabled={dis} onChange={(e) => upd({ objectType: e.target.value })}>{[...new Set([d.objectType, ...objectTypes])].map((x) => <option key={x}>{x}</option>)}</select></div>
          <div><label className="lbl" htmlFor="sp">Дозволена потужність, кВт</label><input className="input num" id="sp" inputMode="numeric" value={d.powerKw} disabled={dis} onChange={(e) => upd({ powerKw: Number(e.target.value.replace(/\D/g, '')) })} /></div>
          <div style={{ gridColumn: 'span 2' }}><label className="lbl" htmlFor="sa">Адреса</label><input className="input" id="sa" value={d.address} disabled={dis} onChange={(e) => upd({ address: e.target.value })} /></div>
          <div><label className="lbl" htmlFor="se">Номер точки обліку (EIC)</label><input className={`input num${err?.field === 'eic' ? ' err' : ''}`} id="se" value={d.eic} disabled={dis} onChange={(e) => upd({ eic: e.target.value.toUpperCase() })} maxLength={16} />{err?.field === 'eic' && <div className="errmsg">{err.text}</div>}</div>
          <div><span className="lbl" id="sg">Група споживача</span>
            <div className="seg" role="radiogroup" aria-labelledby="sg" style={{ background: '#eef1f5' }}>
              {(['A', 'B'] as const).map((g) => <button type="button" role="radio" aria-checked={d.group === g} disabled={dis} key={g} onClick={() => upd({ group: g, meterType: g === 'A' ? 'Почасовий (інтервальний)' : 'Місячний (інтегральний)' })} style={{ border: 0, cursor: 'pointer', font: '600 13px Inter,system-ui,sans-serif', padding: '8px 16px', borderRadius: 999, background: d.group === g ? '#0f1115' : 'none', color: d.group === g ? '#fff' : '#444b59' }}>Група {g === 'A' ? 'А' : 'Б'}</button>)}
            </div></div>
          <div><label className="lbl" htmlFor="sm">Вид обліку</label><select className="input" id="sm" value={d.meterType} disabled={dis} onChange={(e) => upd({ meterType: e.target.value })}><option>Почасовий (інтервальний)</option><option>Місячний (інтегральний)</option></select></div>
          <div><span className="lbl">Графік споживання</span><Link className="input" href={usageHref} style={{ color: '#1a479a', fontWeight: 600, textDecoration: 'none' }}>{d.group === 'B' ? 'Місячні обсяги · типовий профіль' : 'Погодинний · 24 год × 30 днів'} <span>→</span></Link></div>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}><h3 style={{ margin: '0 0 6px' }}>Розподіл через постачальника</h3>{canEdit && <button className="btn light" onClick={addShare} style={{ padding: '8px 14px', fontSize: 13 }}>+ Додати постачальника</button>}</div>
        <div className="scroll-x"><table className="tbl" style={{ marginTop: 8 }}><thead><tr><th>Постачальник</th><th>Діє з</th><th>Діє до</th><th style={{ width: 300 }}>Частка обсягу</th><th /></tr></thead><tbody>
          {shares.map((s, i) => (
            <tr key={s.key}>
              <td><select className="input" style={{ height: 38 }} aria-label="Постачальник" value={s.supplierId} disabled={dis} onChange={(e) => upSh(s.key, { supplierId: Number(e.target.value) })}>{suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></td>
              <td><input className="input num" type="date" style={{ height: 38, width: 150 }} aria-label="Діє з" value={s.validFrom} disabled={dis} onChange={(e) => upSh(s.key, { validFrom: e.target.value })} /></td>
              <td><input className="input num" type="date" style={{ height: 38, width: 150 }} aria-label="Діє до" value={s.validTo} disabled={dis} onChange={(e) => upSh(s.key, { validTo: e.target.value })} /></td>
              <td><div className="row" style={{ gap: 10 }}><div className="bar" style={{ flex: 1 }}><i style={{ width: `${Math.min(100, s.pct)}%`, background: BAR[i % BAR.length] }} /></div>
                <div style={{ position: 'relative' }}><input className="input num" style={{ width: 76, height: 36, paddingRight: 24 }} aria-label="Частка, %" inputMode="numeric" value={s.pct} disabled={dis} onChange={(e) => upSh(s.key, { pct: Number(e.target.value.replace(/\D/g, '')) })} /><span className="muted" style={{ position: 'absolute', right: 10, top: 9 }}>%</span></div></div></td>
              <td style={{ textAlign: 'right' }}>{canEdit && <button aria-label="Прибрати постачальника" className="muted" onClick={() => setShares((x) => x.filter((y) => y.key !== s.key))} style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>}</td>
            </tr>
          ))}
          {!shares.length && <tr><td colSpan={5} className="muted">Постачальників не задано</td></tr>}
        </tbody></table></div>
        <div className="row s13" style={{ justifyContent: 'space-between', marginTop: 10, padding: '12px 14px', background: sum.ok ? '#eaf8ef' : '#ffe0dc', borderRadius: 12, flexWrap: 'wrap' }} role={sum.ok ? undefined : 'alert'}>
          <b style={{ color: sum.ok ? '#115c2c' : '#9c1f16' }}>{sum.ok ? (lastCheck ? `Разом на ${fmtDate(lastCheck.date)}: 100 %` : 'Постачальників не задано') : sum.error}</b>
          <span className="muted">Збереження можливе лише коли сума часток дорівнює 100 %</span>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>Генерація у споживача</h3>
          <div className="row" style={{ gap: 10 }}><span className="s13 b" id="gl">Є власна генерація</span><button type="button" role="switch" aria-checked={d.hasGeneration} aria-labelledby="gl" disabled={dis} className={`sw${d.hasGeneration ? ' on' : ''}`} onClick={() => upd({ hasGeneration: !d.hasGeneration })} style={{ border: 0, cursor: 'pointer' }} /></div></div>
        {d.hasGeneration && (
          <div className="g resp" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 16, marginTop: 16 }}>
            <div><label className="lbl" htmlFor="gt">Тип генерації *</label><select className={`input${err?.field === 'genType' ? ' err' : ''}`} id="gt" value={d.genType} disabled={dis} onChange={(e) => upd({ genType: e.target.value })}><option value="">—</option>{[...new Set([d.genType, ...GEN_TYPES].filter(Boolean))].map((x) => <option key={x}>{x}</option>)}</select></div>
            <div><label className="lbl" htmlFor="gp">Встановлена потужність, кВт *</label><input className={`input num${err?.field === 'genPowerKw' ? ' err' : ''}`} id="gp" inputMode="decimal" value={d.genPowerKw} disabled={dis} onChange={(e) => upd({ genPowerKw: e.target.value })} /></div>
            <div><label className="lbl" htmlFor="gm">Режим *</label><select className={`input${err?.field === 'genMode' ? ' err' : ''}`} id="gm" value={d.genMode} disabled={dis} onChange={(e) => upd({ genMode: e.target.value })}><option value="">—</option><option>Для власного споживання</option><option>З віддачею в мережу</option></select></div>
          </div>
        )}
        <div className="hint">Аналітика показує споживання з мережі окремо від власної генерації.</div>
      </div>
      {canEdit && (
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          {canDelete ? <button className="btn danger" onClick={() => { if (confirm(`Видалити систему «${sys.name}» разом із графіком споживання?`)) start(async () => { const x = await deleteSystem(sys.id); if (x.ok) r.push(cancelHref) }) }}>Видалити систему</button> : <span />}
          <div className="row"><Link className="btn line" href={cancelHref}>Скасувати</Link><button className="btn dark" disabled={pending || !sum.ok} onClick={save}>{pending ? 'Зберігаємо…' : 'Зберегти налаштування'}</button></div>
        </div>
      )}
      {msg && <div className={`toast${msg.bad ? ' bad' : ''}`} role="status">{msg.t}</div>}
    </div>
  )
}
