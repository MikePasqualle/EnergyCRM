import Link from 'next/link'
import { requireCan } from '@/server/auth'
import { Shell } from '@/components/Shell'
import { ClientHeader } from '@/components/ClientHeader'
import { SystemEditor } from '@/components/SystemEditor'
import { Modal, GroupChip } from '@/components/ui'
import { db } from '@/lib/db'
import { loadClient } from '@/server/access'
import { can } from '@/server/permissions'
import { dTime, dShort } from '@/lib/format'
import { one, type SP } from '@/lib/url'
import { genShort } from '@/server/clientView'
import { NewSystemForm } from './NewSystemForm'

export const metadata = { title: 'Системи клієнта — EnergyCRM' }
const sup = (n: string) => n.replace(/^(ТОВ|ПрАТ)\s*/, '').replace(/[«»]/g, '')
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

export default async function SystemsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requireCan('clients')
  const id = Number((await params).id), sp = await searchParams
  const c0 = await loadClient(user, id)
  const c = { ...c0, manager: await db.user.findUniqueOrThrow({ where: { id: c0.managerId }, select: { name: true } }) }
  const systems = await db.system.findMany({ where: { clientId: id }, orderBy: { id: 'asc' }, include: { shares: { include: { supplier: true }, orderBy: [{ validFrom: 'asc' }, { id: 'asc' }] } } })
  const sel = systems.find((s) => s.id === Number(one(sp.s))) ?? systems[0]
  const [suppliers, types, history] = await Promise.all([
    db.supplier.findMany({ where: { status: 'ACTIVE' }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.dictionary.findMany({ where: { kind: 'OBJECT_TYPE' }, orderBy: { position: 'asc' } }),
    one(sp.history) === '1' ? db.systemHistory.findMany({ where: { system: { clientId: id } }, orderBy: { at: 'desc' }, take: 60, include: { system: { select: { name: true } } } }) : Promise.resolve([]),
  ])
  const canEdit = can(user, 'clients', 'edit')
  const today = new Date()
  const base = `/clients/${id}/systems`

  return (
    <Shell user={user} active="clients">
      <ClientHeader id={id} name={c.name} status={c.status} active="systems" chips={<span className="chip c-gray">Менеджер: {c.manager.name}</span>}
        right={<><Link className="btn line" href={`${base}?${sel ? `s=${sel.id}&` : ''}history=1`}>Історія змін налаштувань</Link>{canEdit && <Link className="btn dark" href={`${base}?new=1`}>+ Додати систему</Link>}</>} />
      <div className="g resp" style={{ gridTemplateColumns: '340px minmax(0,1fr)', alignItems: 'start' }}>
        <div className="card">
          <h3>Системи клієнта · {systems.length}</h3>
          <div className="g" style={{ gap: 10 }}>
            {systems.map((s) => {
              const current = s.shares.filter((x) => !x.validTo || x.validTo >= today)
              const names = [...new Set(current.map((x) => sup(x.supplier.name)))].join(' · ')
              const on = s.id === sel?.id
              return (
                <Link key={s.id} href={`${base}?s=${s.id}`} style={{ textDecoration: 'none', background: on ? '#e9f1fd' : undefined, border: on ? undefined : '1px solid #e7eaf0', borderRadius: 16, padding: 14 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}><b className="s13">{s.name}</b><GroupChip g={s.group} /></div>
                  <div className="s12 muted" style={{ margin: '6px 0 8px' }}>{s.address ?? '—'}</div>
                  <div className="row s12" style={{ gap: 12 }}><span><b className="num">{s.powerKw}</b> кВт</span><span>{names || '—'}</span></div>
                  {s.hasGeneration && <div style={{ marginTop: 8 }}><span className="chip c-green">{genShort(s.genType)} · {s.genPowerKw} кВт</span></div>}
                </Link>
              )
            })}
            {!systems.length && <div className="muted s13">Систем ще немає. Додайте перший обʼєкт клієнта.</div>}
          </div>
        </div>
        {sel ? (
          <SystemEditor key={`${sel.id}-${sel.updatedAt.getTime()}`} canEdit={canEdit} canDelete={can(user, 'clients', 'delete')} usageHref={`/clients/${id}/usage?s=${sel.id}`} cancelHref={`/clients/${id}`}
            suppliers={suppliers} objectTypes={types.map((t) => t.name)}
            sys={{ id: sel.id, name: sel.name, objectType: sel.objectType, powerKw: sel.powerKw, address: sel.address ?? '', eic: sel.eic ?? '', group: sel.group, meterType: sel.meterType, hasGeneration: sel.hasGeneration, genType: sel.genType ?? '', genPowerKw: sel.genPowerKw?.toString() ?? '', genMode: sel.genMode ?? '',
              shares: sel.shares.map((x) => ({ supplierId: x.supplierId, validFrom: iso(x.validFrom)!, validTo: iso(x.validTo), pct: x.sharePct })), updatedLabel: `${dShort(sel.updatedAt)}, ${sel.updatedBy ?? '—'}` }} />
        ) : <div className="card"><div className="empty"><b>Немає систем</b>Додайте систему, щоб налаштувати групу, постачальників і генерацію.</div></div>}
      </div>

      {one(sp.new) === '1' && canEdit && <Modal closeHref={base} title="Нова система" subtitle="Обʼєкт, де споживається електроенергія" narrow><NewSystemForm clientId={id} types={types.map((t) => t.name)} cancelHref={base} defaultAddress={c.address ?? ''} /></Modal>}
      {one(sp.history) === '1' && (
        <Modal closeHref={sel ? `${base}?s=${sel.id}` : base} title="Історія змін налаштувань" subtitle="Хто, коли і що змінив у системах клієнта">
          <div style={{ maxHeight: 460, overflow: 'auto' }}>
            {history.map((h) => <div className="tl" key={h.id}><div className="dot" style={{ background: '#e9f1fd', color: '#1a479a' }} aria-hidden="true">✎</div><div><div className="b s13">{h.system.name}</div><div className="s13">{h.summary}</div><div className="s12 muted">{dTime(h.at)} · {h.userName}</div></div></div>)}
            {!history.length && <div className="muted">Змін ще не було.</div>}
          </div>
        </Modal>
      )}
    </Shell>
  )
}
