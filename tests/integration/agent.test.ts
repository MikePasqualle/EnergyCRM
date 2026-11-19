import { afterAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import type { SessionUser } from '@/server/permissions'
import { confirmAction, runTool } from '@/server/agent/tools'
import { seal, unseal } from '@/server/agent/secretbox'
import { toTelegramHtml } from '@/server/agent/telegram'

/** Потрібна заповнена демо-БД: `npm run db:seed` */
const asUser = async (email: string): Promise<SessionUser> => {
  const u = await db.user.findUniqueOrThrow({ where: { email }, include: { role: true } })
  return { id: u.id, name: u.name, email: u.email, isOwner: u.isOwner, mustChangePassword: false, role: { id: u.role.id, name: u.role.name, isAdmin: u.role.isAdmin, seeAllClients: u.role.seeAllClients, permissions: u.role.permissions as never } }
}
const thread = async (userId: number) => (await db.agentThread.create({ data: { userId, channel: 'web' } })).id
const created: number[] = []
afterAll(async () => {
  if (created.length) await db.client.deleteMany({ where: { id: { in: created } } })
  await db.agentThread.deleteMany({ where: { messages: { none: {} }, actions: { none: {} } } })
  await db.$disconnect()
})

describe('AI-агент: права й режими', () => {
  it('у режимі «Чат» зміни не готуються', async () => {
    const admin = await asUser('mp@learntoearn.global')
    const r = await runTool({ u: admin, mode: 'chat', threadId: await thread(admin.id) }, 'create_client', { type: 'COMPANY', name: 'X', phone: '0631234567' })
    expect(r.isError).toBe(true)
    expect(r.text).toContain('chat_mode')
  })

  it('менеджер не бачить чужого клієнта через агента, а пошук обмежений його клієнтами', async () => {
    const olena = await asUser('olena@energycrm.ua')
    const foreign = await db.client.findFirstOrThrow({ where: { managerId: { not: olena.id } } })
    const ctx = { u: olena, mode: 'chat' as const, threadId: await thread(olena.id) }
    const g = await runTool(ctx, 'get_client', { client_id: foreign.id })
    expect(g.isError).toBe(true)
    const s = JSON.parse((await runTool(ctx, 'search_clients', { limit: 25 })).text)
    expect(s.total).toBe(await db.client.count({ where: { managerId: olena.id } }))
    expect((await runTool(ctx, 'get_managers_report', {})).isError).toBe(true)
  })
})

describe('AI-агент: зміна даних лише після підтвердження', () => {
  it('бракує менеджера → запит; повні дані → картка; створення лише після підтвердження; чужий не підтвердить', async () => {
    const admin = await asUser('mp@learntoearn.global'), olena = await asUser('olena@energycrm.ua')
    const ctx = { u: admin, mode: 'actions' as const, threadId: await thread(admin.id) }
    const name = `ТОВ «Агент-тест ${Date.now()}»`
    const base = { type: 'COMPANY', name, phone: '+380 63 000 11 22', city: 'Харків' }

    const need = JSON.parse((await runTool(ctx, 'create_client', base)).text)
    expect(need.status).toBe('needs_input')
    expect(need.missing.join()).toContain('manager_id')

    const ready = await runTool(ctx, 'create_client', { ...base, manager_id: olena.id })
    expect(ready.pending).toBeTruthy()
    expect(await db.client.count({ where: { name } })).toBe(0) // нічого не створено до підтвердження

    expect((await confirmAction(olena, ready.pending!.id, true)).ok).toBe(false) // чужа дія
    expect(await db.client.count({ where: { name } })).toBe(0)

    const done = await confirmAction(admin, ready.pending!.id, true)
    expect(done.ok).toBe(true)
    const c = await db.client.findFirstOrThrow({ where: { name } })
    created.push(c.id)
    expect(c.managerId).toBe(olena.id)
    expect((await confirmAction(admin, ready.pending!.id, true)).ok).toBe(false) // повторно не виконується

    const dup = JSON.parse((await runTool(ctx, 'create_client', { ...base, manager_id: olena.id })).text)
    expect(dup.status).toBe('duplicate_found')
  })

  it('скасування нічого не змінює', async () => {
    const admin = await asUser('mp@learntoearn.global')
    const ctx = { u: admin, mode: 'actions' as const, threadId: await thread(admin.id) }
    const name = `ТОВ «Скасовано ${Date.now()}»`
    const r = await runTool(ctx, 'create_client', { type: 'COMPANY', name, phone: '+380 50 777 66 55', manager_id: admin.id })
    const out = await confirmAction(admin, r.pending!.id, false)
    expect(out.ok).toBe(true)
    expect(await db.client.count({ where: { name } })).toBe(0)
  })
})

describe('AI-агент: службове', () => {
  it('шифрування секретів', () => {
    expect(unseal(seal('123:abc'))).toBe('123:abc')
    process.env.APP_SECRET = 'test-secret'
    const s = seal('123:abc')
    expect(s.startsWith('v1:')).toBe(true)
    expect(s).not.toContain('123:abc')
    expect(unseal(s)).toBe('123:abc')
    process.env.APP_SECRET = 'other'
    expect(unseal(s)).toBeNull()
    delete process.env.APP_SECRET
  })
  it('markdown → HTML для Telegram: екранування, жирний, таблиця', () => {
    const h = toTelegramHtml('**Разом** <b>x</b>\n\n| A | B |\n|---|---|\n| 1 | 2 |')
    expect(h).toContain('<b>Разом</b>')
    expect(h).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(h).toContain('<pre>A · B\n1 · 2</pre>')
  })
})
