'use client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/** Випадайка у вигляді піґулі з дизайну («Воронка: Усі ▾»). Нативний <select> лежить зверху прозорим шаром. */
export function SelectPill({ name, label, value, options, width = 190, resetPage = true, disabled }: {
  name: string; label: string; value: string; options: { value: string; label: string }[]; width?: number; resetPage?: boolean; disabled?: boolean
}) {
  const r = useRouter(), path = usePathname(), sp = useSearchParams()
  const cur = options.find((o) => o.value === value)?.label ?? options[0]?.label
  return (
    <label className="input" style={{ width, background: '#fff', cursor: disabled ? 'default' : 'pointer', position: 'relative', opacity: disabled ? 0.7 : 1 }}>
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}{label.endsWith(':') || label === '' ? ' ' : ': '}{cur}</span><span aria-hidden="true">▾</span>
      <select aria-label={label} value={value} disabled={disabled} style={{ position: 'absolute', inset: 0, width: '100%', opacity: 0, cursor: 'pointer' }}
        onChange={(e) => {
          const p = new URLSearchParams(sp.toString())
          if (e.target.value) p.set(name, e.target.value); else p.delete(name)
          if (resetPage) p.delete('page')
          r.push(`${path}${p.toString() ? `?${p}` : ''}`)
        }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}
