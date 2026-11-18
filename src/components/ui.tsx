import Link from 'next/link'
import { avCls, initials } from '@/lib/format'

export const STATUS = {
  ACTIVE: { label: 'Дійсний', cls: 'c-green' },
  WARM: { label: 'Теплий', cls: 'c-orange' },
  COLD: { label: 'Холодний', cls: 'c-blue' },
} as const
export type StatusKey = keyof typeof STATUS

export const CLIENT_TYPE = { COMPANY: 'Юр. особа', FOP: 'ФОП', PERSON: 'Фіз. особа' } as const
export const CLIENT_TYPE_FULL = { COMPANY: 'Юридична особа', FOP: 'ФОП', PERSON: 'Фізична особа' } as const

export const StatusChip = ({ s }: { s: StatusKey }) => <span className={`chip ${STATUS[s].cls}`}>{STATUS[s].label}</span>
export const GroupChip = ({ g }: { g: 'A' | 'B' | 'UNSET' }) =>
  g === 'UNSET' ? <span className="chip c-gray">—</span> : <span className={`chip ${g === 'A' ? 'c-purple' : 'c-blue'}`}>{g === 'A' ? 'А' : 'Б'}</span>

export function Av({ id, name, size = 28, fs = 10 }: { id: number; name: string; size?: number; fs?: number }) {
  return <span className={`avatar ${avCls(id)}`} style={{ width: size, height: size, fontSize: fs }}>{initials(name)}</span>
}

export const short = (full: string) => {
  const p = full.split(' ')
  return p.length > 1 ? `${p[0]} ${p[1][0]}.` : full
}
export const shortName = (full: string) => { const p = full.split(' '); return p.length > 1 ? `${p[0]} ${p[1][0]}.` : full }
export const firstShort = (full: string) => { const p = full.split(' '); return p.length > 1 ? `${p[0]} ${p[1][0]}.` : full }

/** Модальне вікно без JS: закривається посиланням */
export function Modal({ closeHref, title, subtitle, children, narrow }: { closeHref: string; title: string; subtitle?: string; children: React.ReactNode; narrow?: boolean }) {
  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`modal${narrow ? ' narrow' : ''}`}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div><h2>{title}</h2>{subtitle && <div className="muted s13" style={{ marginTop: 4 }}>{subtitle}</div>}</div>
          <Link href={closeHref} className="btn light" aria-label="Закрити" style={{ padding: '6px 12px' }}>×</Link>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor?: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="lbl" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <div className="errmsg" role="alert">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  )
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return <div className="empty"><b>{title}</b>{text}{action && <div style={{ marginTop: 16 }}>{action}</div>}</div>
}

export function PageHead({ title, sub, right, crumbs }: { title: string; sub?: string; right?: React.ReactNode; crumbs?: React.ReactNode }) {
  return (
    <div className="head">
      <div>{crumbs}<h1 className="title">{title}</h1>{sub && <div className="sub">{sub}</div>}</div>
      {right && <div className="row" style={{ flexWrap: 'wrap' }}>{right}</div>}
    </div>
  )
}
