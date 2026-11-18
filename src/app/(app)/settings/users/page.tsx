import { requireCan } from '@/server/auth'
import { Shell } from '@/components/Shell'
import { SettingsNav } from '@/components/SettingsNav'
import { NewUserForm, RoleMatrix, RoleSelect, UserActions } from '@/components/UserParts'
import { Av } from '@/components/ui'
import { db } from '@/lib/db'
import { can, type Perms } from '@/server/permissions'
import { tempPassword } from '@/server/auth'
import { dShort, kyivNow } from '@/lib/format'
import { one, type SP } from '@/lib/url'
import Link from 'next/link'

export const metadata = { title: 'Користувачі та ролі — EnergyCRM' }

function lastLogin(d: Date | null) {
  if (!d) return 'Ще не входив'
  const n = kyivNow(), t = new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit' }).format(d)
  const days = Math.floor((Date.now() - d.getTime()) / 864e5)
  const same = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(d) === new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date())
  void n
  return same ? `Сьогодні, ${t}` : days <= 1 ? `Вчора, ${t}` : `${dShort(d)}, ${t}`
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireCan('users')
  const sp = await searchParams
  const q = (one(sp.q) ?? '').trim()
  const [users, roles, counts] = await Promise.all([
    db.user.findMany({ where: q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}, orderBy: [{ isOwner: 'desc' }, { id: 'asc' }], include: { role: true } }),
    db.role.findMany({ orderBy: [{ isAdmin: 'desc' }, { id: 'asc' }] }),
    db.client.groupBy({ by: ['managerId'], _count: { _all: true } }),
  ])
  const role = roles.find((r) => r.id === Number(one(sp.role))) ?? roles.find((r) => !r.isAdmin) ?? roles[0]
  const total = await db.user.count()
  const canEdit = can(user, 'users', 'edit')

  return (
    <Shell user={user} active="settings">
      <div className="head"><div><h1 className="title">Налаштування</h1><div className="sub">Користувачі, ролі, довідники та журнал дій · лише для адміністратора</div></div>
        {can(user, 'users', 'create') && <a className="btn dark" href="#new-user" style={{ height: 46, padding: '0 22px' }}>+ Додати користувача</a>}</div>
      <div className="g resp" style={{ gridTemplateColumns: '230px minmax(0,1fr)', alignItems: 'start' }}>
        <SettingsNav active="users" user={user} />
        <div className="g">
          <div className="card" style={{ padding: '8px 8px 4px' }}>
            <div className="row" style={{ justifyContent: 'space-between', padding: '12px 12px 4px', flexWrap: 'wrap' }}><h3 style={{ margin: 0 }}>Користувачі · {total}</h3>
              <form action="/settings/users"><input className="input" name="q" defaultValue={q} placeholder="Пошук за іменем або email…" aria-label="Пошук користувачів" style={{ width: 260, height: 38 }} /></form></div>
            <div className="scroll-x"><table className="tbl"><thead><tr><th>Користувач</th><th>Роль</th><th>Статус</th><th style={{ textAlign: 'right' }}>Клієнтів</th><th>Останній вхід</th><th style={{ textAlign: 'right' }}>Дії</th></tr></thead><tbody>
              {users.map((u) => {
                const st = u.status === 'BLOCKED' ? ['c-red', 'Заблокований'] : u.mustChangePassword && !u.lastLoginAt ? ['c-yellow', 'Потрібна зміна пароля'] : ['c-green', 'Активний']
                const c = counts.find((x) => x.managerId === u.id)?._count._all
                return (
                  <tr key={u.id}>
                    <td><div className="row" style={{ gap: 10 }}><Av id={u.id} name={u.name} size={38} fs={13} /><div><div className="b">{u.name}</div><div className="s12 muted">{u.email}</div></div></div></td>
                    <td><RoleSelect userId={u.id} roleId={u.roleId} roles={roles.map((r) => ({ id: r.id, name: r.name, isAdmin: r.isAdmin }))} disabled={!canEdit || u.isOwner || u.id === user.id} /></td>
                    <td><span className={`chip ${st[0]}`}>{st[1]}</span></td>
                    <td className="num" style={{ textAlign: 'right' }}>{c ?? '—'}</td>
                    <td className="s13">{lastLogin(u.lastLoginAt)}</td>
                    <td style={{ textAlign: 'right' }}>{canEdit ? <UserActions id={u.id} blocked={u.status === 'BLOCKED'} locked={u.isOwner && u.id !== user.id} /> : null}{u.isOwner && u.id === user.id && <div className="s12 muted">Власник акаунта</div>}</td>
                  </tr>
                )
              })}
              {!users.length && <tr><td colSpan={6} className="muted">Нікого не знайдено</td></tr>}
            </tbody></table></div>
          </div>
          <div className="g resp" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', alignItems: 'start' }}>
            <RoleMatrix key={role.id + JSON.stringify(role.permissions)} role={{ id: role.id, name: role.name, isAdmin: role.isAdmin }} roles={roles.map((r) => ({ id: r.id, name: r.name }))} initial={(role.permissions ?? {}) as Perms} seeAll={role.seeAllClients} canEdit={canEdit} />
            {can(user, 'users', 'create') && <div id="new-user"><NewUserForm roles={roles.map((r) => ({ id: r.id, name: r.name }))} candidate={tempPassword()} /></div>}
          </div>
        </div>
      </div>
      <Link hidden href="/">.</Link>
    </Shell>
  )
}
