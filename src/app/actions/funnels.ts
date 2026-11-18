'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { assertCan, getUser } from '@/server/auth'
import { audit } from '@/server/audit'

async function admin(action: 'create' | 'edit' | 'delete') {
  const u = await getUser()
  if (!u || u.mustChangePassword) throw new Error('Потрібен вхід')
  assertCan(u, 'funnels', action)
  return u
}

export async function createFunnel(_: unknown, fd: FormData): Promise<{ error?: string }> {
  const u = await admin('create')
  const name = String(fd.get('name') ?? '').trim()
  const description = String(fd.get('description') ?? '').trim()
  if (!name) return { error: 'Вкажіть назву воронки' }
  if (await db.funnel.findUnique({ where: { name } })) return { error: 'Воронка з такою назвою вже є' }
  const pos = (await db.funnel.aggregate({ _max: { position: true } }))._max.position ?? 0
  const f = await db.funnel.create({
    data: { name, description, position: pos + 1, stages: { create: [
      { name: 'Новий контакт', type: 'WORKING', color: '#a9c7f5', position: 1 }, { name: 'Оплата', type: 'WON', color: '#4cbf78', position: 2 }, { name: 'Втрачено', type: 'LOST', color: '#e8837a', position: 3 },
    ] } },
  })
  await audit(u, 'Воронка', 'Воронка', name, 'Створено')
  revalidatePath('/funnels')
  redirect(`/funnels/settings?f=${f.id}`)
}

const saveSchema = z.object({
  name: z.string().trim().min(1, 'Вкажіть назву воронки').max(80),
  description: z.string().max(300),
  active: z.boolean(),
  stages: z.array(z.object({ id: z.number().int().nullable(), name: z.string().trim().min(1, 'Назва етапу не може бути порожньою').max(60), type: z.enum(['WORKING', 'WON', 'LOST']), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) })).min(2),
  /** угоди з видалених етапів → куди перенести (id існуючого етапу) */
  moves: z.record(z.string(), z.number().int()),
})
export type SaveFunnel = z.infer<typeof saveSchema>

/** FR-3.3/3.4/3.5: збереження воронки й етапів в одній транзакції; етап з угодами видаляється лише після перенесення */
export async function saveFunnel(funnelId: number, input: SaveFunnel): Promise<{ ok: true } | { ok: false; error: string }> {
  const u = await admin('edit')
  const p = saveSchema.safeParse(input)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const d = p.data
  if (!d.stages.some((s) => s.type === 'WORKING')) return { ok: false, error: 'Потрібен хоча б один етап «в роботі»' }
  if (!d.stages.some((s) => s.type === 'WON')) return { ok: false, error: 'Потрібен етап «виграно»' }
  if (!d.stages.some((s) => s.type === 'LOST')) return { ok: false, error: 'Потрібен етап «втрачено»' }
  const funnel = await db.funnel.findUnique({ where: { id: funnelId }, include: { stages: true } })
  if (!funnel) return { ok: false, error: 'Воронку не знайдено' }
  const clash = await db.funnel.findFirst({ where: { name: d.name, NOT: { id: funnelId } } })
  if (clash) return { ok: false, error: 'Воронка з такою назвою вже є' }
  const keepIds = new Set(d.stages.filter((s) => s.id).map((s) => s.id!))
  const removed = funnel.stages.filter((s) => !keepIds.has(s.id))
  for (const s of removed) {
    const cnt = await db.deal.count({ where: { stageId: s.id } })
    if (cnt > 0) {
      const to = d.moves[String(s.id)]
      if (!to || !keepIds.has(to)) return { ok: false, error: `Етап «${s.name}» містить угоди (${cnt}). Оберіть, куди їх перенести.` }
    }
  }
  try {
    await db.$transaction(async (tx) => {
      await tx.funnel.update({ where: { id: funnelId }, data: { name: d.name, description: d.description, status: d.active ? 'ACTIVE' : 'ARCHIVED' } })
      // тимчасові позиції, щоб не зачепити унікальність/порядок
      for (const s of removed) {
        const to = d.moves[String(s.id)]
        if (to) {
          const target = d.stages.find((x) => x.id === to)!
          const deals = await tx.deal.findMany({ where: { stageId: s.id }, select: { id: true } })
          await tx.deal.updateMany({ where: { stageId: s.id }, data: { stageId: to, updatedAt: new Date(), closedAt: target.type === 'WORKING' ? null : new Date(), lostReason: target.type === 'LOST' ? 'Етап видалено' : null } })
          await tx.dealStageHistory.createMany({ data: deals.map((x) => ({ dealId: x.id, fromStage: s.name, toStage: target.name, userName: u.name })) })
        }
        await tx.stage.delete({ where: { id: s.id } })
      }
      for (let i = 0; i < d.stages.length; i++) {
        const s = d.stages[i]
        if (s.id) await tx.stage.update({ where: { id: s.id }, data: { name: s.name, type: s.type, color: s.color, position: i + 1 } })
        else await tx.stage.create({ data: { funnelId, name: s.name, type: s.type, color: s.color, position: i + 1 } })
      }
      await audit(u, 'Воронка', 'Воронка', d.name, `Збережено: ${d.stages.length} етапів${removed.length ? `, видалено ${removed.length}` : ''}${d.active ? '' : ', в архів'}`, tx)
    })
  } catch (e) {
    return { ok: false, error: 'Не вдалося зберегти воронку' }
  }
  revalidatePath('/funnels'); revalidatePath('/funnels/settings'); revalidatePath('/dashboard')
  return { ok: true }
}
