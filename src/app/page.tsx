import { redirect } from 'next/navigation'
import { getUser } from '@/server/auth'

export default async function Home() {
  const u = await getUser()
  redirect(u ? (u.mustChangePassword ? '/change-password' : '/dashboard') : '/login')
}
