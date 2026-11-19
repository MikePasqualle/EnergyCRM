import Link from 'next/link'
import { can, sees_all, type SessionUser } from '@/server/permissions'
import { getScope } from '@/server/scope'
import { IDLE_MIN } from '@/server/auth'
import { avCls, initials } from '@/lib/format'
import { ScopeToggle } from './ScopeToggle'
import { IdleGuard } from './IdleGuard'
import { AgentPanel } from './AgentPanel'
import { signOut } from '@/app/actions/session'

export type Tab = 'analytics' | 'funnels' | 'clients' | 'products' | 'settings'

export function Logo() {
  return (
    <div className="brand">
      <div className="logo"><svg width="20" height="20" viewBox="0 0 24 24" fill="#0f1115" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></svg></div>
      EnergyCRM
    </div>
  )
}

export async function Shell({ user, active, children }: { user: SessionUser; active: Tab; children: React.ReactNode }) {
  const scope = await getScope(user)
  const tabs: { k: Tab; href: string; label: string; show: boolean }[] = [
    { k: 'analytics', href: '/dashboard', label: 'Аналітика', show: can(user, 'analytics', 'view') },
    { k: 'funnels', href: '/funnels', label: 'Воронки', show: can(user, 'funnels', 'view') },
    { k: 'clients', href: '/clients', label: 'Клієнти', show: can(user, 'clients', 'view') },
    { k: 'products', href: '/products', label: 'Продукти', show: can(user, 'products', 'view') },
    { k: 'settings', href: '/settings/users', label: 'Налаштування', show: can(user, 'users', 'view') || can(user, 'audit', 'view') },
  ]
  return (
    <div className="app">
      <header className="nav">
        <Logo />
        <nav className="tabs" aria-label="Основне меню">
          {tabs.filter((t) => t.show).map((t) => (
            <Link key={t.k} href={t.href} className={active === t.k ? 'on' : ''} aria-current={active === t.k ? 'page' : undefined}>{t.label}</Link>
          ))}
        </nav>
        <div className="navr">
          <ScopeToggle scope={scope} canTeam={sees_all(user)} />
          <details className="menu">
            <summary className="icobtn" aria-label="Сповіщення">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0" /></svg>
            </summary>
            <div className="pop" style={{ padding: 18, minWidth: 260 }}>
              <div className="b s13" style={{ marginBottom: 6 }}>Сповіщення</div>
              <div className="muted s13">Нових сповіщень немає.</div>
            </div>
          </details>
          <details className="menu">
            <summary aria-label="Меню користувача"><div className={`avatar ${avCls(user.id)}`}>{initials(user.name)}</div></summary>
            <div className="pop">
              <div style={{ padding: '8px 12px' }}><div className="b s13">{user.name}</div><div className="s12 muted">{user.email} · {user.role.name}</div></div>
              <div className="sep" style={{ margin: '6px 0' }} />
              <Link href="/change-password?voluntary=1">Змінити пароль</Link>
              <form action={signOut}><button type="submit">Вийти</button></form>
            </div>
          </details>
        </div>
      </header>
      {children}
      <IdleGuard idleMin={IDLE_MIN} />
      <AgentPanel userName={user.name} role={user.role.name} />
    </div>
  )
}
