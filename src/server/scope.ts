import 'server-only'
import { cookies } from 'next/headers'
import { sees_all, type SessionUser } from './permissions'

export type Scope = 'mine' | 'team'

/** «Мої / Команда». Користувач без доступу до всього реєстру завжди бачить лише «Мої». */
export async function getScope(u: SessionUser): Promise<Scope> {
  if (!sees_all(u)) return 'mine'
  const v = (await cookies()).get('scope')?.value
  return v === 'mine' ? 'mine' : 'team'
}
