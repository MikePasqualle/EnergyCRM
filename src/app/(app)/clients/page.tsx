import Link from 'next/link'
import { requireCan } from '@/server/auth'
import { Shell } from '@/components/Shell'
import { SelectPill } from '@/components/SelectPill'
import { RegistryTable } from '@/components/RegistryTable'
import { Modal } from '@/components/ui'
import { ClientForm } from '@/components/ClientForm'
import { SaveFilterButton } from '@/components/SaveFilter'
import { db } from '@/lib/db'
import { can, sees_all } from '@/server/permissions'
import { getScope } from '@/server/scope'
import { buildClientWhere, type ClientFilter } from '@/server/clientQuery'
import { CLIENT_INCLUDE, toRow } from '@/server/clientView'
import { deleteFilter } from '@/app/actions/clients'
import { n } from '@/lib/format'
import { one, qs, type SP } from '@/lib/url'

export const metadata = { title: 'Клієнти — EnergyCRM' }
const PAGE = 10

export default async function Clients({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireCan('clients')
  const sp = await searchParams
  const scope = await getScope(user)
  const f: ClientFilter = { st: one(sp.st), q: one(sp.q), m: one(sp.m), g: one(sp.g), s: one(sp.s), gen: one(sp.gen), c: one(sp.c), scope }
  const page = Math.max(1, Number(one(sp.page)) || 1)
  const sort = one(sp.sort) ?? 'id'
  const orderBy = sort === 'name' ? { name: 'asc' as const } : sort === '-name' ? { name: 'desc' as const } : sort === 'last' ? { lastContactAt: 'asc' as const } : sort === '-last' ? { lastContactAt: { sort: 'desc' as const, nulls: 'last' as const } } : { id: 'asc' as const }
  const where = buildClientWhere(f, user)
  const whereNoStatus = buildClientWhere({ ...f, st: undefined }, user)

  const [rows, total, counts, managers, suppliers, cities, saved, sources, funnels, products, newCtx] = await Promise.all([
    db.client.findMany({ where, orderBy, skip: (page - 1) * PAGE, take: PAGE, include: CLIENT_INCLUDE }),
    db.client.count({ where }),
    db.client.groupBy({ by: ['status'], where: whereNoStatus, _count: { _all: true } }),
    sees_all(user) ? db.user.findMany({ where: { status: 'ACTIVE', role: { isAdmin: false } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }) : Promise.resolve([]),
    db.supplier.findMany({ where: { status: 'ACTIVE' }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.client.groupBy({ by: ['city'], where: { city: { not: null } }, _count: { _all: true }, orderBy: { _count: { city: 'desc' } }, take: 40 }),
    db.savedFilter.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } }),
    db.dictionary.findMany({ where: { kind: 'SOURCE' }, orderBy: { position: 'asc' } }),
    db.funnel.findMany({ where: { status: 'ACTIVE' }, orderBy: { position: 'asc' }, select: { id: true, name: true } }),
    db.product.findMany({ where: { status: 'ACTIVE' }, orderBy: { name: 'asc' }, select: { id: true, name: true, price: true } }),
    one(sp.new) === '1' ? db.user.findMany({ where: { status: 'ACTIVE', role: { isAdmin: false } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }) : Promise.resolve([]),
  ])
  const cnt = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0
  const all = cnt('COLD') + cnt('WARM') + cnt('ACTIVE')
  const pages = Math.max(1, Math.ceil(total / PAGE))
  const base = (patch: Record<string, string | null>) => qs(sp, { page: null, ...patch }, '/clients')
  const pg = (p: number) => qs(sp, { page: p === 1 ? null : String(p) }, '/clients')
  const mine = scope === 'mine' || !sees_all(user)
  const filterParams = Object.fromEntries(['st', 'q', 'm', 'g', 's', 'gen', 'c'].map((k) => [k, one(sp[k]) ?? '']).filter(([, v]) => v)) as Record<string, string>
  const closeHref = qs(sp, { new: null }, '/clients')

  const pageNums: (number | '…')[] = []
  for (let i = 1; i <= pages; i++) if (i <= 3 || i > pages - 1 || Math.abs(i - page) <= 1) pageNums.push(i); else if (pageNums[pageNums.length - 1] !== '…') pageNums.push('…')

  return (
    <Shell user={user} active="clients">
      <div className="head">
        <div><h1 className="title">Клієнти</h1><div className="sub">Реєстр споживачів · {n(all)} записів · кожен клієнт може мати кілька угод</div></div>
        {can(user, 'clients', 'create') && <Link className="btn dark" href={qs(sp, { new: '1' }, '/clients')} style={{ height: 46, padding: '0 22px' }}>+ Додати клієнта</Link>}
      </div>

      <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div className="subtabs">
          <Link className={!f.st ? 'on' : ''} href={base({ st: null })}>Усі · {n(all)}</Link>
          <Link className={f.st === 'COLD' ? 'on' : ''} href={base({ st: 'COLD' })}>Холодні · {n(cnt('COLD'))}</Link>
          <Link className={f.st === 'WARM' ? 'on' : ''} href={base({ st: 'WARM' })}>Теплі · {n(cnt('WARM'))}</Link>
          <Link className={f.st === 'ACTIVE' ? 'on' : ''} href={base({ st: 'ACTIVE' })}>Дійсні · {n(cnt('ACTIVE'))}</Link>
        </div>
        <form action="/clients" style={{ display: 'contents' }}>
          {Object.entries(filterParams).filter(([k]) => k !== 'q').map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <input className="input" name="q" defaultValue={f.q ?? ''} placeholder="Пошук клієнта…" aria-label="Пошук клієнта за назвою, телефоном або email" style={{ width: 190, background: '#fff' }} />
        </form>
        {sees_all(user) && <SelectPill name="m" label="Менеджер" width={150} value={f.m ?? ''} options={[{ value: '', label: '' }, ...managers.map((m) => ({ value: String(m.id), label: m.name }))].map((o, i) => i === 0 ? { ...o, label: 'Усі' } : o)} />}
        <SelectPill name="g" label="Група" width={110} value={f.g ?? ''} options={[{ value: '', label: 'Усі' }, { value: 'A', label: 'А' }, { value: 'B', label: 'Б' }]} />
        <SelectPill name="s" label="Постачальник" width={150} value={f.s ?? ''} options={[{ value: '', label: 'Усі' }, ...suppliers.map((s) => ({ value: String(s.id), label: s.name }))]} />
        <SelectPill name="gen" label="Генерація" width={130} value={f.gen ?? ''} options={[{ value: '', label: 'Усі' }, { value: '1', label: 'Є' }, { value: '0', label: 'Немає' }]} />
        <SelectPill name="c" label="Місто" width={100} value={f.c ?? ''} options={[{ value: '', label: 'Усі' }, ...cities.filter((c) => c.city).map((c) => ({ value: c.city!, label: c.city! }))]} />
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <span className="s12 muted b">Збережені фільтри:</span>
        {saved.map((s) => (
          <span key={s.id} className="chip c-gray" style={{ gap: 4 }}>
            <Link href={`/clients${Object.keys(s.params as object).length ? '?' + new URLSearchParams(s.params as Record<string, string>) : ''}`} style={{ textDecoration: 'none' }}>{s.name}</Link>
            <form action={async () => { 'use server'; await deleteFilter(s.id) }} style={{ display: 'inline' }}><button aria-label={`Видалити фільтр ${s.name}`} style={{ border: 0, background: 'none', cursor: 'pointer', color: '#586072' }}>×</button></form>
          </span>
        ))}
        {!saved.length && <span className="s12 muted">ще немає</span>}
        {Object.keys(filterParams).length > 0 && <SaveFilterButton params={filterParams} />}
        {Object.keys(filterParams).length > 0 && <Link className="s12 b" href="/clients" style={{ color: '#1a479a' }}>Скинути</Link>}
        {mine && sees_all(user) && <span className="s12 muted">· показано лише ваших клієнтів («Мої»)</span>}
      </div>

      <RegistryTable rows={rows.map(toRow)} total={total} canBulk={sees_all(user) && can(user, 'clients', 'edit')} managers={managers} filter={f}
        sort={sort} sortHref={{ name: base({ sort: sort === 'name' ? '-name' : 'name' }), last: base({ sort: sort === '-last' ? 'last' : '-last' }) }} />
      <div className="row s13" style={{ justifyContent: 'space-between', padding: '14px 12px' }}>
        <span className="muted">{total ? `${(page - 1) * PAGE + 1}–${Math.min(page * PAGE, total)} з ${n(total)}` : '0 записів'}</span>
        <div className="row" style={{ gap: 6 }}>
          {page > 1 && <Link className="btn light" href={pg(page - 1)} style={{ padding: '7px 12px' }} aria-label="Попередня сторінка">‹</Link>}
          {pageNums.map((p, i) => p === '…' ? <span key={`e${i}`} className="muted">…</span> : <Link key={p} className={`btn ${p === page ? 'dark' : 'light'}`} href={pg(p)} style={{ padding: '7px 13px' }} aria-current={p === page ? 'page' : undefined}>{p}</Link>)}
          {page < pages && <Link className="btn light" href={pg(page + 1)} style={{ padding: '7px 12px' }} aria-label="Наступна сторінка">›</Link>}
        </div>
      </div>

      {one(sp.new) === '1' && can(user, 'clients', 'create') && (
        <div className="modal-bg" role="dialog" aria-modal="true" aria-label="Додати клієнта">
          <div style={{ width: 860, maxWidth: 'calc(100% - 16px)', background: '#fff', borderRadius: 26, padding: '30px 34px', boxShadow: '0 30px 80px rgba(8,16,40,.35)' }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 20 }}>
              <div><div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.02em' }}>Новий клієнт</div><div className="s13 muted" style={{ marginTop: 4 }}>Поля, позначені *, обов’язкові</div></div>
              <Link href={closeHref} className="btn light" aria-label="Закрити" style={{ width: 40, height: 40, padding: 0, borderRadius: '50%', fontSize: 18 }}>×</Link>
            </div>
            <ClientForm mode="create" closeHref={closeHref} canPickManager={sees_all(user)} sources={sources.map((x) => x.name)} cities={cities.map((c) => c.city!).filter(Boolean)} suppliers={suppliers}
              managers={sees_all(user) ? newCtx : [{ id: user.id, name: user.name }]} funnels={funnels} products={products.map((p) => ({ id: p.id, name: p.name, price: Number(p.price) }))}
              init={{ type: 'COMPANY', name: '', edrpou: '', contactPerson: '', phone: '', email: '', city: '', address: '', status: 'COLD', source: '', managerId: user.id }} />
          </div>
        </div>
      )}
    </Shell>
  )
}
void Modal
