'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Md } from './Md'

type Card = { title: string; rows: [string, string][]; confirm: string }
type Msg = { role: 'me' | 'bot'; text: string; steps?: string[]; live?: boolean }
type Pending = { id: string; card: Card }
type Mode = 'chat' | 'actions'

const Spark = ({ s = 20 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="#0f1115" aria-hidden="true"><path d="M12 2l2.2 6.3L20.5 10l-6.3 2.2L12 18.5l-2.2-6.3L3.5 10l6.3-1.7zM19 15l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" /></svg>

const HINTS: Record<Mode, string[]> = {
  chat: ['Скільки в нас теплих клієнтів і яка сума їхніх угод?', 'Хто з клієнтів не мав контакту понад 14 днів?', 'Підсумок місяця: оплати, виграні й втрачені угоди'],
  actions: ['Додай клієнта: ТОВ «Сонячний Дах», Харків, 063 118 40 22', 'Створи угоду для клієнта…', 'Запиши дзвінок із клієнтом…'],
}

export function AgentPanel({ userName, role }: { userName: string; role: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('chat')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [pending, setPending] = useState<Pending[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [ready, setReady] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const feed = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    try { setOpen(localStorage.getItem('ag-open') === '1'); setMode(localStorage.getItem('ag-mode') === 'actions' ? 'actions' : 'chat') } catch { /* без сховища */ }
    setHydrated(true)
  }, [])
  useEffect(() => {
    document.querySelector('.app')?.classList.toggle('ag-open', open)
    if (hydrated) { try { localStorage.setItem('ag-open', open ? '1' : '0') } catch { /* без сховища */ } }
  }, [open, hydrated])
  useEffect(() => { if (hydrated) { try { localStorage.setItem('ag-mode', mode) } catch { /* без сховища */ } } }, [mode, hydrated])

  const load = useCallback(async () => {
    const r = await fetch('/api/agent/thread', { cache: 'no-store' })
    if (!r.ok) return
    const j = await r.json() as { ready: boolean; messages: Msg[]; pending: Pending[] }
    setReady(j.ready); setLoaded(true)
    if (busyRef.current) return // користувач уже надіслав повідомлення — не затираємо його історією
    setMsgs(j.messages); setPending(j.pending)
  }, [])
  useEffect(() => { if (open && !loaded) void load() }, [open, loaded, load])
  useEffect(() => { feed.current?.scrollTo({ top: feed.current.scrollHeight }) }, [msgs, pending])
  useEffect(() => { if (open) box.current?.focus() }, [open])

  async function send(raw: string) {
    const t = raw.trim()
    if (!t || busy) return
    setText(''); setBusy(true); busyRef.current = true
    setMsgs((m) => [...m, { role: 'me', text: t }, { role: 'bot', text: '', steps: [], live: true }])
    const upd = (f: (b: Msg) => Msg) => setMsgs((m) => { if (!m.length) return m; const c = [...m]; c[c.length - 1] = f(c[c.length - 1]); return c })
    try {
      const r = await fetch('/api/agent/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t, mode }) })
      if (!r.ok || !r.body) { const j = await r.json().catch(() => ({})) as { error?: string }; upd((b) => ({ ...b, text: j.error ?? 'Не вдалося звернутися до агента', live: false })); return }
      const rd = r.body.getReader(), dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { value, done } = await rd.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let ix: number
        while ((ix = buf.indexOf('\n\n')) >= 0) {
          const line = buf.slice(0, ix).replace(/^data: /, ''); buf = buf.slice(ix + 2)
          let e: { type: string; delta?: string; label?: string; message?: string; id?: string; card?: Card }
          try { e = JSON.parse(line) } catch { continue }
          if (e.type === 'text') upd((b) => ({ ...b, text: b.text + e.delta }))
          else if (e.type === 'step') upd((b) => ({ ...b, steps: [...(b.steps ?? []), e.label ?? ''] }))
          else if (e.type === 'pending' && e.id && e.card) setPending((p) => [...p, { id: e.id!, card: e.card! }])
          else if (e.type === 'error') upd((b) => ({ ...b, text: (b.text ? b.text + '\n\n' : '') + `**${e.message}**` }))
        }
      }
    } catch {
      upd((b) => ({ ...b, text: b.text || 'Звʼязок із сервером перервано. Спробуйте ще раз.' }))
    } finally {
      upd((b) => ({ ...b, live: false })); setBusy(false); busyRef.current = false; box.current?.focus(); router.refresh()
    }
  }

  async function decide(p: Pending, approve: boolean) {
    setPending((x) => x.filter((y) => y.id !== p.id))
    const r = await fetch('/api/agent/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, approve }) })
    const j = await r.json().catch(() => ({ ok: false, message: 'Помилка звʼязку' })) as { ok: boolean; message: string; href?: string }
    setMsgs((m) => [...m, { role: 'bot', text: `${j.ok ? (approve ? 'Готово' : 'Скасовано') : 'Не виконано'}${approve || !j.ok ? ': ' : '. '}${approve || !j.ok ? j.message : 'Нічого не змінено.'}${j.ok && approve && j.href ? ` [Відкрити](${j.href})` : ''}` }])
    router.refresh()
  }

  async function newChat() {
    if (busy) return
    await fetch('/api/agent/thread', { method: 'POST' })
    setMsgs([]); setPending([])
  }

  if (!open) return <button className="ag-fab" onClick={() => setOpen(true)} aria-label="Відкрити AI-агента"><span className="ag-spark"><Spark /></span>Запитати AI</button>

  return (
    <aside className="ag" aria-label="AI-агент">
      <div className="ag-head">
        <div className="ag-spark"><Spark /></div>
        <div style={{ flex: 1, minWidth: 0 }}><div className="ag-ttl">AI-агент</div><div className="ag-sub">Claude · діє з правами «{role}»</div></div>
        <button className="ag-iconbtn" onClick={newChat} aria-label="Нова розмова" title="Нова розмова"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10131a" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
        <button className="ag-iconbtn" onClick={() => setOpen(false)} aria-label="Закрити панель">×</button>
      </div>
      <div className="ag-modes"><div className="seg" role="group" aria-label="Режим агента">
        <button type="button" className={mode === 'chat' ? 'on' : ''} aria-pressed={mode === 'chat'} onClick={() => setMode('chat')}>Чат</button>
        <button type="button" className={mode === 'actions' ? 'on' : ''} aria-pressed={mode === 'actions'} onClick={() => setMode('actions')}>Дії</button>
      </div></div>
      {mode === 'chat'
        ? <div className="ag-note">Режим «Чат»: агент лише читає дані CRM — шукає, рахує, порівнює. Нічого не змінює.</div>
        : <div className="ag-note act">Режим «Дії»: агент може створювати й змінювати записи, але кожну зміну виконує лише після вашого підтвердження.</div>}

      <div className="ag-feed" ref={feed} aria-live="polite">
        {!ready && <div className="alert warn">Агент не налаштований: на сервері не задано ключ Claude API (ANTHROPIC_API_KEY).</div>}
        {loaded && !msgs.length && (
          <div>
            <div className="ag-bubble"><p><b>Привіт, {userName.split(' ')[0]}.</b> Запитайте про клієнтів, угоди чи аналітику — або доручіть зміну в режимі «Дії».</p></div>
            <div className="ag-chips">{HINTS[mode].map((h) => <button key={h} className="ag-chipbtn" onClick={() => void send(h)}>{h}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => m.role === 'me'
          ? <div key={i} className="ag-msg me">{m.text}</div>
          : (
            <div key={i} className="ag-msg bot">
              {!!m.steps?.length && <div className="ag-steps">{[...new Set(m.steps)].map((s) => <span key={s} className="ag-step">✓ {s}</span>)}</div>}
              {(m.text || m.live) && <div className="ag-bubble">{m.text ? <Md text={m.text} /> : <span className="ag-dots" aria-label="Агент думає"><i /><i /><i /></span>}</div>}
            </div>
          ))}
        {pending.map((p) => (
          <div key={p.id} className="ag-card">
            <h5>{p.card.title}</h5>
            <dl className="ag-kv">{p.card.rows.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
            <div className="ag-acts"><button className="btn dark sm" onClick={() => void decide(p, true)}>{p.card.confirm}</button><button className="btn line sm" onClick={() => void decide(p, false)}>Скасувати</button></div>
          </div>
        ))}
      </div>

      <form className="ag-compose" onSubmit={(e) => { e.preventDefault(); void send(text) }}>
        <div className="ag-box">
          <textarea ref={box} rows={1} value={text} disabled={!ready} aria-label="Повідомлення агенту" maxLength={4000}
            placeholder={mode === 'chat' ? 'Запитайте про клієнтів, угоди, аналітику…' : 'Напишіть, що змінити або додати…'}
            onChange={(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px' }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(text) } }} />
          <button className="ag-send" disabled={busy || !text.trim() || !ready} aria-label="Надіслати"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg></button>
        </div>
        <div className="ag-hint">Enter — надіслати · Shift+Enter — новий рядок</div>
      </form>
    </aside>
  )
}
