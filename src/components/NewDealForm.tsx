'use client'
import Link from 'next/link'
import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createDeal } from '@/app/actions/deals'
import { ClientPicker } from './ClientPicker'
import { Field } from './ui'

type Opt = { id: number; name: string; price: number; group: string }
export function NewDealForm({ funnels, products, defaultFunnel, stageId, client, closeHref }: {
  funnels: { id: number; name: string }[]; products: Opt[]; defaultFunnel: number; stageId?: number; client?: { id: number; name: string } | null; closeHref: string
}) {
  const r = useRouter()
  const [st, action, pending] = useActionState(createDeal, undefined)
  const [prod, setProd] = useState(products[0]?.id ?? 0)
  const [vol, setVol] = useState('')
  const [amount, setAmount] = useState('')
  const [manual, setManual] = useState(false)
  const price = products.find((p) => p.id === prod)?.price ?? 0
  useEffect(() => { if (st?.created) r.push(`/deals/${st.created}`) }, [st, r])
  useEffect(() => { if (!manual) { const v = Number(vol.replace(',', '.')); setAmount(v > 0 ? String(Math.round((v * price) / 12)) : '') } }, [vol, price, manual])
  const f = st?.fields ?? {}
  return (
    <form action={action} className="g" style={{ gap: 14 }}>
      {st?.error && !Object.keys(f).length && <div className="alert bad" role="alert">{st.error}</div>}
      {stageId && <input type="hidden" name="stageId" value={stageId} />}
      <Field label="Клієнт *" htmlFor="clientId-q" error={f.clientId}>
        <ClientPicker initial={client} error={f.clientId} />
        {!client && <div className="hint">Немає в списку? <Link href="/clients?new=1" style={{ color: '#1a479a', fontWeight: 600 }}>Створити нового клієнта</Link></div>}
      </Field>
      <div className="g" style={{ gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Воронка *" htmlFor="funnelId" error={f.funnelId}>
          <select className="input" id="funnelId" name="funnelId" defaultValue={defaultFunnel}>{funnels.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        </Field>
        <Field label="Продукт *" htmlFor="productId" error={f.productId}>
          <select className="input" id="productId" name="productId" value={prod} onChange={(e) => setProd(Number(e.target.value))}>{products.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.price.toLocaleString('uk-UA')} ₴/МВт·год</option>)}</select>
        </Field>
        <Field label="Очікуваний обсяг, МВт·год на рік *" htmlFor="volumeMwh" error={f.volumeMwh}>
          <input className={`input${f.volumeMwh ? ' err' : ''}`} id="volumeMwh" name="volumeMwh" inputMode="decimal" value={vol} onChange={(e) => setVol(e.target.value)} placeholder="напр. 600" />
        </Field>
        <Field label="Сума угоди, ₴ / міс" htmlFor="amount" hint={manual ? 'Змінено вручну' : 'Обсяг × ціна ÷ 12 — можна змінити'} error={f.amount}>
          <input className="input" id="amount" name="amount" inputMode="decimal" value={amount} onChange={(e) => { setManual(true); setAmount(e.target.value) }} />
        </Field>
      </div>
      <Field label="Нотатка" htmlFor="note"><textarea className="input" id="note" name="note" style={{ height: 72 }} /></Field>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Link className="btn light" href={closeHref}>Скасувати</Link>
        <button className="btn dark" type="submit" disabled={pending}>{pending ? 'Створюємо…' : 'Створити угоду'}</button>
      </div>
    </form>
  )
}
