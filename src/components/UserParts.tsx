'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useState, useTransition } from 'react'
import { changeUserRole, createRole, createUser, resetPassword, saveRole, setUserBlocked } from '@/app/actions/settings'
import { SECTIONS, type Perms } from '@/server/permissions-meta'

export function CopyBtn({ text, label = 'Копіювати' }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false)
  return <button type="button" className="s12 b" style={{ color: '#1a479a', border: 0, background: 'none', cursor: 'pointer' }} onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500) } catch {} }}>{ok ? 'Скопійовано' : label}</button>
}

export function UserActions({ id, blocked, locked }: { id: number; blocked: boolean; locked: boolean }) {
  const r = useRouter()
  const [pw, setPw] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [p, start] = useTransition()
  if (locked) return <span className="s12 muted">Власник акаунта</span>
  return (
    <>
      {!blocked && <button className="btn line" disabled={p} style={{ padding: '7px 12px', fontSize: 13 }} onClick={() => start(async () => { const x = await resetPassword(id); if (x.ok) setPw(x.password); else setErr(x.error) })}>Скинути пароль</button>}{' '}
      <button className="btn line" disabled={p} style={{ padding: '7px 12px', fontSize: 13 }} onClick={() => start(async () => { const x = await setUserBlocked(id, !blocked); if (x.ok) r.refresh(); else setErr(x.error) })}>{blocked ? 'Розблокувати' : 'Заблокувати'}</button>
      {err && <div className="errmsg" role="alert">{err}</div>}
      {pw && (
        <div className="modal-bg" role="dialog" aria-modal="true" aria-label="Тимчасовий пароль"><div className="modal narrow" style={{ marginTop: 100 }}>
          <h2>Пароль скинуто</h2><div className="muted s13" style={{ margin: '4px 0 16px' }}>Передайте користувачеві тимчасовий пароль. Він показується один раз; під час першого входу користувач має його змінити.</div>
          <div className="input num" style={{ justifyContent: 'space-between' }}><span>{pw}</span><CopyBtn text={pw} /></div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 20 }}><button className="btn dark" onClick={() => { setPw(null); r.refresh() }}>Готово</button></div>
        </div></div>
      )}
    </>
  )
}

export function RoleSelect({ userId, roleId, roles, disabled }: { userId: number; roleId: number; roles: { id: number; name: string; isAdmin: boolean }[]; disabled: boolean }) {
  const r = useRouter()
  const cur = roles.find((x) => x.id === roleId)!
  const [p, start] = useTransition()
  const chip = <span className={`chip ${cur.isAdmin ? 'c-purple' : 'c-blue'}`}>{cur.name}</span>
  if (disabled) return chip
  return (
    <label style={{ position: 'relative', display: 'inline-block', cursor: 'pointer', opacity: p ? 0.6 : 1 }}>{chip}<span aria-hidden="true" className="s12 muted"> ▾</span>
      <select aria-label={`Роль користувача`} value={roleId} style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: 'pointer' }} onChange={(e) => start(async () => { await changeUserRole(userId, Number(e.target.value)); r.refresh() })}>
        {roles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select></label>
  )
}

