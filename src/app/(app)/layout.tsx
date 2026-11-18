import { requireUser } from '@/server/auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser() // не авторизований → /login; з тимчасовим паролем → /change-password
  return children
}
