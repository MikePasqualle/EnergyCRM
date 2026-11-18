'use client'
import { useEffect, useRef, useState } from 'react'
import { signOut } from '@/app/actions/session'

/** FR-1.5: попередження й автоматичний вихід після неактивності */
export function IdleGuard({ idleMin }: { idleMin: number }) {
  const [left, setLeft] = useState<number | null>(null)
  const last = useRef(Date.now())
  const WARN = 60 // секунд до виходу

  useEffect(() => {
    const touch = () => { if (left === null) last.current = Date.now() }
    const ev = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    ev.forEach((e) => window.addEventListener(e, touch, { passive: true }))
    const t = setInterval(async () => {
      const idle = (Date.now() - last.current) / 1000
      const total = idleMin * 60
      if (idle >= total) { await signOut(); return }
      if (idle >= total - WARN) setLeft(Math.ceil(total - idle))
      else if (idle > 0 && Math.floor(idle) % 600 === 0) fetch('/api/ping').catch(() => {})
    }, 1000)
    return () => { ev.forEach((e) => window.removeEventListener(e, touch)); clearInterval(t) }
  }, [left, idleMin])

  if (left === null) return null
  return (
    <div className="modal-bg" role="alertdialog" aria-modal="true" aria-labelledby="idle-t">
      <div className="modal narrow" style={{ marginTop: 120, textAlign: 'center' }}>
        <h2 id="idle-t">Ви ще тут?</h2>
        <p className="muted s13" style={{ margin: '8px 0 22px' }}>Через {left} с ви автоматично вийдете з системи через неактивність.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn dark" onClick={() => { fetch('/api/ping'); last.current = Date.now(); setLeft(null) }}>Залишитись</button>
          <button className="btn light" onClick={() => signOut()}>Вийти</button>
        </div>
      </div>
    </div>
  )
}
