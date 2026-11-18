'use client'
import Link from 'next/link'
import { useActionState } from 'react'
import { createSystem } from '@/app/actions/systems'

export function NewSystemForm({ clientId, types, cancelHref, defaultAddress }: { clientId: number; types: string[]; cancelHref: string; defaultAddress: string }) {
  const [st, act, pending] = useActionState(createSystem.bind(null, clientId), undefined)
  return (
    <form action={act} className="g" style={{ gap: 14 }}>
      {st?.error && <div className="alert bad" role="alert">{st.error}</div>}
      <div><label className="lbl" htmlFor="ns">Назва системи *</label><input className="input" id="ns" name="name" required /></div>
      <div><label className="lbl" htmlFor="nt">Тип обʼєкта</label><select className="input" id="nt" name="objectType">{types.map((t) => <option key={t}>{t}</option>)}</select></div>
      <div><label className="lbl" htmlFor="na">Адреса</label><input className="input" id="na" name="address" defaultValue={defaultAddress} /></div>
      <div className="g" style={{ gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div><label className="lbl" htmlFor="np">Дозволена потужність, кВт</label><input className="input num" id="np" name="powerKw" inputMode="numeric" /></div>
        <div><label className="lbl" htmlFor="ng">Група</label><select className="input" id="ng" name="group"><option value="A">А</option><option value="B">Б</option><option value="UNSET">Не визначено</option></select></div>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}><Link className="btn light" href={cancelHref}>Скасувати</Link><button className="btn dark" disabled={pending}>Створити</button></div>
    </form>
  )
}
