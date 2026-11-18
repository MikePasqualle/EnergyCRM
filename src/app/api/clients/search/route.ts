import { db } from '@/lib/db'
import { getUser } from '@/server/auth'
import { can } from '@/server/permissions'
import { clientWhere } from '@/server/access'

export async function GET(req: Request) {
  const u = await getUser()
  if (!u || u.mustChangePassword || !can(u, 'clients', 'view')) return new Response('Forbidden', { status: 403 })
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  if (q.length < 2) return Response.json([])
  const digits = q.replace(/\D/g, '')
  const rows = await db.client.findMany({
    where: { ...clientWhere(u), OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, ...(digits.length >= 4 ? [{ phoneNorm: { contains: digits } }] : [])] },
    select: { id: true, name: true, city: true, phone: true }, take: 8, orderBy: { name: 'asc' },
  })
  return Response.json(rows)
}
