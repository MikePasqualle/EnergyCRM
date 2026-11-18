import Link from 'next/link'
import type { Prisma } from '@/generated/prisma/client'
import { requireCan } from '@/server/auth'
import { Shell } from '@/components/Shell'
import { SelectPill } from '@/components/SelectPill'
import { Board, type BCol } from '@/components/Board'
import { Modal } from '@/components/ui'
import { NewDealForm } from '@/components/NewDealForm'
import { db } from '@/lib/db'
import { can, sees_all } from '@/server/permissions'
import { dealWhere } from '@/server/access'
import { getScope } from '@/server/scope'
import { dShort, mln, n } from '@/lib/format'
import { one, qs, type SP } from '@/lib/url'

export const metadata = { title: 'Воронки — EnergyCRM' }

export default async function Funnels({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireCan('funnels')
  const sp = await searchParams
  const scope = await getScope(user)
  const funnels = await db.funnel.findMany({ where: { status: 'ACTIVE' }, orderBy: { position: 'asc' } })
  const funnel = funnels.find((f) => f.id === Number(one(sp.f))) ?? funnels[0]
  if (!funnel) return <Shell user={user} active="funnels"><div className="card"><div className="empty"><b>Воронок ще немає</b>Адмін створює їх у «Налаштуваннях воронок».</div></div></Shell>

  const lim = Math.min(Number(one(sp.lim)) || 30, 500)
  const q = (one(sp.q) ?? '').trim(), m = Number(one(sp.m)) || null, pr = Number(one(sp.pr)) || null, g = one(sp.g)
  const and: Prisma.DealWhereInput[] = [{ funnelId: funnel.id }, dealWhere(user, scope)]
  if (q) and.push({ client: { name: { contains: q, mode: 'insensitive' } } })
  if (m) and.push({ ownerId: m })
  if (pr) and.push({ productId: pr })
  if (g === 'A' || g === 'B') and.push({ client: { systems: { some: { group: g } } } })
  const where: Prisma.DealWhereInput = { AND: and }
  const stages = await db.stage.findMany({ where: { funnelId: funnel.id }, orderBy: { position: 'asc' } })
  const [products, managers, reasons, aggs] = await Promise.all([
    db.product.findMany({ where: { status: 'ACTIVE' }, orderBy: { name: 'asc' } }),
    sees_all(user) ? db.user.findMany({ where: { status: 'ACTIVE', role: { isAdmin: false } }, orderBy: { name: 'asc' } }) : Promise.resolve([]),
    db.dictionary.findMany({ where: { kind: 'LOSS_REASON' }, orderBy: { position: 'asc' } }),
    db.deal.groupBy({ by: ['stageId'], where, _count: { _all: true }, _sum: { amount: true } }),
  ])
  const cols: BCol[] = await Promise.all(stages.map(async (s) => {
    const deals = await db.deal.findMany({
      where: { AND: [where, { stageId: s.id }] }, orderBy: { updatedAt: 'desc' }, take: lim,
      include: { client: { select: { id: true, name: true, lastContactAt: true, systems: { select: { group: true }, take: 1 } } }, owner: { select: { id: true, name: true } }, product: { select: { name: true } }, payments: { where: { status: 'PAID' }, select: { id: true }, take: 1 } },
    })
    const a = aggs.find((x) => x.stageId === s.id)
    return {
      id: s.id, name: s.name, type: s.type, color: s.color, count: a?._count._all ?? 0, sum: Number(a?._sum.amount ?? 0),
      cards: deals.map((d) => ({
        id: d.id, number: d.number, client: d.client.name, clientId: d.client.id, product: d.note === 'Аванс' ? `${d.product.name} · аванс` : d.product.name, group: (d.client.systems[0]?.group ?? 'UNSET') as 'A' | 'B' | 'UNSET',
        amount: Number(d.amount), vol: Number(d.volumeMwh), ownerId: d.owner.id, ownerName: d.owner.name,
        tag: s.type === 'WON' ? (d.payments.length ? 'Оплачено' : 'Очікує оплати') : dShort(d.updatedAt), tagCls: s.type === 'WON' ? (d.payments.length ? 'c-green' : 'c-yellow') : '',
        lostReason: d.lostReason, note: d.note,
      })),
    }
  }))
  const working = cols.filter((c) => c.type === 'WORKING')
  const wCount = working.reduce((a, c) => a + c.count, 0), wSum = working.reduce((a, c) => a + c.sum, 0)
  const base = (patch: Record<string, string | null>) => qs(sp, patch, '/funnels')
  const closeHref = base({ new: null, stage: null })
  const showNew = one(sp.new) === '1' && can(user, 'deals', 'create')
  const canMove = can(user, 'deals', 'edit')

  return (
    <Shell user={user} active="funnels">
      <div className="head">
        <div><h1 className="title">Воронки продажу</h1><div className="sub">{n(wCount)} угод у роботі · {mln(wSum)} · перетягуйте картки між етапами</div></div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {can(user, 'funnels', 'edit') && <Link className="btn line" href={`/funnels/settings?f=${funnel.id}`}>Налаштувати воронку</Link>}
          {can(user, 'deals', 'create') && <Link className="btn dark" href={base({ new: '1' })}>+ Нова угода</Link>}
        </div>
      </div>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="subtabs">{funnels.map((f) => <Link key={f.id} className={f.id === funnel.id ? 'on' : ''} href={`/funnels?f=${f.id}`}>{f.name}</Link>)}</div>
        <form action="/funnels" style={{ display: 'contents' }}>
          <input type="hidden" name="f" value={funnel.id} />
          <input className="input" name="q" defaultValue={q} placeholder="Пошук за клієнтом…" aria-label="Пошук за клієнтом" style={{ width: 230, background: '#fff' }} />
        </form>
        {sees_all(user) && <SelectPill name="m" label="Менеджер" value={m ? String(m) : ''} options={[{ value: '', label: 'Усі' }, ...managers.map((x) => ({ value: String(x.id), label: x.name }))]} />}
        <SelectPill name="pr" label="Продукт" value={pr ? String(pr) : ''} options={[{ value: '', label: 'Усі' }, ...products.map((x) => ({ value: String(x.id), label: x.name }))]} />
        <SelectPill name="g" label="Група" width={150} value={g === 'A' || g === 'B' ? g : ''} options={[{ value: '', label: 'А і Б' }, { value: 'A', label: 'А' }, { value: 'B', label: 'Б' }]} />
      </div>
      <Board key={JSON.stringify([funnel.id, q, m, pr, g, lim])} cols={cols} reasons={reasons.map((r) => r.name)} canMove={canMove} canCreate={can(user, 'deals', 'create')} funnelId={funnel.id} more={base({ lim: String(lim + 30) })} />
      {showNew && (
        <Modal closeHref={closeHref} title="Нова угода" subtitle="Угода створюється на першому етапі обраної воронки">
          <NewDealForm funnels={funnels.map((f) => ({ id: f.id, name: f.name }))} products={products.map((p) => ({ id: p.id, name: p.name, price: Number(p.price), group: p.group }))} defaultFunnel={funnel.id} stageId={Number(one(sp.stage)) || undefined} closeHref={closeHref} />
        </Modal>
      )}
    </Shell>
  )
}
