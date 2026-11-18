import 'server-only'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { audit } from './audit'
import { canAccessClient } from './access'
import { sees_all, type SessionUser } from './permissions'
import { uah } from '@/lib/format'

export type NewDeal = { clientId: number; funnelId: number; productId: number; volumeMwh: number; amount?: number; note?: string; stageId?: number }

/** Створення угоди на першому етапі «в роботі» (FR-3.7, UC-6). Ціна продукту фіксується в угоді (FR-5.3). */
export async function insertDeal(u: SessionUser, d: NewDeal): Promise<{ id: number } | { error: string; field?: string }> {
  if (!(await canAccessClient(u, d.clientId))) return { error: 'Клієнта не знайдено' }
  const [client, funnel, product] = await Promise.all([
    db.client.findUniqueOrThrow({ where: { id: d.clientId } }),
    db.funnel.findUnique({ where: { id: d.funnelId }, include: { stages: { orderBy: { position: 'asc' } } } }),
    db.product.findUnique({ where: { id: d.productId } }),
  ])
  if (!funnel || funnel.status !== 'ACTIVE') return { error: 'Воронка недоступна', field: 'funnelId' }
  if (!product || product.status !== 'ACTIVE') return { error: 'Архівний продукт не пропонується для нових угод', field: 'productId' }
  const stage = (d.stageId && funnel.stages.find((s) => s.id === d.stageId && s.type === 'WORKING')) || funnel.stages.find((s) => s.type === 'WORKING')
  if (!stage) return { error: 'У воронці немає етапів «в роботі»' }
  const price = Number(product.price)
  const amount = d.amount ?? Math.round((d.volumeMwh * price) / 12)
  const ownerId = sees_all(u) ? client.managerId : u.id
  const deal = await db.$transaction(async (tx) => {
    const x = await tx.deal.create({ data: { clientId: d.clientId, funnelId: funnel.id, stageId: stage.id, productId: product.id, priceSnapshot: price, volumeMwh: d.volumeMwh, amount, ownerId, note: d.note ?? '' } })
    await tx.dealStageHistory.create({ data: { dealId: x.id, fromStage: null, toStage: stage.name, userName: u.name } })
    await audit(u, 'Угода', 'Угода', `Угода №${String(x.number).padStart(4, '0')}`, `Створено: ${client.name} · ${product.name} · ${uah(amount)}/міс`, tx)
    return x
  })
  revalidatePath('/funnels'); revalidatePath(`/clients/${d.clientId}`)
  return { id: deal.id }
}
