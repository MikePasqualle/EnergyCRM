import 'server-only'
import { getUser } from '@/server/auth'

/** Користувач із cookie-сесії + перевірка, що POST надіслано з нашого ж сайту (захист від CSRF понад sameSite=lax). */
export async function agentUser(req: Request, write: boolean) {
  if (write) {
    const origin = req.headers.get('origin')
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
    let ok = false
    try { ok = !!origin && !!host && new URL(origin).host === host } catch { ok = false }
    if (!ok) return null
  }
  const u = await getUser()
  if (!u || u.mustChangePassword) return null
  return u
}
export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
