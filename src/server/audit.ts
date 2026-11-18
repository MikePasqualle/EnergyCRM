import { db, type Tx } from '@/lib/db'
import type { SessionUser } from './permissions'

export async function audit(
  u: Pick<SessionUser, 'id' | 'name'> | null,
  action: string,
  entity: string,
  label: string,
  details = '',
  tx?: Tx,
) {
  await (tx ?? db).auditLog.create({
    data: { userId: u?.id ?? null, userName: u?.name ?? 'Система', action, entity, label, details },
  })
}
