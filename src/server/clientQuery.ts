import type { Prisma } from '@/generated/prisma/client'
import { clientWhere } from './access'
import type { SessionUser } from './permissions'
import type { Scope } from './scope'

export type ClientFilter = { st?: string; q?: string; m?: string; g?: string; s?: string; gen?: string; c?: string; scope?: Scope }

/** FR-4.1 / FR-7.3: єдина збірка умов реєстру (таблиця, збережені фільтри, масові дії) */
export function buildClientWhere(f: ClientFilter, u: SessionUser): Prisma.ClientWhereInput {
  const and: Prisma.ClientWhereInput[] = [clientWhere(u, f.scope ?? 'team')]
  if (f.st === 'COLD' || f.st === 'WARM' || f.st === 'ACTIVE') and.push({ status: f.st })
  const q = f.q?.trim()
  if (q) {
    const digits = q.replace(/\D/g, '')
    and.push({ OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { contactPerson: { contains: q, mode: 'insensitive' } }, ...(digits.length >= 3 ? [{ phoneNorm: { contains: digits } }] : [])] })
  }
  if (f.m && Number(f.m)) and.push({ managerId: Number(f.m) })
  if (f.g === 'A' || f.g === 'B') and.push({ systems: { some: { group: f.g } } })
  if (f.s && Number(f.s)) and.push({ systems: { some: { shares: { some: { supplierId: Number(f.s) } } } } })
  if (f.gen === '1') and.push({ systems: { some: { hasGeneration: true } } })
  if (f.gen === '0') and.push({ systems: { none: { hasGeneration: true } } })
  if (f.c) and.push({ city: f.c })
  return { AND: and }
}
