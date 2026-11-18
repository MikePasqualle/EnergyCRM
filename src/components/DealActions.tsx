'use client'
import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addPayment, deleteDeal, markClientActive, moveDeal, setPaymentStatus, updateDeal } from '@/app/actions/deals'
import { Field } from './ui'

type Stage = { id: number; name: string; type: string }
const Dlg = ({ title, sub, onClose, children, narrow }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; narrow?: boolean }) => (
  <div className="modal-bg" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
    <div className={`modal${narrow ? ' narrow' : ''}`} style={{ marginTop: 40 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div><h2>{title}</h2>{sub && <div className="muted s13" style={{ marginTop: 4 }}>{sub}</div>}</div>
        <button className="btn light" onClick={onClose} aria-label="Закрити" style={{ padding: '6px 12px' }}>×</button>
      </div>
      {children}
    </div>
  </div>
)

export function DealActions({ dealId, stages, currentStage, reasons, canEdit, canDelete, isAdmin, owners, deal, clientId, clientActive }: {
  dealId: number; stages: Stage[]; currentStage: number; reasons: string[]; canEdit: boolean; canDelete: boolean; isAdmin: boolean
  owners: { id: number; name: string }[]; deal: { volume: number; amount: number; note: string; ownerId: number }; clientId: number; clientActive: boolean
}) {
  const r = useRouter()
  const [dlg, setDlg] = useState<'edit' | 'lost' | 'confirm-del' | null>(null)
  const [reason, setReason] = useState(reasons[0] ?? '')
  const [err, setErr] = useState('')
  const [suggest, setSuggest] = useState(false)
  const [pending, start] = useTransition()
  const [st, action, saving] = useActionState(async (_: unknown, fd: FormData) => {
    const res = await updateDeal(dealId, {
      volumeMwh: Number(String(fd.get('volume')).replace(',', '.')), amount: Number(String(fd.get('amount')).replace(/\s/g, '').replace(',', '.')),
      note: String(fd.get('note') ?? ''), ...(isAdmin ? { ownerId: Number(fd.get('ownerId')) } : {}),
    })
    return res
  }, undefined)
  useEffect(() => { if (st?.ok) { setDlg(null); r.refresh() } }, [st, r])

  const move = (to: number, lr?: string) => start(async () => {
    const res = await moveDeal(dealId, to, lr)
    if (!res.ok) { setErr(res.error); return }
    setErr(''); setDlg(null)
    if (res.suggestActive && !clientActive) setSuggest(true)
    r.refresh()
  })
  if (!canEdit) return null
  const lostStage = stages.find((s) => s.type === 'LOST')
  return (
    <>
      <label className="input" style={{ width: 210, background: '#fff', cursor: 'pointer', position: 'relative' }}>
        <span>Перенести на етап</span><span aria-hidden="true">▾</span>
        <select aria-label="Перенести на етап" value="" disabled={pending} style={{ position: 'absolute', inset: 0, width: '100%', opacity: 0, cursor: 'pointer' }}
          onChange={(e) => { const to = Number(e.target.value); const s = stages.find((x) => x.id === to); if (s?.type === 'LOST') setDlg('lost'); else if (to) move(to) }}>
          <option value="">Перенести на етап</option>
          {stages.filter((s) => s.id !== currentStage).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <button className="btn line" onClick={() => setDlg('edit')}>Редагувати</button>
      {lostStage && lostStage.id !== currentStage && <button className="btn danger" onClick={() => setDlg('lost')}>Позначити втраченою</button>}
      {err && <div className="alert bad" role="alert" style={{ flexBasis: '100%' }}>{err}</div>}
      {suggest && (
        <div className="toast" role="status">Угоду виграно. Позначити клієнта «Дійсний»?
          <button className="btn" style={{ marginLeft: 12, background: '#f7c948', padding: '6px 12px' }} onClick={async () => { await markClientActive(clientId); setSuggest(false); r.refresh() }}>Так</button>
          <button className="btn" style={{ marginLeft: 6, background: '#2a2f3a', color: '#fff', padding: '6px 12px' }} onClick={() => setSuggest(false)}>Ні</button>
        </div>
      )}
      {dlg === 'lost' && lostStage && (
        <Dlg title="Позначити втраченою" sub="Причина втрати обовʼязкова" onClose={() => setDlg(null)} narrow>
          <Field label="Причина втрати *" htmlFor="lr"><select className="input" id="lr" value={reason} onChange={(e) => setReason(e.target.value)}>{reasons.map((x) => <option key={x}>{x}</option>)}</select></Field>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 20 }}><button className="btn light" onClick={() => setDlg(null)}>Скасувати</button><button className="btn danger" disabled={pending} onClick={() => move(lostStage.id, reason)}>Позначити втраченою</button></div>
        </Dlg>
      )}
      {dlg === 'edit' && (
        <Dlg title="Редагування угоди" sub="Ціна продукту зафіксована в угоді й не змінюється" onClose={() => setDlg(null)}>
          <form action={action} className="g" style={{ gap: 14 }}>
            {st && !st.ok && <div className="alert bad" role="alert">{st.error}</div>}
            <div className="g" style={{ gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Очікуваний обсяг, МВт·год/рік" htmlFor="volume"><input className="input" id="volume" name="volume" defaultValue={deal.volume} inputMode="decimal" /></Field>
              <Field label="Сума, ₴ / міс" htmlFor="amount"><input className="input" id="amount" name="amount" defaultValue={deal.amount} inputMode="decimal" /></Field>
            </div>
            {isAdmin && <Field label="Відповідальний" htmlFor="ownerId"><select className="input" id="ownerId" name="ownerId" defaultValue={deal.ownerId}>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>}
            <Field label="Нотатка до угоди" htmlFor="note"><textarea className="input" id="note" name="note" defaultValue={deal.note} /></Field>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              {canDelete ? <button type="button" className="btn danger" onClick={() => setDlg('confirm-del')}>Видалити угоду</button> : <span />}
              <div className="row"><button type="button" className="btn light" onClick={() => setDlg(null)}>Скасувати</button><button className="btn dark" disabled={saving}>{saving ? 'Зберігаємо…' : 'Зберегти'}</button></div>
            </div>
          </form>
        </Dlg>
      )}
      {dlg === 'confirm-del' && (
        <Dlg title="Видалити угоду?" sub="Разом з оплатами та історією етапів. Дію не можна скасувати." onClose={() => setDlg(null)} narrow>
          <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn light" onClick={() => setDlg(null)}>Скасувати</button>
            <button className="btn danger" onClick={() => start(async () => { const x = await deleteDeal(dealId); if (x.ok) r.push('/funnels') })}>Видалити назавжди</button></div>
        </Dlg>
      )}
    </>
  )
}

export function PaymentButton({ dealId, suggested }: { dealId: number; suggested: number }) {
  const r = useRouter()
  const [open, setOpen] = useState(false)
  const [st, action, pending] = useActionState(addPayment.bind(null, dealId), undefined)
  useEffect(() => { if (st?.ok) { setOpen(false); r.refresh() } }, [st, r])
  const f = st?.fields ?? {}
  return (
    <>
      <button className="btn dark" onClick={() => setOpen(true)} style={{ padding: '9px 16px' }}>+ Додати оплату</button>
      {open && (
        <Dlg title="Додати оплату" sub="Оплати вносяться вручну: аванс або рахунок" onClose={() => setOpen(false)} narrow>
          <form action={action} className="g" style={{ gap: 14 }}>
            {st?.error && !Object.keys(f).length && <div className="alert bad" role="alert">{st.error}</div>}
            <Field label="Дата *" htmlFor="pd" error={f.date}><input className="input" id="pd" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
            <Field label="Призначення *" htmlFor="pp" error={f.purpose}><input className="input" id="pp" name="purpose" list="purposes" defaultValue="Рахунок за місяць" /><datalist id="purposes"><option value="Аванс" /><option value="Рахунок за місяць" /></datalist></Field>
            <Field label="Сума, ₴ *" htmlFor="pa" error={f.amount}><input className="input" id="pa" name="amount" inputMode="decimal" defaultValue={suggested} /></Field>
            <Field label="Статус" htmlFor="ps"><select className="input" id="ps" name="status" defaultValue="PAID"><option value="PAID">Оплачено</option><option value="PENDING">Очікується</option></select></Field>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn light" onClick={() => setOpen(false)}>Скасувати</button><button className="btn dark" disabled={pending}>Додати</button></div>
          </form>
        </Dlg>
      )}
    </>
  )
}

export function PayStatus({ id, status, canEdit }: { id: number; status: 'PAID' | 'PENDING'; canEdit: boolean }) {
  const r = useRouter()
  const [p, start] = useTransition()
  const cls = status === 'PAID' ? 'c-green' : 'c-yellow'
  const label = status === 'PAID' ? 'Оплачено' : 'Очікується'
  if (!canEdit) return <span className={`chip ${cls}`}>{label}</span>
  return <button className={`chip ${cls}`} disabled={p} title="Натисніть, щоб змінити статус" onClick={() => start(async () => { await setPaymentStatus(id, status === 'PAID' ? 'PENDING' : 'PAID'); r.refresh() })}>{label}</button>
}
