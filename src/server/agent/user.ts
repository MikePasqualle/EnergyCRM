import 'server-only'
import { db } from '@/lib/db'
import type { Perms, SessionUser } from '@/server/permissions'

/** Користувач CRM за id — для Telegram-бота, де немає cookie-сесії. Заблокований користувач не отримує нічого. */
export async function loadSessionUser(userId: number): Promise<SessionUser | null> {
  const u = await db.user.findFirst({ where: { id: userId, status: 'ACTIVE' }, include: { role: true } })
  if (!u) return null
  return {
    id: u.id, name: u.name, email: u.email, isOwner: u.isOwner, mustChangePassword: u.mustChangePassword,
    role: { id: u.role.id, name: u.role.name, isAdmin: u.role.isAdmin, seeAllClients: u.role.seeAllClients, permissions: u.role.permissions as Perms },
  }
}
