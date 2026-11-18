import 'server-only'
import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { createHash, randomBytes } from 'node:crypto'
import argon2 from 'argon2'
import { db } from '@/lib/db'
import { can, type Action, type Perms, type SessionUser } from './permissions'
import { audit } from './audit'

const COOKIE = 'sid'
export const IDLE_MIN = 30 // FR-1.5 автовихід після неактивності
const REMEMBER_MIN = 60 * 12
const MAX_FAILS = 5
const LOCK_MIN = 15
export const MIN_PASSWORD = 12

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
export const hashPassword = (p: string) => argon2.hash(p, { type: argon2.argon2id })

export function validatePassword(p: string): string | null {
  if (p.length < MIN_PASSWORD) return `Пароль має містити щонайменше ${MIN_PASSWORD} символів`
  if (!/[A-Za-zА-Яа-яІіЇїЄєҐґ]/.test(p) || !/\d/.test(p)) return 'Пароль має містити літери та цифри'
  return null
}

export function tempPassword() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz'
  const dig = '23456789'
  const pick = (set: string) => set[randomBytes(1)[0] % set.length]
  const groups = Array.from({ length: 4 }, () => pick(abc) + pick(abc) + pick(dig))
  return groups.join('-') // напр. Xt4-Rm9-Qw2-Lp7 (≥12 символів, літери й цифри)
}

export type LoginResult = { ok: true; mustChange: boolean } | { ok: false; error: string }

export async function login(email: string, password: string, remember: boolean): Promise<LoginResult> {
  const generic = 'Невірний логін або пароль'
  const e = email.trim().toLowerCase()
  const user = await db.user.findUnique({ where: { email: e } })
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000)
    return { ok: false, error: `Забагато невдалих спроб. Вхід тимчасово заблоковано, спробуйте через ${mins} хв.` }
  }
  const valid = user && user.status === 'ACTIVE' ? await argon2.verify(user.passwordHash, password).catch(() => false) : false
  await db.loginAttempt.create({ data: { email: e, ok: !!valid } })
  if (!user || !valid) {
    if (user && user.status === 'ACTIVE') {
      const fails = user.failedAttempts + 1
      await db.user.update({
        where: { id: user.id },
        data: fails >= MAX_FAILS
          ? { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MIN * 60000) }
          : { failedAttempts: fails },
      })
    } else if (!user) {
      await argon2.hash(password) // вирівнюємо час відповіді
    }
    return { ok: false, error: generic }
  }
  await db.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } })
  const token = randomBytes(32).toString('base64url')
  const idle = remember ? REMEMBER_MIN : IDLE_MIN
  await db.session.create({
    data: { tokenHash: sha(token), userId: user.id, expiresAt: new Date(Date.now() + idle * 60000) },
  })
  ;(await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: idle * 60,
  })
  await audit({ id: user.id, name: user.name }, 'Вхід', 'Сесія', user.name)
  return { ok: true, mustChange: user.mustChangePassword }
}

export async function logout() {
  const c = await cookies()
  const t = c.get(COOKIE)?.value
  if (t) await db.session.deleteMany({ where: { tokenHash: sha(t) } })
  c.delete(COOKIE)
}

export async function getUser(): Promise<SessionUser | null> {
  const t = (await cookies()).get(COOKIE)?.value
  if (!t) return null
  const s = await db.session.findUnique({
    where: { tokenHash: sha(t) },
    include: { user: { include: { role: true } } },
  })
  if (!s) return null
  const now = new Date()
  if (s.expiresAt < now || s.user.status !== 'ACTIVE') {
    await db.session.delete({ where: { id: s.id } }).catch(() => {})
    return null
  }
  // ковзне продовження сесії
  if (now.getTime() - s.lastSeenAt.getTime() > 60_000) {
    const span = s.expiresAt.getTime() - s.lastSeenAt.getTime()
    await db.session
      .update({ where: { id: s.id }, data: { lastSeenAt: now, expiresAt: new Date(now.getTime() + span) } })
      .catch(() => {})
  }
  const u = s.user
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    isOwner: u.isOwner,
    mustChangePassword: u.mustChangePassword,
    role: {
      id: u.role.id,
      name: u.role.name,
      isAdmin: u.role.isAdmin,
      seeAllClients: u.role.seeAllClients,
      permissions: u.role.permissions as Perms,
    },
  }
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getUser()
  if (!u) redirect('/login')
  if (u.mustChangePassword) redirect('/change-password')
  return u
}

/** Перевірка прав на сервері (NFR-2). Для сторінок — 404, щоб не розкривати існування. */
export async function requireCan(section: string, action: Action = 'view'): Promise<SessionUser> {
  const u = await requireUser()
  if (!can(u, section, action)) redirect('/forbidden')
  return u
}
export function assertCan(u: SessionUser, section: string, action: Action) {
  if (!can(u, section, action)) throw new Error('Недостатньо прав')
}
export { notFound }
