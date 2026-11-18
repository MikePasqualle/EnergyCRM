'use client'
import { useEffect, useRef, useState } from 'react'

type Hit = { id: number; name: string; city: string | null; phone: string }
export function ClientPicker({ name = 'clientId', initial, error }: { name?: string; initial?: { id: number; name: string } | null; error?: string }) {
  const [q, setQ] = useState(initial?.name ?? '')
  const [sel, setSel] = useState<number | null>(initial?.id ?? null)
  const [hits, setHits] = useState<Hit[]>([])
  const [open, setOpen] = useState(false)
  const t = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    if (sel && q === initial?.name) return
    clearTimeout(t.current)
    t.current = setTimeout(async () => {
      if (q.trim().length < 2) { setHits([]); return }
      const r = await fetch(`/api/clients/search?q=${encodeURIComponent(q)}`)
      if (r.ok) setHits(await r.json())
    }, 200)
    return () => clearTimeout(t.current)
  }, [q, sel, initial?.name])
  return (
    <div style={{ position: 'relative' }}>
      <input type="hidden" name={name} value={sel ?? ''} />
      <input className={`input${error ? ' err' : ''}`} id={`${name}-q`} role="combobox" aria-expanded={open} aria-autocomplete="list" autoComplete="off" placeholder="Почніть вводити назву, телефон або email…" value={q}
        onChange={(e) => { setQ(e.target.value); setSel(null); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && hits.length > 0 && !sel && (
        <ul role="listbox" style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: 46, margin: 0, padding: 6, listStyle: 'none', background: '#fff', borderRadius: 14, boxShadow: '0 12px 30px rgba(30,60,110,.2)' }}>
          {hits.map((h) => (
            <li key={h.id} role="option" aria-selected={false}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); setSel(h.id); setQ(h.name); setOpen(false) }} style={{ width: '100%', textAlign: 'left', padding: '9px 12px', border: 0, background: 'none', borderRadius: 10, cursor: 'pointer', font: '500 14px Inter,system-ui,sans-serif' }}>
                <b>{h.name}</b><span className="s12 muted"> · {h.city ?? '—'} · {h.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
