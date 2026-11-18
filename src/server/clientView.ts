import { dShort } from '@/lib/format'
import { avCls, initials } from '@/lib/format'
import type { Row } from '@/components/RegistryTable'

export const genShort = (t?: string | null) => (!t ? '' : t.startsWith('Сонячна') ? 'СЕС' : t)
const supShort = (n: string) => n.replace(/^(ТОВ|ПрАТ|ПП|АТ)\s*/, '').replace(/[«»]/g, '')
const shortMgr = (n: string) => { const p = n.split(' '); return p.length > 1 ? `${p[0].replace(/^(\S+)$/, '$1')} ${p[1][0]}.` : n }
// у дизайні: «Олена К.» — ім'я та ініціал прізвища
const mgrShort = (n: string) => { const p = n.split(' '); return p.length > 1 ? `${p[0]} ${p[1][0]}.` : n }
void shortMgr

type C = {
  id: number; name: string; type: 'COMPANY' | 'FOP' | 'PERSON'; city: string | null; status: 'COLD' | 'WARM' | 'ACTIVE'; phone: string; email: string | null
  managerId: number; manager: { name: string }; lastContactAt: Date | null; _count: { deals: number }
  systems: { group: 'A' | 'B' | 'UNSET'; hasGeneration: boolean; genType: string | null; genPowerKw: number | null; shares: { sharePct: number; validTo: Date | null; supplier: { name: string } }[] }[]
}
const TYPE = { COMPANY: 'Юр. особа', FOP: 'ФОП', PERSON: 'Фіз. особа' }

export function toRow(c: C): Row {
  const today = new Date()
  const shares = c.systems.flatMap((s) => s.shares).filter((x) => !x.validTo || x.validTo >= today)
  const names = [...new Set(shares.map((x) => x.supplier.name))]
  let suppliers = '—'
  if (names.length) {
    suppliers = c.systems.length === 1 && shares.length > 1 && !shares.some((x) => x.sharePct === 100)
      ? [...new Map(shares.map((x) => [x.supplier.name, x.sharePct])).entries()].map(([n, p]) => `${supShort(n)} ${p}%`).join(' · ')
      : names.map(supShort).join(' · ')
  }
  const g = c.systems.find((s) => s.group === 'A')?.group ?? c.systems.find((s) => s.group === 'B')?.group ?? 'UNSET'
  const gs = c.systems.find((s) => s.hasGeneration)
  return {
    id: c.id, name: c.name, sub: `${TYPE[c.type]}${c.city ? ` · ${c.city}` : ''}`, status: c.status, phone: c.phone, email: c.email, group: g, suppliers,
    generation: gs ? `${genShort(gs.genType)}${gs.genPowerKw ? ` · ${gs.genPowerKw} кВт` : ''}` : 'Немає', deals: c._count.deals,
    managerId: c.managerId, manager: mgrShort(c.manager.name), managerCls: avCls(c.managerId), managerInit: initials(c.manager.name), last: c.lastContactAt ? dShort(c.lastContactAt) : '—',
  }
}
export const CLIENT_INCLUDE = {
  manager: { select: { name: true } }, _count: { select: { deals: true } },
  systems: { select: { group: true, hasGeneration: true, genType: true, genPowerKw: true, shares: { select: { sharePct: true, validTo: true, supplier: { select: { name: true } } } } } },
} as const
