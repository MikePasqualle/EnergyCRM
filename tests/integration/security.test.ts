import { afterAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { canAccessClient, canAccessDeal, clientWhere } from '@/server/access'
import { buildClientWhere } from '@/server/clientQuery'
import { sees_all, USER_PERMS, type SessionUser } from '@/server/permissions'
import { dashboard } from '@/server/analytics'
import { parsePeriod } from '@/server/period'

/** Потрібна заповнена демо-БД: `npm run db:seed` */
const asUser = async (email: string): Promise<SessionUser> => {
  const u = await db.user.findUniqueOrThrow({ where: { email }, include: { role: true } })
  return { id: u.id, name: u.name, email: u.email, isOwner: u.isOwner, mustChangePassword: false, role: { id: u.role.id, name: u.role.name, isAdmin: u.role.isAdmin, seeAllClients: u.role.seeAllClients, permissions: u.role.permissions as never } }
}
afterAll(() => db.$disconnect())

describe('NFR-10: доступ на рівні запису', () => {
  it('менеджер не бачить чужого клієнта навіть за прямим id', async () => {
    const olena = await asUser('olena@energycrm.ua')
    const foreign = await db.client.findFirstOrThrow({ where: { managerId: { not: olena.id } } })
    const own = await db.client.findFirstOrThrow({ where: { managerId: olena.id } })
    expect(await canAccessClient(olena, foreign.id)).toBe(false)
    expect(await canAccessClient(olena, own.id)).toBe(true)
  })
  it('список клієнтів менеджера містить лише його клієнтів, а адмін бачить усіх', async () => {
    const olena = await asUser('olena@energycrm.ua'), admin = await asUser('mp@learntoearn.global')
    expect(await db.client.count({ where: buildClientWhere({}, olena) })).toBe(312)
    expect(await db.client.count({ where: buildClientWhere({ scope: 'team' }, olena) })).toBe(312) // «Команда» недоступна без дозволу ролі
    expect(await db.client.count({ where: buildClientWhere({}, admin) })).toBe(1248)
    expect(await db.client.count({ where: clientWhere(admin, 'mine') })).toBe(0) // «Мої» адміна — у нього клієнтів немає
  })
  it('чужа угода недоступна', async () => {
    const olena = await asUser('olena@energycrm.ua')
    const foreign = await db.deal.findFirstOrThrow({ where: { ownerId: { not: olena.id }, client: { managerId: { not: olena.id } } } })
    expect(await canAccessDeal(olena, foreign.id)).toBe(false)
  })
  it('роль «Користувач» за замовчуванням не бачить весь реєстр', async () => { expect(sees_all(await asUser('denys@energycrm.ua'))).toBe(false); expect(USER_PERMS.users).toBeUndefined() })
})

describe('NFR-5: журнал дій append-only', () => {
  it('UPDATE і DELETE заборонені', async () => {
    const row = await db.auditLog.findFirstOrThrow()
    await expect(db.auditLog.update({ where: { id: row.id }, data: { details: 'x' } })).rejects.toThrow()
    await expect(db.auditLog.delete({ where: { id: row.id } })).rejects.toThrow()
  })
})

describe('Аналітика збігається з макетом (демо-дані)', () => {
  it('листопад 2026: клієнти, угоди, оплати', async () => {
    const per = parsePeriod('month')
    const funnel = await db.funnel.findFirstOrThrow({ orderBy: { position: 'asc' } })
    const d = await dashboard({ mgr: null, funnelId: funnel.id }, per)
    expect(d.clients).toMatchObject({ total: 1248, cold: 612, warm: 301, active: 335 })
    expect(d.work.n).toBe(186)
    expect(Math.round(d.work.amt)).toBe(12_400_000)
    expect(d.pay.n).toBe(74)
    expect(Math.round(d.pay.amt)).toBe(3_820_000)
    expect(d.won).toBe(74); expect(d.lost).toBe(29)
    expect(Math.round(d.cons.total / 1e4) / 100).toBe(2.46)
  })
  it('менеджер бачить аналітику лише по своїх клієнтах', async () => {
    const olena = await asUser('olena@energycrm.ua')
    const d = await dashboard({ mgr: olena.id, funnelId: null }, parsePeriod('month'))
    expect(d.clients.total).toBe(312)
  })
})
