import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { normEmail, normPhone } from '@/lib/phone'
import { sees_all, type SessionUser } from './permissions'

export type Dup = { id: number; name: string; phone: string; email: string | null; manager: string; accessible: boolean; by: 'телефоном' | 'email' }
export async function findDuplicates(phone: string, email?: string | null, exceptId?: number, viewer?: SessionUser): Promise<Dup[]> {
  const pn = normPhone(phone), en = normEmail(email)
  const or: Prisma.ClientWhereInput[] = []
  if (pn.length >= 10) or.push({ phoneNorm: pn })
  if (en) or.push({ emailNorm: en })
  if (!or.length) return []
  const rows = await db.client.findMany({ where: { OR: or, ...(exceptId ? { NOT: { id: exceptId } } : {}) }, include: { manager: { select: { name: true } } }, take: 5 })
  return rows.map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, manager: c.manager.name, accessible: !viewer || sees_all(viewer) || c.managerId === viewer.id, by: c.phoneNorm === pn ? 'телефоном' : 'email' }))
}

