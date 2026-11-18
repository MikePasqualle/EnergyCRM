import { redirect } from 'next/navigation'
import { getUser } from '@/server/auth'
import { Logo } from '@/components/Shell'
import { PasswordForm } from './PasswordForm'

export const metadata = { title: 'Зміна пароля — EnergyCRM' }

export default async function Page({ searchParams }: { searchParams: Promise<{ voluntary?: string }> }) {
  const u = await getUser()
  if (!u) redirect('/login')
  const { voluntary } = await searchParams
  return (
    <div className="app" style={{ minHeight: 900 }}>
      <header className="nav"><Logo /><span className="s13 muted">{u.name}</span></header>
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <PasswordForm forced={u.mustChangePassword && !voluntary} />
      </div>
    </div>
  )
}
