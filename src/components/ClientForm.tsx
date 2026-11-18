'use client'
import Link from 'next/link'
import { useActionState, useEffect, useState } from 'react'
import { createClient, mergeClient, updateClient, type ClientState } from '@/app/actions/clients'
import { Field } from './ui'

type Opt = { id: number; name: string }
type Init = { type: 'COMPANY' | 'FOP' | 'PERSON'; name: string; edrpou: string; contactPerson: string; phone: string; email: string; city: string; address: string; status: 'COLD' | 'WARM' | 'ACTIVE'; source: string; managerId: number }
const TYPES = [['COMPANY', 'Юридична особа'], ['FOP', 'ФОП'], ['PERSON', 'Фізична особа']] as const
const STS = [['COLD', 'Холодний', '#a9c7f5'], ['WARM', 'Теплий', '#f7c948'], ['ACTIVE', 'Дійсний', '#0f1115']] as const

function Seg<T extends string>({ name, value, onChange, items, label, small, fill }: { name: string; value: T; onChange: (v: T) => void; items: readonly (readonly [T, string, string?])[]; label: string; small?: boolean; fill?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className={`seg${small ? ' sm' : ''}`} style={{ background: '#eef1f5', width: fill ? undefined : 'fit-content' }}>
      <input type="hidden" name={name} value={value} />
      {items.map(([v, l, c]) => {
        const on = v === value
        return <button type="button" role="radio" aria-checked={on} key={v} onClick={() => onChange(v)} style={{ border: 0, cursor: 'pointer', font: '600 13px Inter,system-ui,sans-serif', padding: small ? '8px 10px' : '8px 16px', borderRadius: 999, background: on ? (c ? (v === 'ACTIVE' ? '#0f1115' : c) : '#0f1115') : 'none', color: on ? (c && v !== 'ACTIVE' ? '#10131a' : '#fff') : '#444b59' }}>{l}</button>
      })}
    </div>
  )
}

