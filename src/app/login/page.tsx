import { redirect } from 'next/navigation'
import { getUser } from '@/server/auth'
import { Logo } from '@/components/Shell'
import { LoginForm } from './LoginForm'

export const metadata = { title: 'Вхід — EnergyCRM' }

export default async function LoginPage() {
  if (await getUser()) redirect('/dashboard')
  return (
    <div className="app" style={{ minHeight: 900, display: 'flex', flexDirection: 'column' }}>
      <header className="nav"><Logo /><span className="s13 muted">Внутрішня платформа продажу електроенергії</span></header>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 56, flexWrap: 'wrap', padding: '48px 0 0' }}>
        <div style={{ maxWidth: 540, flex: '1 1 380px' }}>
          <h1 style={{ fontSize: 54, lineHeight: 1.05, letterSpacing: '-.035em', margin: '0 0 18px', fontWeight: 700 }}>Усі клієнти й угоди з електроенергії - в одному місці</h1>
          <p style={{ fontSize: 17, lineHeight: 1.5, color: '#2c3a54', margin: '0 0 24px' }}>Воронки продажу, реєстр споживачів, графіки споживання та оплати. Доступ видає адміністратор.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span className="chip c-yellow" style={{ fontSize: 13, padding: '7px 14px' }}>Воронки й етапи</span>
            <span className="chip c-green" style={{ fontSize: 13, padding: '7px 14px' }}>Реєстр споживачів</span>
            <span className="chip c-blue" style={{ fontSize: 13, padding: '7px 14px' }}>Групи А та Б</span>
            <span className="chip c-purple" style={{ fontSize: 13, padding: '7px 14px' }}>Аналітика</span>
          </div>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
