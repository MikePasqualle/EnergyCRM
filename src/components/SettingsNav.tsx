import Link from 'next/link'
import { can, type SessionUser } from '@/server/permissions'

export function SettingsNav({ active, user }: { active: 'users' | 'dict' | 'audit' | 'funnels'; user: SessionUser }) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <nav className="sidebar" aria-label="Розділи налаштувань">
        {can(user, 'users', 'view') && <Link className={active === 'users' ? 'on' : ''} href="/settings/users">Користувачі та ролі</Link>}
        {can(user, 'users', 'view') && <Link className={active === 'dict' ? 'on' : ''} href="/settings/dictionaries">Довідники</Link>}
        {can(user, 'audit', 'view') && <Link className={active === 'audit' ? 'on' : ''} href="/settings/dictionaries#audit">Журнал дій</Link>}
        {can(user, 'funnels', 'edit') && <Link href="/funnels/settings">Воронки й етапи</Link>}
      </nav>
    </div>
  )
}
