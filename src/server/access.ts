import 'server-only'
import { notFound } from 'next/navigation'
import type { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { sees_all, type SessionUser } from './permissions'
import type { Scope } from './scope'

/** Умова на Client для списків: «Мої» або (для тих, кому дозволено) уся команда. NFR-10 — перевіряється на кожному запиті. */
export function clientWhere(u: SessionUser, scope: Scope = 'team'): Prisma.ClientWhereInput {
  return sees_all(u) && scope === 'team' ? {} : { managerId: u.id }
}
export function dealWhere(u: SessionUser, scope: Scope = 'team'): Prisma.DealWhereInput {
  return sees_all(u) && scope === 'team' ? {} : { OR: [{ ownerId: u.id }, { client: { managerId: u.id } }] }
}
/** Жорстка перевірка доступу до запису за id: чужий клієнт навіть за прямим посиланням → 404 */
export async function loadClient<T extends Prisma.ClientInclude | undefined = undefined>(u: SessionUser, id: number, include?: T) {
  if (!Number.isInteger(id)) notFound()
  const c = await db.client.findFirst({ where: { id, ...(sees_all(u) ? {} : { managerId: u.id }) }, include })
  if (!c) notFound()
  return c
}
export async function canAccessClient(u: SessionUser, clientId: number) {
  return !!(await db.client.findFirst({ where: { id: clientId, ...(sees_all(u) ? {} : { managerId: u.id }) }, select: { id: true } }))
}
export async function canAccessDeal(u: SessionUser, dealId: number) {
  return !!(await db.deal.findFirst({ where: { id: dealId, ...dealWhere(u) }, select: { id: true } }))
}
