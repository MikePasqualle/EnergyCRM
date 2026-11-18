'use client'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useState, useTransition } from 'react'
import { addDictItem, removeDictItem, saveSetting, saveSupplier, setSupplierArchived } from '@/app/actions/settings'

export function DictChips({ title, kind, items, cls, canEdit, noTitle }: { title?: string; kind: string; items: { id: number; name: string }[]; cls: string; canEdit: boolean; noTitle?: boolean }) {
  const r = useRouter()
  const [adding, setAdding] = useState(false)
  const [v, setV] = useState('')
  const [err, setErr] = useState('')
  const [p, start] = useTransition()
  const add = () => start(async () => { const x = await addDictItem(kind, v); if (x.ok) { setV(''); setAdding(false); setErr(''); r.refresh() } else setErr(x.error) })
  return (
    <div>
      {!noTitle && <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}><h3 style={{ margin: 0 }}>{title}</h3>{canEdit && <button className="s13 b" onClick={() => setAdding(!adding)} style={{ color: '#1a479a', border: 0, background: 'none', cursor: 'pointer' }}>+ Додати</button>}</div>}
      {noTitle && canEdit && <div style={{ textAlign: 'right', marginBottom: 6 }}><button className="s13 b" onClick={() => setAdding(!adding)} style={{ color: '#1a479a', border: 0, background: 'none', cursor: 'pointer' }}>+ Додати</button></div>}
      {adding && <div className="row" style={{ marginBottom: 10 }}><input className="input" style={{ height: 38 }} autoFocus aria-label={`Нове значення: ${title ?? kind}`} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} /><button className="btn dark sm" disabled={p} onClick={add}>Додати</button></div>}
      {err && <div className="errmsg" role="alert" style={{ marginBottom: 8 }}>{err}</div>}
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        {items.map((i) => (
          <span key={i.id} className={`chip ${cls}`} style={{ fontSize: 13, padding: '6px 12px' }}>{i.name}
            {canEdit && <button aria-label={`Видалити ${i.name}`} onClick={() => start(async () => { await removeDictItem(i.id); r.refresh() })} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.6, padding: 0, marginLeft: 2 }}>×</button>}</span>
        ))}
      </div>
    </div>
  )
}

export function SupplierRow({ s, canEdit }: { s: { id: number; name: string; phone: string | null; status: 'ACTIVE' | 'ARCHIVED'; clients: number }; canEdit: boolean }) {
  const r = useRouter()
  const [edit, setEdit] = useState(false)
  const [st, act, pending] = useActionState(saveSupplier.bind(null, s.id), undefined)
  const [p, start] = useTransition()
  useEffect(() => { if (st?.ok) { setEdit(false); r.refresh() } }, [st, r])
  return (
    <>
      <tr style={s.status === 'ARCHIVED' ? { color: '#586072' } : undefined}>
        <td><b>{s.name}</b></td><td className="s13" style={{ whiteSpace: 'nowrap' }}>{s.phone ?? '—'}</td><td className="num" style={{ textAlign: 'right' }}>{s.clients}</td>
        <td><span className={`chip ${s.status === 'ACTIVE' ? 'c-green' : 'c-gray'}`}>{s.status === 'ACTIVE' ? 'Активний' : 'Архів'}</span></td>
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{canEdit && (s.status === 'ACTIVE'
          ? <><button className="s13 b" style={{ color: '#1a479a', border: 0, background: 'none', cursor: 'pointer' }} onClick={() => setEdit(true)}>Редагувати</button> <button className="s13 muted" style={{ border: 0, background: 'none', cursor: 'pointer' }} disabled={p} onClick={() => start(async () => { await setSupplierArchived(s.id, true); r.refresh() })}>В архів</button></>
          : <button className="s13 b" style={{ color: '#1a479a', border: 0, background: 'none', cursor: 'pointer' }} disabled={p} onClick={() => start(async () => { await setSupplierArchived(s.id, false); r.refresh() })}>Відновити</button>)}</td>
      </tr>
      {edit && <tr><td colSpan={5}><SupplierForm action={act} pending={pending} error={st?.error} defaults={{ name: s.name, phone: s.phone ?? '' }} onCancel={() => setEdit(false)} /></td></tr>}
    </>
  )
}
function SupplierForm({ action, pending, error, defaults, onCancel }: { action: (fd: FormData) => void; pending: boolean; error?: string; defaults: { name: string; phone: string }; onCancel: () => void }) {
  return (
    <form action={action} className="row" style={{ gap: 10, flexWrap: 'wrap', padding: '6px 0' }}>
      <input className="input" name="name" aria-label="Назва постачальника" placeholder="Назва *" defaultValue={defaults.name} style={{ width: 240, height: 38 }} required />
      <input className="input" name="phone" aria-label="Контакт" placeholder="Телефон" defaultValue={defaults.phone} style={{ width: 180, height: 38 }} />
      <button className="btn dark sm" disabled={pending}>Зберегти</button><button type="button" className="btn light sm" onClick={onCancel}>Скасувати</button>
      {error && <span className="errmsg" role="alert">{error}</span>}
    </form>
  )
}
export function AddSupplier() {
  const r = useRouter()
  const [open, setOpen] = useState(false)
  const [st, act, pending] = useActionState(saveSupplier.bind(null, null), undefined)
  useEffect(() => { if (st?.ok) { setOpen(false); r.refresh() } }, [st, r])
  return (
    <>
      <button className="btn dark" onClick={() => setOpen(!open)} style={{ padding: '8px 14px', fontSize: 13 }}>+ Додати</button>
      {open && <div style={{ flexBasis: '100%', padding: '0 12px 8px' }}><SupplierForm action={act} pending={pending} error={st?.error} defaults={{ name: '', phone: '' }} onCancel={() => setOpen(false)} /></div>}
    </>
  )
}

export function GeneralSettings({ values, canEdit }: { values: Record<string, string>; canEdit: boolean }) {
  const r = useRouter()
  const [p, start] = useTransition()
  const [saved, setSaved] = useState('')
  const row = (key: string, label: string, opts: [string, string][]) => (
    <div><label className="lbl" htmlFor={`s-${key}`}>{label}</label>
      <select className="input" id={`s-${key}`} defaultValue={values[key]} disabled={!canEdit || p} onChange={(e) => start(async () => { await saveSetting(key, e.target.value); setSaved('Збережено'); setTimeout(() => setSaved(''), 2500); r.refresh() })}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
  )
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}><h3 style={{ margin: 0 }}>Загальні налаштування</h3>{saved && <span className="chip c-green" role="status">{saved}</span>}</div>
      <div className="g resp" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 14 }}>
        {row('currency', 'Валюта', [['UAH', 'Гривня (₴)']])}
        {row('unit', 'Одиниця виміру', [['kWh', 'кВт·год (МВт·год у звітах)']])}
        {row('timezone', 'Часовий пояс', [['Europe/Kyiv', 'Київ (Europe/Kyiv)']])}
      </div>
      <div className="hint">Гривня, кВт·год і часовий пояс Києва застосовуються в усій системі (FR-6.3).</div>
    </div>
  )
}
