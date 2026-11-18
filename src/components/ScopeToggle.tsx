'use client'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { setScope } from '@/app/actions/session'

export function ScopeToggle({ scope, canTeam }: { scope: 'mine' | 'team'; canTeam: boolean }) {
  const r = useRouter()
  const [pending, start] = useTransition()
  const pick = (s: 'mine' | 'team') => start(async () => { await setScope(s); r.refresh() })
  return (
    <div className="seg" role="group" aria-label="Область даних" style={{ opacity: pending ? 0.6 : 1 }}>
      <button type="button" className={scope === 'mine' ? 'on' : ''} onClick={() => pick('mine')}
        style={{ border: 0, background: scope === 'mine' ? '#0f1115' : 'none', color: scope === 'mine' ? '#fff' : '#444b59', padding: '8px 16px', borderRadius: 999, font: '600 13px Inter,system-ui,sans-serif', cursor: 'pointer' }}>Мої</button>
      <button type="button" disabled={!canTeam} title={canTeam ? '' : 'Доступно, якщо адмін дозволив бачити всіх клієнтів'} onClick={() => pick('team')}
        style={{ border: 0, background: scope === 'team' ? '#0f1115' : 'none', color: scope === 'team' ? '#fff' : '#444b59', padding: '8px 16px', borderRadius: 999, font: '600 13px Inter,system-ui,sans-serif', cursor: canTeam ? 'pointer' : 'not-allowed', opacity: canTeam ? 1 : 0.5 }}>Команда</button>
    </div>
  )
}
