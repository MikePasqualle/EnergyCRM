import Link from 'next/link'
import { avCls } from '@/lib/format'
import { STATUS, type StatusKey } from './ui'

export const clientInitials = (name: string) =>
  name.replace(/^(ТОВ|ПрАТ|ПП|АТ|ФОП|ТзОВ)\s+/i, '').replace(/[«»"]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')

export const STATUS_LONG: Record<StatusKey, string> = { ACTIVE: 'Дійсний клієнт', WARM: 'Теплий контакт', COLD: 'Холодний контакт' }

export function ClientHeader({ id, name, status, chips, right, active, tabs = true }: {
  id: number; name: string; status: StatusKey; chips: React.ReactNode; right?: React.ReactNode; active: 'profile' | 'systems' | 'usage'; tabs?: boolean
}) {
  return (
    <>
      <div className="head">
        <div className="row" style={{ gap: 16 }}>
          <div className={`avatar ${avCls(id)}`} style={{ width: 64, height: 64, fontSize: 20 }}>{clientInitials(name)}</div>
          <div>
            <div className="s13 sub"><Link href="/clients" style={{ textDecoration: 'none' }}>Клієнти</Link> / Картка клієнта</div>
            <h1 className="title" style={{ marginTop: 6 }}>{name}</h1>
            <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}><span className={`chip ${STATUS[status].cls}`}>{STATUS_LONG[status]}</span>{chips}</div>
          </div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>{right}</div>
      </div>
      {tabs && (
        <div className="subtabs" style={{ marginBottom: 16 }} role="tablist">
          <Link className={active === 'profile' ? 'on' : ''} href={`/clients/${id}`}>Профіль</Link>
          <Link className={active === 'systems' ? 'on' : ''} href={`/clients/${id}/systems`}>Системи</Link>
          <Link className={active === 'usage' ? 'on' : ''} href={`/clients/${id}/usage`}>Споживання</Link>
        </div>
      )}
    </>
  )
}