export function RoleMatrix({ role, roles, initial, seeAll, canEdit }: { role: { id: number; name: string; isAdmin: boolean }; roles: { id: number; name: string }[]; initial: Perms; seeAll: boolean; canEdit: boolean }) {
  const r = useRouter()
  const [perms, setPerms] = useState<Perms>(initial)
  const [all, setAll] = useState(seeAll)
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null)
  const [newRole, setNewRole] = useState(false)
  const [p, start] = useTransition()
  const locked = role.isAdmin || !canEdit
  const toggle = (k: string, a: 'view' | 'create' | 'edit' | 'delete') => setPerms((x) => ({ ...x, [k]: { ...x[k], [a]: !x[k]?.[a], ...(a === 'view' && x[k]?.view ? { create: false, edit: false, delete: false } : {}) } }))
  const [nst, nact, npending] = useActionState(createRole, undefined)
  useEffect(() => { if (nst?.id) { setNewRole(false); r.push(`/settings/users?role=${nst.id}`) } }, [nst, r])
  const save = () => start(async () => { const x = await saveRole(role.id, perms, all); setMsg(x.ok ? { t: 'Права збережено' } : { t: x.error, bad: true }); setTimeout(() => setMsg(null), 4500); if (x.ok) r.refresh() })
  const cb = (k: string, a: 'view' | 'create' | 'edit' | 'delete', allowed: readonly string[]) => allowed.includes(a)
    ? <input type="checkbox" aria-label={`${k}: ${a}`} checked={role.isAdmin || !!perms[k]?.[a]} disabled={locked || (a !== 'view' && !perms[k]?.view)} onChange={() => toggle(k, a)} style={{ width: 18, height: 18, accentColor: '#0f1115' }} />
    : <span className="muted">—</span>
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap' }}><h3 style={{ margin: 0 }}>Права ролі</h3>
        <div className="subtabs" style={{ background: '#eef1f5' }}>{roles.map((x) => <Link key={x.id} className={x.id === role.id ? 'on' : ''} href={`/settings/users?role=${x.id}`}>{x.name}</Link>)}{canEdit && <button onClick={() => setNewRole(true)} style={{ border: 0, background: 'none', padding: '9px 16px', fontWeight: 600, fontSize: 14, color: '#3d4452', cursor: 'pointer' }}>+ Нова роль</button>}</div></div>
      <div className="scroll-x"><table className="tbl"><thead><tr><th>Розділ</th><th style={{ textAlign: 'center' }}>Перегляд</th><th style={{ textAlign: 'center' }}>Створення</th><th style={{ textAlign: 'center' }}>Редагування</th><th style={{ textAlign: 'center' }}>Видалення</th></tr></thead><tbody>
        {SECTIONS.map((s) => <tr key={s.key}><td><b>{s.label}</b></td>{(['view', 'create', 'edit', 'delete'] as const).map((a) => <td key={a} style={{ textAlign: 'center' }}>{cb(s.key, a, s.actions)}</td>)}</tr>)}
      </tbody></table></div>
      <div className="sep" />
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div><div className="b s13">Доступ до реєстру клієнтів</div><div className="s12 muted">Які клієнти та яка аналітика видимі цій ролі</div></div>
        <div className="seg" role="radiogroup" aria-label="Доступ до реєстру клієнтів" style={{ background: '#eef1f5' }}>
          {([[false, 'Лише закріплені'], [true, 'Усі клієнти']] as const).map(([v, l]) => <button type="button" key={String(v)} role="radio" aria-checked={role.isAdmin ? v : all === v} disabled={locked} onClick={() => setAll(v)} style={{ border: 0, cursor: locked ? 'default' : 'pointer', font: '600 13px Inter,system-ui,sans-serif', padding: '8px 16px', borderRadius: 999, background: (role.isAdmin ? v : all === v) ? '#0f1115' : 'none', color: (role.isAdmin ? v : all === v) ? '#fff' : '#444b59' }}>{l}</button>)}
        </div>
      </div>
      {role.isAdmin && <div className="alert warn" style={{ marginTop: 14 }}>Роль «Адмін» має повний доступ, її права не редагуються.</div>}
      {!locked && <div className="row" style={{ justifyContent: 'flex-end', marginTop: 18 }}><button className="btn line" onClick={() => { setPerms(initial); setAll(seeAll) }}>Скасувати</button><button className="btn dark" disabled={p} onClick={save}>{p ? 'Зберігаємо…' : 'Зберегти права'}</button></div>}
      {newRole && (
        <div className="modal-bg" role="dialog" aria-modal="true" aria-label="Нова роль"><div className="modal narrow" style={{ marginTop: 100 }}>
          <h2>Нова роль</h2><div className="muted s13" style={{ margin: '4px 0 16px' }}>Створюється з доступом лише на перегляд — права налаштуєте в матриці.</div>
          <form action={nact}>{nst?.error && <div className="alert bad" role="alert" style={{ marginBottom: 12 }}>{nst.error}</div>}
            <label className="lbl" htmlFor="rn">Назва ролі *</label><input className="input" id="rn" name="name" required autoFocus />
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 20 }}><button type="button" className="btn light" onClick={() => setNewRole(false)}>Скасувати</button><button className="btn dark" disabled={npending}>Створити</button></div></form>
        </div></div>
      )}
      {msg && <div className={`toast${msg.bad ? ' bad' : ''}`} role="status">{msg.t}</div>}
    </div>
  )
}

export function NewUserForm({ roles, candidate }: { roles: { id: number; name: string }[]; candidate: string }) {
  const r = useRouter()
  const [st, act, pending] = useActionState(createUser, undefined)
  const [done, setDone] = useState<{ name: string; email: string; password: string } | null>(null)
  useEffect(() => { if (st?.created) { setDone(st.created); r.refresh() } }, [st, r])
  const f = st?.fields ?? {}
  return (
    <div className="card">
      <h3>Новий користувач</h3>
      {done ? (
        <div className="g" style={{ gap: 12 }}>
          <div className="alert ok" role="status">Користувача <b>{done.name}</b> створено. Передайте йому дані для входу — пароль показується лише зараз.</div>
          <div><span className="lbl">Логін</span><div className="input" style={{ justifyContent: 'space-between' }}><span>{done.email}</span><CopyBtn text={done.email} /></div></div>
          <div><span className="lbl">Тимчасовий пароль</span><div className="input num" style={{ justifyContent: 'space-between' }}><span>{done.password}</span><CopyBtn text={done.password} /></div><div className="hint">Під час першого входу користувач має змінити пароль</div></div>
          <button className="btn light" onClick={() => setDone(null)}>Додати ще одного</button>
        </div>
      ) : (
        <form action={act} className="g" style={{ gap: 14 }}>
          {st?.error && !Object.keys(f).length && <div className="alert bad" role="alert">{st.error}</div>}
          <div><label className="lbl" htmlFor="un">Ім’я *</label><input className={`input${f.name ? ' err' : ''}`} id="un" name="name" placeholder="Максим Лисенко" />{f.name && <div className="errmsg">{f.name}</div>}</div>
          <div><label className="lbl" htmlFor="ue">Email (логін) *</label><input className={`input${f.email ? ' err' : ''}`} id="ue" name="email" type="email" placeholder="maksym@energycrm.ua" />{f.email && <div className="errmsg" role="alert">{f.email}</div>}</div>
          <div><label className="lbl" htmlFor="ur">Роль *</label><select className="input" id="ur" name="roleId" defaultValue={roles.find((x) => x.name === 'Користувач')?.id}>{roles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
          <div><label className="lbl" htmlFor="up">Тимчасовий пароль</label><div className="input num" style={{ justifyContent: 'space-between' }}><input id="up" name="password" readOnly value={candidate} style={{ border: 0, outline: 'none', font: 'inherit', background: 'transparent', flex: 1 }} /><CopyBtn text={candidate} /></div>
            <div className="hint">Показується один раз; під час першого входу користувач має його змінити</div></div>
          <button className="btn dark" style={{ width: '100%' }} disabled={pending}>{pending ? 'Створюємо…' : 'Створити користувача'}</button>
        </form>
      )}
    </div>
  )
}
