import Link from 'next/link'
import { Prisma } from '@/generated/prisma/client'
import { requireUser } from '@/server/auth'
import { Shell } from '@/components/Shell'
import { SettingsNav } from '@/components/SettingsNav'
import { SelectPill } from '@/components/SelectPill'
import { AddSupplier, DictChips, GeneralSettings, SupplierRow } from '@/components/DictParts'
import { Av } from '@/components/ui'
import { db } from '@/lib/db'
import { can } from '@/server/permissions'
import { dTime, monNom, n } from '@/lib/format'
import { kyivDate, todayKyiv } from '@/server/period'
import { redirect } from 'next/navigation'
import { one, qs, type SP } from '@/lib/url'

export const metadata = { title: 'Довідники та журнал дій — EnergyCRM' }
const PAGE = 20
const ACT_CLS: Record<string, string> = { 'Етап угоди': 'c-blue', 'Закріплення': 'c-yellow', 'Налаштування споживача': 'c-purple', 'Користувач': 'c-red', 'Продукт': 'c-green', 'Клієнт': 'c-gray' }

export default async function Dictionaries({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser()
  if (!can(user, 'users', 'view') && !can(user, 'audit', 'view')) redirect('/forbidden')
  const sp = await searchParams
  const canEdit = can(user, 'users', 'edit')
  const t = todayKyiv()
  const ym = one(sp.mo) && /^\d{4}-\d\d$/.test(one(sp.mo)!) ? one(sp.mo)! : `${t.y}-${String(t.m + 1).padStart(2, '0')}`
  const [y, m] = ym.split('-').map(Number)
  const start = kyivDate(y, m - 1, 1, 0), end = kyivDate(y, m, 1, 0)
  const uid = Number(one(sp.u)) || null, act = one(sp.a) || null
  const lim = Math.min(Number(one(sp.lim)) || PAGE, 500)
  const where: Prisma.AuditLogWhereInput = { at: { gte: start, lt: end }, ...(uid ? { userId: uid } : {}), ...(act ? { action: act } : {}) }

  const [suppliers, shareCounts, dicts, logs, total, actors, actions, settings, months] = await Promise.all([
    db.supplier.findMany({ orderBy: [{ status: 'asc' }, { id: 'asc' }] }),
    db.$queryRaw<{ supplierId: number; n: number }[]>`SELECT sh."supplierId", count(DISTINCT s."clientId")::int n FROM "SupplierShare" sh JOIN "System" s ON s.id=sh."systemId" GROUP BY 1`,
    db.dictionary.findMany({ orderBy: [{ kind: 'asc' }, { position: 'asc' }] }),
    can(user, 'audit', 'view') ? db.auditLog.findMany({ where, orderBy: { at: 'desc' }, take: lim }) : Promise.resolve([]),
    can(user, 'audit', 'view') ? db.auditLog.count({ where }) : Promise.resolve(0),
    db.auditLog.groupBy({ by: ['userId', 'userName'], _count: { _all: true }, orderBy: { userName: 'asc' } }),
    db.auditLog.groupBy({ by: ['action'], _count: { _all: true }, orderBy: { action: 'asc' } }),
    db.setting.findMany(),
    db.$queryRaw<{ ym: string }[]>`SELECT DISTINCT to_char(at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Kyiv','YYYY-MM') ym FROM "AuditLog" ORDER BY 1 DESC LIMIT 12`,
  ])
  const dk = (k: string) => dicts.filter((d) => d.kind === k).map((d) => ({ id: d.id, name: d.name }))
  const sv = Object.fromEntries(settings.map((s) => [s.key, s.value]))
  const base = (patch: Record<string, string | null>) => qs(sp, patch, '/settings/dictionaries')

  return (
    <Shell user={user} active="settings">
      <div className="head"><div><h1 className="title">Налаштування</h1><div className="sub">Довідники та журнал дій · лише для адміністратора</div></div></div>
      <div className="g resp" style={{ gridTemplateColumns: '230px minmax(0,1fr)', alignItems: 'start' }}>
        <SettingsNav active="dict" user={user} />
        <div className="g">
          {can(user, 'users', 'view') && (<>
            <div className="g resp" style={{ gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1fr)', alignItems: 'start' }}>
              <div className="card" style={{ padding: '8px 8px 4px' }}>
                <div className="row" style={{ justifyContent: 'space-between', padding: '12px 12px 4px', flexWrap: 'wrap' }}><h3 style={{ margin: 0 }}>Постачальники / оператори</h3>{canEdit && <AddSupplier />}</div>
                <div className="scroll-x"><table className="tbl"><thead><tr><th>Назва</th><th>Контакт</th><th style={{ textAlign: 'right' }}>Клієнтів</th><th>Статус</th><th /></tr></thead><tbody>
                  {suppliers.map((s) => <SupplierRow key={s.id} canEdit={canEdit} s={{ id: s.id, name: s.name, phone: s.phone, status: s.status, clients: shareCounts.find((c) => c.supplierId === s.id)?.n ?? 0 }} />)}
                </tbody></table></div>
              </div>
              <div className="g">
                <div className="card"><DictChips title="Джерела контактів" kind="SOURCE" items={dk('SOURCE')} cls="c-gray" canEdit={canEdit} /></div>
                <div className="card"><DictChips title="Причини втрати угоди" kind="LOSS_REASON" items={dk('LOSS_REASON')} cls="c-red" canEdit={canEdit} /></div>
                <div className="card">
                  <DictChips title="Типи обʼєктів і канали" kind="OBJECT_TYPE" items={dk('OBJECT_TYPE')} cls="c-blue" canEdit={canEdit} />
                  <div className="sep" style={{ margin: '12px 0' }} />
                  <DictChips noTitle title="Канали комунікації" kind="CHANNEL" items={dk('CHANNEL')} cls="c-purple" canEdit={canEdit} />
                </div>
              </div>
            </div>
            <GeneralSettings values={{ currency: sv.currency ?? 'UAH', unit: sv.unit ?? 'kWh', timezone: sv.timezone ?? 'Europe/Kyiv' }} canEdit={canEdit} />
          </>)}

          {can(user, 'audit', 'view') && (
            <div className="card" id="audit" style={{ padding: '8px 8px 4px' }}>
              <div className="row" style={{ justifyContent: 'space-between', padding: '12px 12px 4px', flexWrap: 'wrap' }}>
                <div><h3 style={{ margin: 0 }}>Журнал дій</h3><div className="s12 muted" style={{ marginTop: 4 }}>Записи не редагуються й не видаляються</div></div>
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <SelectPill name="u" label="Користувач" width={190} value={uid ? String(uid) : ''} options={[{ value: '', label: 'усі' }, ...actors.filter((a) => a.userId).map((a) => ({ value: String(a.userId), label: a.userName }))]} resetPage />
                  <SelectPill name="a" label="Дія" width={190} value={act ?? ''} options={[{ value: '', label: 'усі' }, ...actions.map((a) => ({ value: a.action, label: a.action }))]} />
                  <SelectPill name="mo" label="" width={180} value={ym} options={[...new Set([ym, ...months.map((x) => x.ym)])].map((v) => ({ value: v, label: `${monNom(Number(v.slice(5)) - 1)} ${v.slice(0, 4)}` }))} />
                </div>
              </div>
              <div className="scroll-x"><table className="tbl"><thead><tr><th>Коли</th><th>Хто</th><th>Дія</th><th>Обʼєкт</th><th>Що змінилося</th></tr></thead><tbody>
                {logs.map((l) => (
                  <tr key={l.id}><td className="s13 num">{dTime(l.at)}</td><td><div className="row" style={{ gap: 8 }}>{l.userId ? <Av id={l.userId} name={l.userName} size={26} /> : null}{l.userName}</div></td>
                    <td><span className={`chip ${ACT_CLS[l.action] ?? 'c-gray'}`}>{l.action}</span></td><td className="s13">{l.label}</td><td className="s13">{l.details}</td></tr>
                ))}
                {!logs.length && <tr><td colSpan={5} className="muted">Записів за цей період немає</td></tr>}
              </tbody></table></div>
              <div className="row s13" style={{ justifyContent: 'space-between', padding: '14px 12px' }}>
                <span className="muted">{total ? `1–${Math.min(lim, total)} з ${n(total)} записів` : '0 записів'}</span>
                {lim < total && <Link className="btn light" href={base({ lim: String(lim + PAGE) })} style={{ padding: '7px 14px' }}>Показати ще</Link>}
              </div>
            </div>
          )}
        </div>
      </div>
    </Shell>
  )
}
