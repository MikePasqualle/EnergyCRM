'use server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { logout } from '@/server/auth'
import { getUser } from '@/server/auth'
import { sees_all } from '@/server/permissions'

export async function setScope(scope: 'mine' | 'team') {
  const u = await getUser()
  if (!u) return
  const v = scope === 'team' && sees_all(u) ? 'team' : 'mine'
  ;(await cookies()).set('scope', v, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
}

export async function signOut() {
  await logout()
  redirect('/login')
}
