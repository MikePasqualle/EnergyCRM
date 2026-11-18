'use client'
import Link from 'next/link'
import { useActionState } from 'react'

export function NewFunnelForm({ action }: { action: (s: unknown, fd: FormData) => Promise<{ error?: string }> }) {
  const [st, act, pending] = useActionState(action, undefined)
  return (
    <form action={act} className="g" style={{ gap: 14 }}>
      {st?.error && <div className="alert bad" role="alert">{st.error}</div>}
      <div><label className="lbl" htmlFor="nf">Назва воронки *</label><input className="input" id="nf" name="name" required /></div>
      <div><label className="lbl" htmlFor="nd">Опис</label><input className="input" id="nd" name="description" /></div>
      <div className="row" style={{ justifyContent: 'flex-end' }}><Link className="btn light" href="/funnels/settings">Скасувати</Link><button className="btn dark" disabled={pending}>Створити</button></div>
    </form>
  )
}
