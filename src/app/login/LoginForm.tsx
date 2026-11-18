'use client'
import { useActionState, useState } from 'react'
import { loginAction } from '@/app/actions/auth'

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined)
  const [show, setShow] = useState(false)
  const [forgot, setForgot] = useState(false)
  return (
    <form className="card" action={action} style={{ width: 440, maxWidth: '100%', padding: 36 }}>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', marginBottom: 6 }}>Вхід до системи</div>
      <div className="muted s13" style={{ marginBottom: 24 }}>Введіть логін і пароль, які вам видав адміністратор</div>
      {state?.error && <div className="alert bad" role="alert" style={{ marginBottom: 16 }}>{state.error}</div>}
      <label className="lbl" htmlFor="em">Логін (email)</label>
      <input className={`input${state?.error ? ' err' : ''}`} id="em" name="email" type="email" autoComplete="username" required style={{ marginBottom: 16 }} />
      <label className="lbl" htmlFor="pw">Пароль</label>
      <div style={{ position: 'relative' }}>
        <input className={`input${state?.error ? ' err' : ''}`} id="pw" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" required style={{ paddingRight: 90 }} />
        <button type="button" onClick={() => setShow(!show)} className="s12 b" style={{ position: 'absolute', right: 14, top: 12, border: 0, background: 'none', color: '#1a479a', cursor: 'pointer' }}>{show ? 'Сховати' : 'Показати'}</button>
      </div>
      <div className="row" style={{ justifyContent: 'space-between', margin: '16px 0 24px' }}>
        <label className="row s13" style={{ gap: 8, cursor: 'pointer' }}><input type="checkbox" name="remember" defaultChecked style={{ width: 18, height: 18, accentColor: '#0f1115' }} />Запамʼятати мене</label>
        <button type="button" className="s13 b" onClick={() => setForgot(!forgot)} style={{ color: '#1a479a', border: 0, background: 'none', cursor: 'pointer' }}>Забули пароль?</button>
      </div>
      {forgot && <div className="alert warn" style={{ marginBottom: 16 }}>Самостійного відновлення немає. Зверніться до адміністратора — він скине пароль і видасть тимчасовий.</div>}
      <button className="btn dark" type="submit" disabled={pending} style={{ width: '100%', height: 48, fontSize: 15 }}>{pending ? 'Входимо…' : 'Увійти'}</button>
      <div className="sep" style={{ margin: '22px 0 14px' }} />
      <div className="s12 muted" style={{ lineHeight: 1.5 }}>Самостійної реєстрації немає. Новий акаунт створює адміністратор у розділі «Налаштування → Користувачі». Після 5 невдалих спроб вхід тимчасово блокується.</div>
    </form>
  )
}
