import { getUser } from '@/server/auth'
import { can } from '@/server/permissions'
import { findDuplicates } from '@/server/dupes'

export async function GET(req: Request) {
  const u = await getUser()
  if (!u || u.mustChangePassword || !can(u, 'clients', 'create')) return new Response('Forbidden', { status: 403 })
  const sp = new URL(req.url).searchParams
  const d = await findDuplicates(sp.get('phone') ?? '', sp.get('email'), undefined, u)
  return Response.json(d.map((x) => ({ id: x.id, by: x.by })))
}
