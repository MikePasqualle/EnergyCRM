'use client'
import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addCommunication, anonymizeClient, changeManager, deleteClient } from '@/app/actions/clients'

const CH: [string, string][] = [['Дзвінок', 'Дзвінок'], ['Лист', 'Лист'], ['Зустріч', 'Зустріч'], ['Месенджер', 'Месенджер'], ['Нотатка', 'Нотатка']]

export function CommForm({ clientId }: { clientId: number }) {
  const [ch, setCh] = useState('Дзвінок')
  const ref = useRef<HTMLFormElement>(null)
  const r = useRouter()
  const [st, act, pending] = useActionState(addCommunication.bind(null, clientId), undefined)
  useEffect(() => { if (st?.ok) { ref.current?.reset(); r.refresh() } }, [st, r])
  return (
    <form ref={ref} action={act} id="comm">
      <input type="hidden" name="channel" value={ch} />
      <label className="lbl" htmlFor="csum" style={{ position: 'absolute', left: -9999 }}>Що обговорили з клієнтом?</label>
      <textarea className="input" id="csum" name="summary" placeholder="Що обговорили з клієнтом?" style={{ height: 96 }} />
      {st?.error && <div className="errmsg" role="alert">{st.error}</div>}
      <div className="row" style={{ justifyContent: 'space-between', margin: '12px 0 6px', flexWrap: 'wrap' }}>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }} role="radiogroup" aria-label="Канал">
          {CH.map(([v, l]) => <button type="button" role="radio" aria-checked={ch === v} key={v} className="chip c-gray" onClick={() => setCh(v)} style={ch === v ? { background: '#0f1115', color: '#fff' } : undefined}>{l}</button>)}
        </div>
        <button className="btn dark" disabled={pending} style={{ padding: '8px 16px', fontSize: 13 }}>{pending ? '…' : 'Додати'}</button>
      </div>
    </form>
  )
}

export function ChangeManager({ clientId, current, managers }: { clientId: number; current: number; managers: { id: number; name: string }[] }) {
  const r = useRouter()
  const [open, setOpen] = useState(false)
  const [m, setM] = useState(String(current))
  const [err, setErr] = useState('')
  const [p, start] = useTransition()
  return (
    <>
      <button className="btn light" onClick={() => setOpen(true)} style={{ padding: '7px 14px', fontSize: 13 }}>Змінити менеджера</button>
      {open && (
        <div className="modal-bg" role="dialog" aria-modal="true" aria-label="Змінити менеджера"><div className="modal narrow" style={{ marginTop: 100 }}>
          <h2>Змінити менеджера</h2><div className="muted s13" style={{ margin: '4px 0 16px' }}>Клієнт і його активні угоди перейдуть до нового менеджера; зміна збережеться в історії.</div>
          <label className="lbl" htmlFor="cm">Новий менеджер</label>
          <select className="input" id="cm" value={m} onChange={(e) => setM(e.target.value)}>{managers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          {err && <div className="errmsg">{err}</div>}
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 20 }}><button className="btn light" onClick={() => setOpen(false)}>Скасувати</button>
            <button className="btn dark" disabled={p || Number(m) === current} onClick={() => start(async () => { const x = await changeManager(clientId, Number(m)); if (x.ok) { setOpen(false); r.refresh() } else setErr(x.error) })}>Зберегти</button></div>
        </div></div>
      )}
    </>
  )
}

export function DangerZone({ clientId, name, activeDeals }: { clientId: number; name: string; activeDeals: number }) {
  const r = useRouter()
  const [mode, setMode] = useState<'del' | 'anon' | null>(null)
  const [conf, setConf] = useState(false)
  const [err, setErr] = useState('')
  const [p, start] = useTransition()
  return (
    <>
      <div className="sep" style={{ margin: '22px 0 14px' }} />
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span className="s12 muted">Персональні дані за запитом клієнта (NFR-4)</span>
        <div className="row"><button type="button" className="btn line" onClick={() => setMode('anon')}>Анонімізувати</button><button type="button" className="btn danger" onClick={() => setMode('del')}>Видалити клієнта</button></div>
      </div>
      {mode && (
        <div className="modal-bg" role="alertdialog" aria-modal="true" style={{ zIndex: 60 }}><div className="modal narrow" style={{ marginTop: 100 }}>
          <h2>{mode === 'del' ? 'Видалити клієнта?' : 'Анонімізувати клієнта?'}</h2>
          <p className="s13 muted" style={{ margin: '8px 0 14px' }}>{mode === 'del' ? `«${name}» буде видалено разом з угодами й оплатами. Дію не можна скасувати.` : `Імʼя, контакти, адреса й тексти спілкування будуть знеособлені. Суми угод і споживання залишаться для аналітики. Дію не можна скасувати.`}</p>
          {mode === 'del' && activeDeals > 0 && <label className="row s13" style={{ gap: 10, marginBottom: 12 }}><input type="checkbox" checked={conf} onChange={(e) => setConf(e.target.checked)} style={{ width: 18, height: 18 }} />У клієнта {activeDeals} активних угод — підтверджую видалення разом із ними</label>}
          {err && <div className="alert bad" role="alert">{err}</div>}
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}><button className="btn light" onClick={() => { setMode(null); setErr('') }}>Скасувати</button>
            <button className="btn danger" disabled={p || (mode === 'del' && activeDeals > 0 && !conf)} onClick={() => start(async () => {
              const x = mode === 'del' ? await deleteClient(clientId, conf) : await anonymizeClient(clientId)
              if (x.ok) { if (mode === 'del') r.push('/clients'); else { setMode(null); r.refresh() } } else setErr(x.error)
            })}>{mode === 'del' ? 'Видалити назавжди' : 'Анонімізувати'}</button></div>
        </div></div>
      )}
    </>
  )
}