export function ClientForm({ mode, clientId, init, managers, canPickManager, sources, cities, suppliers, funnels, products, closeHref }: {
  mode: 'create' | 'edit'; clientId?: number; init: Init; managers: Opt[]; canPickManager: boolean; sources: string[]; cities: string[]; suppliers: Opt[]
  funnels: Opt[]; products: (Opt & { price: number })[]; closeHref: string
}) {
  const [type, setType] = useState(init.type)
  const [status, setStatus] = useState(init.status)
  const [group, setGroup] = useState<'A' | 'B' | 'UNSET'>('UNSET')
  const [gen, setGen] = useState(false)
  const [deal, setDeal] = useState(false)
  const [phone, setPhone] = useState(init.phone)
  const [liveDup, setLiveDup] = useState('')
  const action = mode === 'create' ? createClient : updateClient.bind(null, clientId!)
  const [st, act, pending] = useActionState<ClientState, FormData>(action, undefined)
  const [mst, mact] = useActionState<ClientState, FormData>(mergeClient.bind(null, st?.dups?.[0]?.id ?? 0), undefined)
  const [again, setAgain] = useState(false)
  const f = { ...(st?.fields ?? {}), ...(mst?.fields ?? {}) }
  const dups = st?.dups
  const nameLbl = type === 'COMPANY' ? 'Назва компанії *' : type === 'FOP' ? 'Назва ФОП або ПІБ *' : 'ПІБ *'
  const idLbl = type === 'COMPANY' ? 'ЄДРПОУ' : 'РНОКПП'

  useEffect(() => {
    if (mode !== 'create') return
    const t = setTimeout(async () => {
      if (phone.replace(/\D/g, '').length < 10) { setLiveDup(''); return }
      const r = await fetch(`/api/clients/duplicates?phone=${encodeURIComponent(phone)}`)
      if (r.ok) { const d = await r.json(); setLiveDup(d.length ? 'Такий номер уже є в реєстрі' : '') }
    }, 350)
    return () => clearTimeout(t)
  }, [phone, mode])
  useEffect(() => { if (st?.created && st.again) { const el = document.getElementById('client-form') as HTMLFormElement | null; el?.reset(); setPhone(''); setAgain(false) } }, [st])
  useEffect(() => { if (mode === 'edit' && st?.created) window.location.assign(closeHref) }, [st, mode, closeHref])

  return (
    <form action={act} id="client-form">
      {st?.error && !dups && !Object.keys(f).length && <div className="alert bad" role="alert" style={{ marginBottom: 16 }}>{st.error}</div>}
      {st?.created && st.again && <div className="alert ok" role="status" style={{ marginBottom: 16 }}>Клієнта збережено. Можна додати наступного.</div>}
      {dups && dups.length > 0 && (
        <div style={{ background: '#fff6dc', border: '1px solid #f1dc94', borderRadius: 14, padding: '12px 16px', marginBottom: 20 }} className="row s13" role="alert">
          <div style={{ flex: 1 }}><b>Знайдено схожого клієнта за {dups[0].by}:</b> {dups[0].name} · {dups[0].phone}{dups[0].email ? ` · ${dups[0].email}` : ''} <span className="muted">(менеджер: {dups[0].manager})</span></div>
          {dups[0].accessible ? <Link href={`/clients/${dups[0].id}`} className="b" style={{ color: '#1a479a' }}>Відкрити</Link> : <span className="muted">закріплений за іншим менеджером</span>}
          {mode === 'create' && dups[0].accessible && <button formAction={mact} className="b" style={{ color: '#1a479a', background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }}>Обʼєднати</button>}
          <button name="force" value="1" className="b" style={{ color: '#586072', background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }}>Зберегти все одно</button>
        </div>
      )}
      <span className="lbl" id="tp">Тип клієнта *</span>
      <div style={{ marginBottom: 18 }}><Seg name="type" value={type} onChange={setType} items={TYPES} label="Тип клієнта" /></div>
      <div className="g resp" style={{ gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <Field label={nameLbl} htmlFor="name" error={f.name}><input className={`input${f.name ? ' err' : ''}`} id="name" name="name" defaultValue={init.name} required /></Field>
        <Field label={idLbl} htmlFor="edrpou"><input className="input num" id="edrpou" name="edrpou" defaultValue={init.edrpou} inputMode="numeric" /></Field>
        <Field label="Контактна особа" htmlFor="cp"><input className="input" id="cp" name="contactPerson" defaultValue={init.contactPerson} /></Field>
        <Field label="Телефон *" htmlFor="phone" error={f.phone ?? (liveDup || undefined)}><input className={`input num${f.phone || liveDup ? ' err' : ''}`} id="phone" name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+380 XX XXX XX XX" inputMode="tel" required /></Field>
        <Field label="Email" htmlFor="email" error={f.email}><input className={`input${f.email ? ' err' : ''}`} id="email" name="email" type="email" defaultValue={init.email} /></Field>
        <Field label="Місто" htmlFor="city"><input className="input" id="city" name="city" list="cities" defaultValue={init.city} /><datalist id="cities">{cities.map((c) => <option key={c} value={c} />)}</datalist></Field>
        <div style={{ gridColumn: '1/-1' }}><Field label="Адреса" htmlFor="addr"><input className="input" id="addr" name="address" defaultValue={init.address} /></Field></div>
      </div>
      <div className="sep" style={{ margin: '22px 0' }} />
      <div className="g resp" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 16 }}>
        <div><span className="lbl">Статус контакту *</span><Seg name="status" value={status} onChange={setStatus} items={STS} label="Статус контакту" small fill /></div>
        <Field label="Джерело" htmlFor="source"><select className="input" id="source" name="source" defaultValue={init.source}><option value="">—</option>{sources.map((s) => <option key={s}>{s}</option>)}</select></Field>
        {mode === 'create' && <Field label="Закріплений менеджер *" htmlFor="managerId" error={f.managerId}>
          {canPickManager ? <select className="input" id="managerId" name="managerId" defaultValue={init.managerId}>{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            : <><input type="hidden" name="managerId" value={init.managerId} /><div className="input">{managers.find((m) => m.id === init.managerId)?.name}</div></>}
        </Field>}
      </div>
      {mode === 'create' && (<>
        <div className="sep" style={{ margin: '22px 0' }} />
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}><b>Налаштування споживача</b><span className="s12 muted">Можна заповнити пізніше в картці клієнта</span></div>
        <div className="g resp" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 16, alignItems: 'end' }}>
          <div><span className="lbl">Група споживача</span><Seg name="group" value={group} onChange={setGroup} items={[['A', 'А'], ['B', 'Б'], ['UNSET', 'Не визначено']] as const} label="Група споживача" small fill /></div>
          <Field label="Поточний постачальник" htmlFor="sup"><select className="input" id="sup" name="supplierId" defaultValue=""><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <label className="row" style={{ gap: 12, paddingBottom: 10, cursor: 'pointer' }}><input type="checkbox" name="hasGeneration" checked={gen} onChange={(e) => setGen(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#0f1115' }} /><span className="s13 b">Є власна генерація</span></label>
        </div>
        {gen && (
          <div className="g resp" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 16, marginTop: 14 }}>
            <Field label="Тип генерації *" htmlFor="gt" error={f.genType}><select className="input" id="gt" name="genType" defaultValue=""><option value="">—</option>{['Сонячна електростанція (СЕС)', 'Вітрова', 'Когенерація', 'Інше'].map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Встановлена потужність, кВт *" htmlFor="gp" error={f.genPower}><input className="input num" id="gp" name="genPower" inputMode="decimal" /></Field>
            <Field label="Режим *" htmlFor="gm" error={f.genMode}><select className="input" id="gm" name="genMode" defaultValue=""><option value="">—</option><option>Для власного споживання</option><option>З віддачею в мережу</option></select></Field>
          </div>
        )}
        <div className="sep" style={{ margin: '22px 0' }} />
        <label className="row" style={{ gap: 12, cursor: 'pointer' }}><input type="checkbox" name="makeDeal" checked={deal} onChange={(e) => setDeal(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#0f1115' }} /><b>Одразу створити угоду</b></label>
        {deal && (
          <div className="g resp" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 16, marginTop: 12 }}>
            <Field label="Воронка *" htmlFor="fn" error={f.funnelId}><select className="input" id="fn" name="funnelId">{funnels.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
            <Field label="Продукт *" htmlFor="pr" error={f.productId}><select className="input" id="pr" name="productId">{products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
            <Field label="Очікуваний обсяг, МВт·год" htmlFor="vo" error={f.volumeMwh}><input className="input num" id="vo" name="volumeMwh" inputMode="decimal" /></Field>
          </div>
        )}
      </>)}
      <input type="hidden" name="again" value={again ? '1' : ''} />
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 26, flexWrap: 'wrap' }}>
        <Link className="btn line" href={closeHref}>Скасувати</Link>
        {mode === 'create' && <button className="btn light" disabled={pending} onClick={() => setAgain(true)}>Зберегти й додати ще</button>}
        <button className="btn dark" disabled={pending} onClick={() => setAgain(false)}>{pending ? 'Зберігаємо…' : mode === 'create' ? 'Зберегти клієнта' : 'Зберегти зміни'}</button>
      </div>
    </form>
  )
}
