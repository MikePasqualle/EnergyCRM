import { redirect } from 'next/navigation'
import { requireUser } from '@/server/auth'
import { Shell } from '@/components/Shell'
import { SettingsNav } from '@/components/SettingsNav'
import { ModelForm, SecretForm, TelegramForm } from '@/components/AgentSettings'
import { db } from '@/lib/db'
import { can } from '@/server/permissions'
import { MODELS, getAgentConfig, getSecret } from '@/server/agent/config'
import { telegramStatus } from '@/server/agent/telegram'

export const metadata = { title: 'AI-агент і Telegram — EnergyCRM' }
export const dynamic = 'force-dynamic'

export default async function AgentSettingsPage() {
  const user = await requireUser()
  if (!can(user, 'users', 'edit')) redirect('/forbidden')
  const [cfg, users] = await Promise.all([getAgentConfig(), db.user.findMany({ where: { status: 'ACTIVE' }, include: { role: true }, orderBy: { name: 'asc' } })])
  const [claude, voice] = await Promise.all([getSecret('anthropic'), getSecret('openai')])
  const tg = telegramStatus()
  const tgChip = !cfg.tg.token ? <span className="chip c-gray">Не підключено</span>
    : !cfg.tg.enabled ? <span className="chip c-gray">Вимкнено</span>
    : tg.status === 'running' ? <span className="chip c-green">Працює · @{tg.botName ?? cfg.tg.botName}</span>
    : tg.status === 'error' ? <span className="chip c-red">Помилка{tg.error ? `: ${tg.error}` : ''}</span> : <span className="chip c-yellow">Запускається…</span>
  return (
    <Shell user={user} active="settings">
      <div className="head"><div><h1 className="title">Налаштування</h1><div className="sub">AI-агент і Telegram-бот · лише для адміністратора</div></div></div>
      <div className="g resp" style={{ gridTemplateColumns: '230px minmax(0,1fr)', alignItems: 'start' }}>
        <SettingsNav active="agent" user={user} />
        <div className="g">
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}><h3 style={{ margin: 0 }}>Claude API</h3>{claude.value ? <span className="chip c-green">Підключено</span> : <span className="chip c-red">Немає ключа</span>}</div>
            <div className="muted s13" style={{ margin: '6px 0 16px' }}>Ключ із console.anthropic.com. Зберігається в базі зашифрованим і ніколи не показується в інтерфейсі.</div>
            {!process.env.APP_SECRET && <div className="alert warn" style={{ marginBottom: 14 }}>На сервері не задано <b>APP_SECRET</b>: ключі й токен зберігатимуться в базі без шифрування. Задайте його в .env.docker (openssl rand -hex 32) до збереження ключів.</div>}
            <SecretForm name="anthropic" label="Ключ Claude API" placeholder="sk-ant-…" source={claude.source} />
            <div className="sep" />
            <ModelForm models={MODELS} model={cfg.model} effort={cfg.effort} />
            <div className="hint" style={{ marginTop: 12 }}>Агент діє з правами користувача, який з ним працює: чужих клієнтів менеджер не побачить. Усі зміни проходять через підтвердження й записуються в журнал дій.</div>
          </div>
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}><h3 style={{ margin: 0 }}>Telegram-бот</h3>{tgChip}</div>
            <div className="muted s13" style={{ margin: '6px 0 16px' }}>Той самий агент у Telegram: пишіть текстом або надсилайте голосові. Бот відповідає лише одному вашому акаунту. Команди: /act — режим «Дії», /chat — лише читання, /new — нова розмова.</div>
            <TelegramForm tokenSet={!!cfg.tg.token} chatId={cfg.tg.chatId} userId={cfg.tg.userId ?? user.id} enabled={cfg.tg.enabled} users={users.map((u) => ({ id: u.id, name: u.name, role: u.role.name }))} />
          </div>
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}><h3 style={{ margin: 0 }}>Голосові повідомлення</h3>{voice.value ? <span className="chip c-green">Розпізнавання підключено</span> : <span className="chip c-yellow">Потрібен ключ розпізнавання</span>}</div>
            <div className="muted s13" style={{ margin: '6px 0 16px' }}>Голосове з Telegram розпізнається в текст, і агент виконує його як звичайний запит. У відповідь бот показує, що саме розпізнав. Зміни даних голосом теж потребують підтвердження кнопкою.</div>
            <div className="g resp" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div><label className="lbl">Сервіс розпізнавання</label><div className="input">OpenAI ({process.env.TRANSCRIBE_MODEL || 'gpt-4o-transcribe'})</div></div>
              <SecretForm name="openai" label="Ключ OpenAI" placeholder="sk-…" source={voice.source} />
            </div>
            <div className="ag-note" style={{ margin: '14px 0 0' }}>В Anthropic немає власного розпізнавання мовлення, тому для голосу використовується окремий сервіс.</div>
          </div>
        </div>
      </div>
    </Shell>
  )
}
