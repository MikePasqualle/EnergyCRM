'use client'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { saveFilter } from '@/app/actions/clients'

export function SaveFilterButton({ params }: { params: Record<string, string> }) {
  const r = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [p, start] = useTransition()
  return (
    <>
      <button className="s12 b" onClick={() => setOpen(true)} style={{ color: '#1a479a', background: 'none', border: 0, cursor: 'pointer' }}>+ Зберегти поточний</button>
      {open && (
        <div className="modal-bg" role="dialog" aria-modal="true" aria-label="Зберегти фільтр">
          <div className="modal narrow" style={{ marginTop: 100 }}>
            <h2>Зберегти фільтр</h2><div className="muted s13" style={{ margin: '4px 0 16px' }}>Для швидкого доступу з реєстру клієнтів</div>
            <label className="lbl" htmlFor="sf">Назва *</label><input className="input" id="sf" value={name} onChange={(e) => setName(e.target.value)} placeholder="напр. Теплі з Києва" autoFocus />
            {err && <div className="errmsg">{err}</div>}
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 20 }}><button className="btn light" onClick={() => setOpen(false)}>Скасувати</button>
              <button className="btn dark" disabled={p} onClick={() => start(async () => { const x = await saveFilter(name, params); if (x.ok) { setOpen(false); setName(''); r.refresh() } else setErr(x.error ?? '') })}>Зберегти</button></div>
          </div>
        </div>
      )}
    </>
  )
}
