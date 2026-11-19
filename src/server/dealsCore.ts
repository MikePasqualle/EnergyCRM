import 'server-only'
import { reval } from './revalidate'
import { db } from '@/lib/db'
import { audit } from './audit'
import { canAccessClient, canAccessDeal } from './access'
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
  reval('/funnels', `/clients/${d.clientId}`)
  return { id: deal.id }
}

export type MoveResult = { ok: true; suggestActive?: number } | { ok: false; error: string }

/** FR-3.2: переміщення картки; кожен перехід — в історію. FR-3.5: «втрачено» потребує причини. Права на «угоди → редагування» перевіряє викликач. */
export async function moveDealCore(u: SessionUser, dealId: number, stageId: number, lostReason?: string): Promise<MoveResult> {
  if (!(await canAccessDeal(u, dealId))) return { ok: false, error: 'Угоду не знайдено' }
  const deal = await db.deal.findUniqueOrThrow({ where: { id: dealId }, include: { stage: true, client: true } })
  const to = await db.stage.findUnique({ where: { id: stageId } })
  if (!to || to.funnelId !== deal.funnelId) return { ok: false, error: 'Етап належить іншій воронці' }
  if (to.id === deal.stageId) return { ok: true }
  if (to.type === 'LOST' && !lostReason?.trim()) return { ok: false, error: 'Вкажіть причину втрати' }
  const closing = to.type !== 'WORKING'
  await db.$transaction(async (tx) => {
    await tx.deal.update({
      where: { id: dealId },
      data: { stageId: to.id, updatedAt: new Date(), closedAt: closing ? new Date() : null, lostReason: to.type === 'LOST' ? lostReason!.trim() : null },
    })
    await tx.dealStageHistory.create({ data: { dealId, fromStage: deal.stage.name, toStage: to.name, userName: u.name } })
    await audit(u, 'Етап угоди', 'Угода', `Угода №${String(deal.number).padStart(4, '0')}`, `${deal.stage.name} → ${to.name}`, tx)
  })
  reval('/funnels', `/deals/${dealId}`, '/dashboard')
  // FR-4.8: після «виграно» пропонуємо статус «Дійсний»
  return { ok: true, suggestActive: to.type === 'WON' && deal.client.status !== 'ACTIVE' ? deal.clientId : undefined }
}
