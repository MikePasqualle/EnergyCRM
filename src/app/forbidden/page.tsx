import Link from 'next/link'
import { Logo } from '@/components/Shell'
export default function Forbidden() {
  return (
    <div className="app"><header className="nav"><Logo /></header>
      <div className="card" style={{ maxWidth: 520, margin: '80px auto', textAlign: 'center', padding: 40 }}>
        <div className="stat" style={{ fontSize: 56 }}>403</div>
        <h1 style={{ margin: '12px 0 6px' }}>Недостатньо прав</h1>
        <p className="muted">Для цього розділу потрібна інша роль. Зверніться до адміністратора.</p>
        <Link className="btn dark" href="/dashboard" style={{ marginTop: 12 }}>На головну</Link>
      </div>
    </div>
  )
}
