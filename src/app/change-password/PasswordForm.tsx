'use client'
import { useActionState } from 'react'
import { changePasswordAction } from '@/app/actions/auth'

export function PasswordForm({ forced }: { forced: boolean }) {
  const [state, action, pending] = useActionState(changePasswordAction, undefined)
  return (
    <form className="card" action={action} style={{ width: 460, maxWidth: '100%', padding: 36 }}>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', marginBottom: 6 }}>{forced ? 'Створіть новий пароль' : 'Зміна пароля'}</div>
      <div className="muted s13" style={{ marginBottom: 22 }}>{forced ? 'Ви увійшли з тимчасовим паролем. Щоб продовжити, задайте власний.' : 'Введіть поточний пароль і новий.'}</div>
      {state?.error && <div className="alert bad" role="alert" style={{ marginBottom: 16 }}>{state.error}</div>}
      <label className="lbl" htmlFor="cur">{forced ? 'Тимчасовий пароль' : 'Поточний пароль'}</label>
      <input className="input" id="cur" name="current" type="password" autoComplete="current-password" required style={{ marginBottom: 16 }} />
      <label className="lbl" htmlFor="nx">Новий пароль</label>
      <input className="input" id="nx" name="next" type="password" autoComplete="new-password" minLength={12} required />
      <div className="hint" style={{ marginBottom: 16 }}>Щонайменше 12 символів, літери й цифри</div>
      <label className="lbl" htmlFor="ag">Повторіть новий пароль</label>
      <input className="input" id="ag" name="again" type="password" autoComplete="new-password" required style={{ marginBottom: 24 }} />
      <button className="btn dark" type="submit" disabled={pending} style={{ width: '100%', height: 48 }}>{pending ? 'Зберігаємо…' : 'Зберегти пароль'}</button>
    </form>
  )
}
