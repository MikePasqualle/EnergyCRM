import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireCan } from '@/server/auth'
import { Shell } from '@/components/Shell'
import { db } from '@/lib/db'
import { can, sees_all } from '@/server/permissions'
import { dealWhere } from '@/server/access'
import { DealActions, PaymentButton, PayStatus } from '@/components/DealActions'
import { Av, CLIENT_TYPE_FULL, shortName } from '@/components/ui'
import { dLong, dShort, dShortY, dTime, initials, avCls, n, uah } from '@/lib/format'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) { return { title: `Угода — EnergyCRM` } }

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCan('deals')
  const id = Number((await params).id)
  if (!Number.isInteger(id)) notFound()
  const deal = await db.deal.findFirst({
    where: { id, ...dealWhere(user) },
    include: { client: { include: { systems: { select: { group: true }, take: 1 }, deals: { include: { product: true }, orderBy: { number: 'asc' } } } }, funnel: { include: { stages: { orderBy: { position: 'asc' } } } }, stage: true, product: true, owner: true, history: { orderBy: { at: 'desc' } }, payments: { orderBy: { date: 'asc' } } },
  })
  if (!deal) notFound()
  const reasons = await db.dictionary.findMany({ where: { kind: 'LOSS_REASON' }, orderBy: { position: 'asc' } })
  const owners = sees_all(user) ? await db.user.findMany({ where: { status: 'ACTIVE', role: { isAdmin: false } }, orderBy: { name: 'asc' } }) : []
  const no = String(deal.number).padStart(4, '0')
  const g = deal.client.systems[0]?.group
  const stages = deal.funnel.stages
  const flow = stages.filter((s) => s.type !== 'LOST')
  const curPos = deal.stage.position
  const enteredAt = (name: string) => deal.history.filter((h) => h.toStage === name).map((h) => h.at).sort((a, b) => a.getTime() - b.getTime())[0]
  const paid = deal.payments.filter((p) => p.status === 'PAID').reduce((a, p) => a + Number(p.amount), 0)
  const others = deal.client.deals.filter((d) => d.id !== deal.id)
  const won = deal.stage.type === 'WON', lost = deal.stage.type === 'LOST'
  const chip = won ? <span className="chip c-green">Виграно · {deal.stage.name}</span> : lost ? <span className="chip c-red">Втрачено{deal.lostReason ? ` · ${deal.lostReason}` : ''}</span> : <span className="chip c-blue">В роботі · {deal.stage.name}</span>
  const canEdit = can(user, 'deals', 'edit')

  return (
    <Shell user={user} active="funnels">
      <div className="head">
        <div>
          <div className="s13 sub"><Link href="/funnels" style={{ textDecoration: 'none' }}>Воронки</Link> / <Link href={`/funnels?f=${deal.funnelId}`} style={{ textDecoration: 'none' }}>{deal.funnel.name}</Link> / Угода №{no}</div>
          <h1 className="title" style={{ marginTop: 8 }}>{deal.client.name} — {deal.product.name}</h1>
          <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>{chip}{g && g !== 'UNSET' && <span className="chip c-purple">Група {g === 'A' ? 'А' : 'Б'}</span>}<span className="chip c-gray">Створено {dShortY(deal.createdAt).replace(/ (\S+) /, ' $1. ')}</span></div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <DealActions dealId={deal.id} stages={stages.map((s) => ({ id: s.id, name: s.name, type: s.type }))} currentStage={deal.stageId} reasons={reasons.map((r) => r.name)}
            canEdit={canEdit} canDelete={can(user, 'deals', 'delete')} isAdmin={sees_all(user)} owners={owners.map((o) => ({ id: o.id, name: o.name }))}
            deal={{ volume: Number(deal.volumeMwh), amount: Number(deal.amount), note: deal.note, ownerId: deal.ownerId }} clientId={deal.clientId} clientActive={deal.client.status === 'ACTIVE'} />
        </div>
      </div>

      <div className="card scroll-x" style={{ marginBottom: 16, padding: '22px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', minWidth: 640 }}>
          {flow.map((s, i) => {
            const reached = lost ? !!enteredAt(s.name) : s.position <= curPos
            const last = won && s.id === deal.stageId
            const dt = enteredAt(s.name)
            return (
              <div key={s.id} style={{ display: 'contents' }}>
                {i > 0 && <i style={{ flex: 1, height: 3, background: reached ? (won && s.position === curPos ? '#4cbf78' : '#0f1115') : '#dfe4ec', margin: '0 14px', borderRadius: 2 }} />}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
                  <div className="dot" style={{ background: last ? '#4cbf78' : reached ? '#0f1115' : '#eceff3', color: reached ? '#fff' : '#586072' }}>{reached ? '✓' : i + 1}</div>
                  <div><div className="b s13">{s.name}</div><div className="s12 muted">{dt && reached ? `${dShort(dt)}${last ? ' · виграно' : ''}` : '—'}</div></div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="g" style={{ gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1fr)' }}>
        <div className="g">
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}><h3 style={{ margin: '0 0 14px' }}>Дані угоди</h3><span className="s12 muted">Ціна зафіксована на момент створення</span></div>
            <div className="g" style={{ gridTemplateColumns: '1fr 1fr', gap: '18px 32px' }}>
              <dl className="kv" style={{ margin: 0 }}>
                <dt>Клієнт</dt><dd><Link href={`/clients/${deal.clientId}`} style={{ color: '#1a479a' }}>{deal.client.name}</Link></dd>
                <dt>Воронка</dt><dd>{deal.funnel.name}</dd>
                <dt>Етап</dt><dd>{deal.stage.name}{won ? ' (виграно)' : lost ? ' (втрачено)' : ''}</dd>
                <dt>Відповідальний</dt><dd><span className="row" style={{ gap: 8 }}><Av id={deal.owner.id} name={deal.owner.name} size={26} />{deal.owner.name}</span></dd>
                <dt>Створено</dt><dd>{dLong(deal.createdAt)}</dd>
              </dl>
              <dl className="kv" style={{ margin: 0 }}>
                <dt>Продукт</dt><dd>{deal.product.name}</dd>
                <dt>Ціна продукту</dt><dd className="num">{n(Number(deal.priceSnapshot))} ₴ / МВт·год</dd>
                <dt>Очікуваний обсяг</dt><dd className="num">{n(Number(deal.volumeMwh))} МВт·год на рік</dd>
                <dt>Сума угоди</dt><dd className="num">{uah(Number(deal.amount))} / міс</dd>
                <dt>Закрито</dt><dd>{deal.closedAt ? dLong(deal.closedAt) : '—'}</dd>
              </dl>
            </div>
            <div className="sep" />
            <div className="lbl">Нотатка до угоди</div>
            <div className="input area" style={{ height: 'auto', minHeight: 62 }}>{deal.note || <span className="muted">Нотаток немає</span>}</div>
          </div>
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: '0 0 6px' }}>Оплати за угодою</h3>{canEdit && <PaymentButton dealId={deal.id} suggested={Number(deal.amount)} />}</div>
            <table className="tbl" style={{ marginTop: 8 }}><thead><tr><th>Дата</th><th>Призначення</th><th style={{ textAlign: 'right' }}>Сума</th><th>Статус</th></tr></thead><tbody>
              {deal.payments.map((p) => <tr key={p.id}><td>{dShortY(p.date)}</td><td>{p.purpose}</td><td className="num b" style={{ textAlign: 'right' }}>{uah(Number(p.amount))}</td><td><PayStatus id={p.id} status={p.status} canEdit={canEdit} /></td></tr>)}
              {!deal.payments.length && <tr><td colSpan={4} className="muted">Оплат ще немає</td></tr>}
            </tbody></table>
            <div className="row s13" style={{ justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid #e7eaf0' }}><span className="muted">Отримано за угодою</span><b className="num">{uah(paid)}</b></div>
          </div>
        </div>

        <div className="g" style={{ alignContent: 'start' }}>
          <div className="card">
            <h3>Історія етапів</h3>
            {deal.history.map((h) => (
              <div className="tl" key={h.id}>
                {h.fromStage ? <div className="dot" style={{ background: won && h.toStage === deal.stage.name ? '#d7f5e0' : '#e9f1fd', color: won && h.toStage === deal.stage.name ? '#115c2c' : '#1a479a' }}>→</div> : <div className="dot" style={{ background: '#eceff3', color: '#36404d' }}>+</div>}
                <div><div className="b s13">{h.fromStage ? `${h.fromStage} → ${h.toStage}` : 'Угоду створено'}</div><div className="s12 muted">{dTime(h.at)} · {h.fromStage ? h.userName : shortName(h.userName)}</div></div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: '0 0 14px' }}>Клієнт</h3><Link className="s13 b" href={`/clients/${deal.clientId}`} style={{ color: '#1a479a' }}>Відкрити →</Link></div>
            <div className="row" style={{ gap: 12 }}><div className={`avatar ${avCls(deal.clientId)}`} style={{ width: 46, height: 46, fontSize: 15 }}>{initials(deal.client.name)}</div><div><div className="b">{deal.client.name}</div><div className="s12 muted">{CLIENT_TYPE_FULL[deal.client.type]}{deal.client.city ? ` · ${deal.client.city}` : ''}</div></div></div>
            <div className="sep" />
            <dl className="kv" style={{ gridTemplateColumns: '100px 1fr', margin: 0 }}>
              <dt>Контакт</dt><dd>{deal.client.contactPerson ?? '—'}</dd><dt>Телефон</dt><dd className="num">{deal.client.phone}</dd><dt>Email</dt><dd>{deal.client.email ?? '—'}</dd>
              <dt>Інші угоди</dt><dd>{others.length ? others.map((o) => <div key={o.id}><Link href={`/deals/${o.id}`} style={{ color: '#1a479a' }}>{String(o.number).padStart(4, '0')}</Link> · {o.product.name}</div>) : '—'}</dd>
            </dl>
          </div>
        </div>
      </div>
    </Shell>
  )
}
