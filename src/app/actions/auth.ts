'use server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import argon2 from 'argon2'
import { db } from '@/lib/db'
import { getUser, hashPassword, login, validatePassword } from '@/server/auth'
import { audit } from '@/server/audit'

export type FormState = { error?: string; ok?: string; fields?: Record<string, string> } | undefined

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const p = z.object({ email: z.string().min(1), password: z.string().min(1) }).safeParse({
    email: fd.get('email'), password: fd.get('password'),
  })
  if (!p.success) return { error: 'Введіть логін і пароль' }
  const r = await login(p.data.email, p.data.password, fd.get('remember') === 'on')
  if (!r.ok) return { error: r.error }
  redirect(r.mustChange ? '/change-password' : '/dashboard')
}

export async function changePasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const u = await getUser()
  if (!u) redirect('/login')
  const cur = String(fd.get('current') ?? '')
  const next = String(fd.get('next') ?? '')
  const again = String(fd.get('again') ?? '')
  const row = await db.user.findUniqueOrThrow({ where: { id: u.id } })
  if (!(await argon2.verify(row.passwordHash, cur).catch(() => false))) return { error: 'Поточний пароль невірний' }
  const bad = validatePassword(next)
  if (bad) return { error: bad }
  if (next !== again) return { error: 'Паролі не збігаються' }
  if (cur === next) return { error: 'Новий пароль має відрізнятися від поточного' }
  await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(next), mustChangePassword: false } })
  await audit(u, 'Зміна пароля', 'Користувач', u.name)
  redirect('/dashboard')
}
