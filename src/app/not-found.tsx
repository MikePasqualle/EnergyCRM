import Link from 'next/link'
import { Logo } from '@/components/Shell'
export default function NotFound() {
  return (
    <div className="app"><header className="nav"><Logo /></header>
      <div className="card" style={{ maxWidth: 520, margin: '80px auto', textAlign: 'center', padding: 40 }}>
        <div className="stat" style={{ fontSize: 56 }}>404</div>
        <h1 style={{ margin: '12px 0 6px' }}>Сторінку не знайдено</h1>
        <p className="muted">Запису не існує або у вас немає до нього доступу.</p>
        <Link className="btn dark" href="/dashboard" style={{ marginTop: 12 }}>На головну</Link>
      </div>
    </div>
  )
}
