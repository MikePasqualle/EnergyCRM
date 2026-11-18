import Link from 'next/link'
import { requireCan } from '@/server/auth'
import { Shell } from '@/components/Shell'
import { ClientHeader, STATUS_LONG } from '@/components/ClientHeader'
import { ClientForm } from '@/components/ClientForm'
import { NewDealForm } from '@/components/NewDealForm'
import { CommForm, ChangeManager, DangerZone } from '@/components/ClientParts'
import { Modal, Av, CLIENT_TYPE_FULL } from '@/components/ui'
import { db } from '@/lib/db'
import { loadClient } from '@/server/access'
import { can, sees_all } from '@/server/permissions'
import { dShort, dTime, kyivNow, n, monNom, uah } from '@/lib/format'
import { one, qs, type SP } from '@/lib/url'

export const metadata = { title: 'Картка клієнта — EnergyCRM' }
const IC: Record<string, [string, string, string]> = {
  'Дзвінок': ['#dbe9ff', '#1a479a', '☎'], 'Зустріч': ['#fdefb8', '#6f5200', '⚑'], 'Лист': ['#eadcff', '#51259b', '✉'], 'Месенджер': ['#d7f5e0', '#115c2c', '✆'], 'Нотатка': ['#eceff3', '#36404d', '✎'],
}

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requireCan('clients')
  const id = Number((await params).id), sp = await searchParams
  await loadClient(user, id)
  const c = await db.client.findUniqueOrThrow({
    where: { id },
    include: {
      manager: true, systems: { orderBy: { id: 'asc' } },
      deals: { orderBy: { number: 'asc' }, include: { product: true, funnel: true, stage: true, owner: true, payments: { where: { status: 'PAID' } } } },
      comms: { orderBy: { at: 'desc' }, take: 30 },
    },
  })
  const t = kyivNow()
  const monthStart = `${t.y}-${String(t.m + 1).padStart(2, '0')}-01`
  const cons = await db.consumptionMonthly.aggregate({ where: { system: { clientId: id }, month: new Date(monthStart) }, _sum: { kwh: true, genKwh: true } })
  const consMwh = (Number(cons._sum.kwh ?? 0) + Number(cons._sum.genKwh ?? 0)) / 1000
  const paid = c.deals.flatMap((d) => d.payments).reduce((a, p) => a + Number(p.amount), 0)
  const won = c.deals.filter((d) => d.stage.type === 'WON').length, work = c.deals.filter((d) => d.stage.type === 'WORKING').length
  const gens = c.systems.filter((s) => s.hasGeneration)
  const group = c.systems.find((s) => s.group === 'A')?.group ?? c.systems.find((s) => s.group === 'B')?.group
  const canEdit = can(user, 'clients', 'edit')
  const [managers, sources, cities, suppliers, funnels, products] = await Promise.all([
    sees_all(user) ? db.user.findMany({ where: { status: 'ACTIVE', role: { isAdmin: false } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }) : [],
    db.dictionary.findMany({ where: { kind: 'SOURCE' }, orderBy: { position: 'asc' } }),
    db.client.groupBy({ by: ['city'], where: { city: { not: null } }, _count: { _all: true }, orderBy: { _count: { city: 'desc' } }, take: 40 }),
    db.supplier.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true } }),
    db.funnel.findMany({ where: { status: 'ACTIVE' }, orderBy: { position: 'asc' }, select: { id: true, name: true } }),
    db.product.findMany({ where: { status: 'ACTIVE' }, orderBy: { name: 'asc' } }),
  ])
  const closeHref = qs(sp, { edit: null, newdeal: null }, `/clients/${id}`)
  const stCls = { WON: 'c-green', LOST: 'c-red', WORKING: 'c-blue' } as const

  return (
    <Shell user={user} active="clients">
      <ClientHeader id={id} name={c.name} status={c.status} active="profile"
        chips={<>{group && group !== 'UNSET' && <span className="chip c-purple">Група {group === 'A' ? 'А' : 'Б'}</span>}<span className="chip c-gray">{CLIENT_TYPE_FULL[c.type]}{c.city ? ` · ${c.city}` : ''}</span></>}
        right={<>
          {canEdit && <Link className="btn line" href={`/clients/${id}?edit=1`}>Редагувати</Link>}
          {canEdit && <a className="btn light" href="#comm">Записати спілкування</a>}
          {can(user, 'deals', 'create') && <Link className="btn dark" href={`/clients/${id}?newdeal=1`}>+ Нова угода</Link>}
        </>} />

      <div className="g" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))', marginBottom: 16 }}>
        <div className="card"><div className="muted s13 b">Угод</div><div className="stat num" style={{ margin: '10px 0 6px', fontSize: 40 }}>{c.deals.length}</div><div className="s12 muted">{won} виграно · {work} в роботі</div></div>
        <div className="card"><div className="muted s13 b">Оплачено</div><div className="stat num" style={{ margin: '10px 0 6px', fontSize: 40 }}>{uah(paid)}</div><div className="s12 muted">за всіма угодами</div></div>
        <div className="card"><div className="muted s13 b">Систем (обʼєктів)</div><div className="stat num" style={{ margin: '10px 0 6px', fontSize: 40 }}>{c.systems.length}</div><div className="s12 muted">{gens.length ? `${gens.length} із власною генерацією (${gens[0].genType?.startsWith('Сонячна') ? 'СЕС' : gens[0].genType})` : 'без власної генерації'}</div></div>
        <div className="yel"><div className="s13 b" style={{ color: '#3b2f00' }}>Споживання, 1–{t.d} {['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'][t.m]}</div><div className="stat num" style={{ margin: '10px 0 6px', fontSize: 40 }}>{n(Math.round(consMwh * 10) / 10)}</div><div className="s13 b" style={{ color: '#3b2f00' }}>МВт·год</div></div>
      </div>

      <div className="g" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)' }}>
        <div className="g" style={{ alignContent: 'start' }}>
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}><h3 style={{ margin: '0 0 14px' }}>Дані клієнта</h3>{canEdit && <Link className="s13 b" href={`/clients/${id}?edit=1`} style={{ color: '#1a479a' }}>Редагувати</Link>}</div>
            <div className="g resp" style={{ gridTemplateColumns: '1fr 1fr', gap: '16px 32px' }}>
              <dl className="kv" style={{ margin: 0, gridTemplateColumns: '120px 1fr' }}><dt>Назва</dt><dd>{c.name}</dd><dt>{c.type === 'COMPANY' ? 'ЄДРПОУ' : 'РНОКПП'}</dt><dd className="num">{c.edrpou ?? '—'}</dd><dt>Тип</dt><dd>{CLIENT_TYPE_FULL[c.type]}</dd><dt>Адреса</dt><dd>{c.city ? `${c.city}${c.address ? ', ' + c.address : ''}` : c.address ?? '—'}</dd></dl>
              <dl className="kv" style={{ margin: 0, gridTemplateColumns: '120px 1fr' }}><dt>Контактна особа</dt><dd>{c.contactPerson ?? '—'}</dd><dt>Телефон</dt><dd className="num">{c.phone}</dd><dt>Email</dt><dd>{c.email ?? '—'}</dd><dt>Джерело</dt><dd>{c.source ?? '—'}</dd></dl>
            </div>
            <div className="sep" />
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div className="row" style={{ gap: 10 }}><span className="s13 muted">Закріплений менеджер:</span><Av id={c.managerId} name={c.manager.name} /><b className="s13">{c.manager.name}</b></div>
              {sees_all(user) && canEdit && <ChangeManager clientId={id} current={c.managerId} managers={managers} />}
            </div>
          </div>
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: '0 0 6px' }}>Угоди клієнта</h3>{can(user, 'deals', 'create') && <Link className="btn dark" href={`/clients/${id}?newdeal=1`} style={{ padding: '8px 14px', fontSize: 13 }}>+ Нова угода</Link>}</div>
            <div className="scroll-x"><table className="tbl" style={{ marginTop: 8 }}><thead><tr><th>№</th><th>Продукт</th><th>Воронка → етап</th><th style={{ textAlign: 'right' }}>Сума / міс</th><th>Менеджер</th></tr></thead><tbody>
              {c.deals.map((d) => (
                <tr key={d.id}><td><Link href={`/deals/${d.id}`} className="b" style={{ color: '#1a479a', textDecoration: 'none' }}>{String(d.number).padStart(4, '0')}</Link></td><td>{d.product.name}</td><td className="s13">{d.funnel.name} → <span className={`chip ${stCls[d.stage.type]}`}>{d.stage.name}</span></td><td className="num b" style={{ textAlign: 'right' }}>{uah(Number(d.amount))}</td><td className="s13">{d.owner.name.split(' ')[0]} {d.owner.name.split(' ')[1]?.[0]}.</td></tr>
              ))}
              {!c.deals.length && <tr><td colSpan={5} className="muted">Угод ще немає</td></tr>}
            </tbody></table></div>
            <div className="s12 muted" style={{ marginTop: 12 }}>Один клієнт може вести кілька угод у різних воронках одночасно.</div>
          </div>
        </div>

        <div className="card" style={{ alignSelf: 'start' }}>
          <h3>Спілкування</h3>
          {canEdit ? <CommForm clientId={id} /> : null}
          <div className="sep" />
          {c.comms.map((m) => {
            const [bg, fg, ic] = IC[m.channel] ?? IC['Нотатка']
            return (
              <div className="tl" key={m.id}><div className="dot" style={{ background: bg, color: fg }} aria-hidden="true">{ic}</div>
                <div style={{ flex: 1 }}><div className="row s13" style={{ justifyContent: 'space-between' }}><b>{m.channel}</b><span className="muted">{dTime(m.at)}</span></div><div className="s13" style={{ marginTop: 3 }}>{m.summary}</div><div className="s12 muted" style={{ marginTop: 3 }}>{m.authorName}</div></div></div>
            )
          })}
          {!c.comms.length && <div className="muted s13">Записів ще немає. Додайте перший після розмови з клієнтом.</div>}
        </div>
      </div>

      {one(sp.edit) === '1' && canEdit && (
        <div className="modal-bg" role="dialog" aria-modal="true" aria-label="Редагувати клієнта"><div style={{ width: 860, maxWidth: 'calc(100% - 16px)', background: '#fff', borderRadius: 26, padding: '30px 34px', boxShadow: '0 30px 80px rgba(8,16,40,.35)' }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 20 }}><div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.02em' }}>Редагування клієнта</div><Link href={closeHref} className="btn light" aria-label="Закрити" style={{ width: 40, height: 40, padding: 0, borderRadius: '50%', fontSize: 18 }}>×</Link></div>
          <ClientForm mode="edit" clientId={id} closeHref={closeHref} canPickManager={false} sources={sources.map((x) => x.name)} cities={cities.map((x) => x.city!).filter(Boolean)} suppliers={suppliers} managers={[]} funnels={[]} products={[]}
            init={{ type: c.type, name: c.name, edrpou: c.edrpou ?? '', contactPerson: c.contactPerson ?? '', phone: c.phone, email: c.email ?? '', city: c.city ?? '', address: c.address ?? '', status: c.status, source: c.source ?? '', managerId: c.managerId }} />
          {can(user, 'clients', 'delete') && <DangerZone clientId={id} name={c.name} activeDeals={work} />}
        </div></div>
      )}
      {one(sp.newdeal) === '1' && can(user, 'deals', 'create') && (
        <Modal closeHref={closeHref} title="Нова угода" subtitle={`Для клієнта ${c.name}`}>
          <NewDealForm client={{ id, name: c.name }} funnels={funnels} products={products.map((p) => ({ id: p.id, name: p.name, price: Number(p.price), group: p.group }))} defaultFunnel={funnels[0]?.id ?? 0} closeHref={closeHref} />
        </Modal>
      )}
    </Shell>
  )
}
void dShort; void monNom; void STATUS_LONG
