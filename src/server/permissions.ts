export const SECTIONS = [
  { key: 'analytics', label: 'Аналітика', actions: ['view'] },
  { key: 'funnels', label: 'Воронки та етапи', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'clients', label: 'Клієнти', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'deals', label: 'Угоди', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'products', label: 'Продукти', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'users', label: 'Користувачі та ролі', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'audit', label: 'Журнал дій', actions: ['view'] },
] as const

export type Action = 'view' | 'create' | 'edit' | 'delete'
export type Perms = Record<string, Partial<Record<Action, boolean>>>

export const ADMIN_PERMS: Perms = Object.fromEntries(
  SECTIONS.map((s) => [s.key, Object.fromEntries(s.actions.map((a) => [a, true]))]),
)
export const USER_PERMS: Perms = {
  analytics: { view: true },
  funnels: { view: true },
  clients: { view: true, create: true, edit: true },
  deals: { view: true, create: true, edit: true },
  products: { view: true },
}

export type SessionUser = {
  id: number
  name: string
  email: string
  isOwner: boolean
  mustChangePassword: boolean
  role: { id: number; name: string; isAdmin: boolean; seeAllClients: boolean; permissions: Perms }
}

export function can(u: SessionUser, section: string, action: Action): boolean {
  if (u.role.isAdmin) return true
  return !!u.role.permissions?.[section]?.[action]
}
export const sees_all = (u: SessionUser) => u.role.isAdmin || u.role.seeAllClients
