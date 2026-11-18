'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { saveProduct, setProductArchived } from '@/app/actions/settings'
import { n } from '@/lib/format'

export type PData = { id: number | null; name: string; description: string; price: string; tariffModel: string; termMonths: string; minVolumeMwh: string; group: 'A' | 'B' | 'BOTH'; terms: string; archived: boolean }
const MODELS = ['Фіксована', 'Фіксована з гарантією ціни', 'Змінна (індекс РДН)', 'Змішана']

export function ProductEditor({ init, canEdit, cancelHref }: { init: PData; canEdit: boolean; cancelHref: string }) {
  const r = useRouter()
  const [d, setD] = useState(init)
  const [errs, setErrs] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null)
  const [pending, start] = useTransition()
  const up = (p: Partial<PData>) => setD((x) => ({ ...x, ...p }))
  const toast = (t: string, bad = false) => { setMsg({ t, bad }); setTimeout(() => setMsg(null), 4500) }
  const price = Number(d.price.replace(',', '.').replace(/\s/g, ''))
  const dis = !canEdit
  const save = () => start(async () => {
    const res = await saveProduct(d.id, { name: d.name, description: d.description, price, tariffModel: d.tariffModel, termMonths: Number(d.termMonths), minVolumeMwh: Number(d.minVolumeMwh || 0), group: d.group, terms: d.terms })
    if (res.ok) { setErrs({}); toast('Продукт збережено'); if (!d.id) r.push(`/products?p=${res.id}`); else r.refresh() } else { setErrs(res.fields ?? {}); toast(res.error, true) }
  })
  const Err = ({ k }: { k: string }) => (errs[k] ? <div className="errmsg" role="alert">{errs[k]}</div> : null)
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}><h3 style={{ margin: 0 }}>{d.id ? 'Редагування продукту' : 'Новий продукт'}</h3>{d.id && <span className={`chip ${d.archived ? 'c-gray' : 'c-green'}`}>{d.archived ? 'В архіві' : 'Активний'}</span>}</div>
      <div className="g" style={{ gap: 14 }}>
        <div><label className="lbl" htmlFor="pn">Назва *</label><input className={`input${errs.name ? ' err' : ''}`} id="pn" value={d.name} disabled={dis} onChange={(e) => up({ name: e.target.value })} /><Err k="name" /></div>
        <div><label className="lbl" htmlFor="pd">Опис</label><textarea className="input" id="pd" value={d.description} disabled={dis} onChange={(e) => up({ description: e.target.value })} /></div>
        <div className="g" style={{ gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div><label className="lbl" htmlFor="pp">Ціна, ₴/МВт·год *</label><input className={`input num${errs.price ? ' err' : ''}`} id="pp" inputMode="decimal" value={d.price} disabled={dis} onChange={(e) => up({ price: e.target.value })} />
            {errs.price ? <Err k="price" /> : <div className="hint">{price > 0 ? `Це ${n(Math.round(price) / 1000).replace('.', ',')} ₴/кВт·год` : 'Ціна має бути більшою за 0'}</div>}</div>
          <div><label className="lbl" htmlFor="pm">Тарифна модель</label><select className="input" id="pm" value={d.tariffModel} disabled={dis} onChange={(e) => up({ tariffModel: e.target.value })}>{[...new Set([d.tariffModel, ...MODELS])].map((m) => <option key={m}>{m}</option>)}</select></div>
          <div><label className="lbl" htmlFor="pt">Термін дії, міс.</label><input className={`input num${errs.termMonths ? ' err' : ''}`} id="pt" inputMode="numeric" value={d.termMonths} disabled={dis} onChange={(e) => up({ termMonths: e.target.value.replace(/\D/g, '') })} /><Err k="termMonths" /></div>
          <div><label className="lbl" htmlFor="pv">Мінімальний обсяг, МВт·год/рік</label><input className="input num" id="pv" inputMode="numeric" value={d.minVolumeMwh} disabled={dis} onChange={(e) => up({ minVolumeMwh: e.target.value.replace(/\D/g, '') })} /></div>
        </div>
        <div><span className="lbl" id="pg">Для групи споживачів</span>
          <div className="seg" role="radiogroup" aria-labelledby="pg" style={{ background: '#eef1f5', width: 'fit-content' }}>
            {([['A', 'Група А'], ['B', 'Група Б'], ['BOTH', 'Обидві']] as const).map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={d.group === v} disabled={dis} onClick={() => up({ group: v })} style={{ border: 0, cursor: 'pointer', font: '600 13px Inter,system-ui,sans-serif', padding: '8px 16px', borderRadius: 999, background: d.group === v ? '#0f1115' : 'none', color: d.group === v ? '#fff' : '#444b59' }}>{l}</button>)}
          </div></div>
        <div><label className="lbl" htmlFor="ptm">Умови</label><textarea className="input" id="ptm" style={{ height: 72 }} value={d.terms} disabled={dis} onChange={(e) => up({ terms: e.target.value })} /></div>
        <div className="s13" style={{ background: '#eef3fc', borderRadius: 14, padding: '12px 16px' }}>Зміна ціни <b>не змінює</b> суму вже створених угод — ціна фіксується в угоді на момент її створення.</div>
        {canEdit ? (
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            {d.id ? <button className="btn danger" disabled={pending} onClick={() => start(async () => { await setProductArchived(d.id!, !d.archived); r.refresh() })}>{d.archived ? 'Відновити з архіву' : 'Архівувати'}</button> : <span />}
            <div className="row"><Link className="btn line" href={cancelHref}>Скасувати</Link><button className="btn dark" disabled={pending} onClick={save}>{pending ? 'Зберігаємо…' : 'Зберегти'}</button></div>
          </div>
        ) : <div className="muted s12">Редагує лише адміністратор</div>}
      </div>
      {msg && <div className={`toast${msg.bad ? ' bad' : ''}`} role="status">{msg.t}</div>}
    </div>
  )
}
