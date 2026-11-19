'use client'
import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { disconnectTelegram, removeSecretKey, saveAgentModel, saveSecretKey, saveTelegramSettings, testTelegram, type AgentFormState } from '@/app/actions/agent'

const note = (s: AgentFormState) => (s?.error ? <div className="alert bad" role="alert" style={{ marginTop: 12 }}>{s.error}</div> : s?.ok ? <div className="alert ok" role="status" style={{ marginTop: 12 }}>{s.ok}</div> : null)

export function ModelForm({ models, model, effort }: { models: readonly { id: string; label: string }[]; model: string; effort: string }) {
  const [m, setM] = useState(model), [e, setE] = useState(effort)
  const [res, setRes] = useState<AgentFormState>()
  const [p, start] = useTransition()
  const r = useRouter()
  return (
    <div>
      <div className="g resp" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div><label className="lbl" htmlFor="ag-model">Модель</label>
          <select id="ag-model" className="input" value={m} onChange={(x) => setM(x.target.value)}>{models.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></div>
        <div><label className="lbl" id="ag-eff">Глибина міркування</label>
          <div className="seg sm" role="group" aria-labelledby="ag-eff" style={{ background: '#eef1f5' }}>
            {([['low', 'Низька'], ['medium', 'Середня'], ['high', 'Висока']] as const).map(([k, l]) => <button key={k} type="button" className={e === k ? 'on' : ''} aria-pressed={e === k} onClick={() => setE(k)}>{l}</button>)}
          </div></div>
      </div>
      <div className="row" style={{ marginTop: 14 }}><button className="btn dark sm" disabled={p} onClick={() => start(async () => { setRes(await saveAgentModel(m, e)); r.refresh() })}>Зберегти</button></div>
      {note(res)}
    </div>
  )
}

export function TelegramForm({ tokenSet, chatId, userId, enabled, users }: { tokenSet: boolean; chatId: string; userId: number; enabled: boolean; users: { id: number; name: string; role: string }[] }) {
  const [state, action, pending] = useActionState(saveTelegramSettings, undefined)
  const [res, setRes] = useState<AgentFormState>()
  const [busy, start] = useTransition()
  const r = useRouter()
  return (
    <form action={action}>
      <div className="g resp" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div><label className="lbl" htmlFor="tg-token">Токен бота (від @BotFather)</label>
          <input id="tg-token" name="token" className="input" type="password" autoComplete="off" spellCheck={false} placeholder={tokenSet ? 'Збережено — введіть новий, щоб замінити' : '123456789:AA…'} />
          <div className="hint">{tokenSet ? 'Збережений токен не показується' : 'Створіть бота в @BotFather командою /newbot'}</div></div>
        <div><label className="lbl" htmlFor="tg-id">Telegram ID дозволеного акаунта</label>
          <input id="tg-id" name="chatId" className="input num" inputMode="numeric" defaultValue={chatId} placeholder="482917305" required />
          <div className="hint">Свій ID можна дізнатися в @userinfobot. Усі інші акаунти ігноруються.</div></div>
        <div><label className="lbl" htmlFor="tg-user">Від імені користувача CRM</label>
          <select id="tg-user" name="userId" className="input" defaultValue={userId}>{users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.role}</option>)}</select>
          <div className="hint">Права й видимість клієнтів — як у цього користувача</div></div>
        <label className="row" style={{ gap: 12, alignSelf: 'center', cursor: 'pointer' }}><input type="checkbox" name="enabled" defaultChecked={enabled || !tokenSet} style={{ width: 18, height: 18 }} /><span className="s13 b">Бот увімкнено</span></label>
      </div>
      <div className="row" style={{ marginTop: 18, flexWrap: 'wrap' }}>
        <button className="btn dark" disabled={pending}>{pending ? 'Підключаємо…' : 'Зберегти й підключити'}</button>
        <button type="button" className="btn line" disabled={busy || !tokenSet} onClick={() => start(async () => setRes(await testTelegram()))}>Надіслати тестове повідомлення</button>
        <button type="button" className="btn danger" disabled={busy || !tokenSet} onClick={() => { if (confirm('Відключити бота й видалити токен?')) start(async () => { setRes(await disconnectTelegram()); r.refresh() }) }}>Відключити бота</button>
      </div>
      {note(state ?? res)}
    </form>
  )
}

export function SecretForm({ name, label, placeholder, source }: { name: 'anthropic' | 'openai'; label: string; placeholder: string; source: 'settings' | 'env' | null }) {
  const [v, setV] = useState('')
  const [res, setRes] = useState<AgentFormState>()
  const [p, start] = useTransition()
  const r = useRouter()
  const id = `sec-${name}`
  return (
    <div>
      <label className="lbl" htmlFor={id}>{label}</label>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <input id={id} className="input" type="password" autoComplete="off" spellCheck={false} value={v} onChange={(e) => setV(e.target.value)} style={{ flex: '1 1 260px', width: 'auto' }}
          placeholder={source === 'settings' ? 'Збережено — введіть новий, щоб замінити' : source === 'env' ? 'Задано на сервері — введіть, щоб перекрити' : placeholder} />
        <button type="button" className="btn dark" disabled={p || !v.trim()} onClick={() => start(async () => { const x = await saveSecretKey(name, v); setRes(x); if (x?.ok) { setV(''); r.refresh() } })}>Зберегти</button>
        {source === 'settings' && <button type="button" className="btn danger" disabled={p} onClick={() => { if (confirm('Видалити збережений ключ?')) start(async () => { setRes(await removeSecretKey(name)); r.refresh() }) }}>Видалити</button>}
      </div>
      <div className="hint">{source === 'settings' ? 'Ключ збережено зашифрованим і не показується' : source === 'env' ? 'Зараз використовується ключ зі змінної середовища сервера' : 'Ключ ще не додано'}</div>
      {note(res)}
    </div>
  )
}
