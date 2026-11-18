import Link from 'next/link'
import { requireCan } from '@/server/auth'
import { Shell } from '@/components/Shell'
import { FunnelEditor } from '@/components/FunnelEditor'
import { Modal } from '@/components/ui'
import { createFunnel } from '@/app/actions/funnels'
import { db } from '@/lib/db'
import { one, type SP } from '@/lib/url'
import { NewFunnelForm } from './NewFunnelForm'

export const metadata = { title: 'Налаштування воронок — EnergyCRM' }
const plural = (k: number, a: string, b: string, c: string) => { const m10 = k % 10, m100 = k % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c }

export default async function FunnelSettings({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireCan('funnels', 'edit')
  const sp = await searchParams
  const funnels = await db.funnel.findMany({ orderBy: [{ status: 'asc' }, { position: 'asc' }], include: { stages: { orderBy: { position: 'asc' } } } })
  const counts = await db.deal.groupBy({ by: ['stageId'], _count: { _all: true } })
  const cnt = (id: number) => counts.find((c) => c.stageId === id)?._count._all ?? 0
  const funnel = funnels.find((f) => f.id === Number(one(sp.f))) ?? funnels[0]
  const working = (f: (typeof funnels)[number]) => f.stages.filter((s) => s.type === 'WORKING').reduce((a, s) => a + cnt(s.id), 0)

  return (
    <Shell user={user} active="funnels">
      <div className="head">
        <div><div className="s13 sub"><Link href="/funnels" style={{ textDecoration: 'none' }}>Воронки</Link> / Налаштування</div><h1 className="title" style={{ marginTop: 8 }}>Налаштування воронок і етапів</h1><div className="sub">Доступно лише адміністратору</div></div>
      </div>
      <div className="g resp" style={{ gridTemplateColumns: '320px minmax(0,1fr)', alignItems: 'start' }}>
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}><h3 style={{ margin: 0 }}>Воронки</h3><Link className="btn dark" href="/funnels/settings?new=1" style={{ padding: '7px 12px', fontSize: 13 }}>+ Нова</Link></div>
          <div className="g" style={{ gap: 8 }}>
            {funnels.map((f) => {
              const sel = f.id === funnel?.id, arch = f.status === 'ARCHIVED'
              const stagesN = f.stages.filter((s) => s.type !== 'LOST').length, w = working(f)
              return (
                <Link key={f.id} href={`/funnels/settings?f=${f.id}`} style={{ textDecoration: 'none', background: sel ? '#e9f1fd' : undefined, border: sel ? undefined : arch ? '1px dashed #c4cbd8' : '1px solid #e7eaf0', borderRadius: 14, padding: 14, color: arch ? '#586072' : 'inherit' }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}><b>{f.name}</b><span className={`chip ${arch ? 'c-gray' : 'c-green'}`}>{arch ? 'Архів' : 'Активна'}</span></div>
                  <div className="s12 muted" style={{ marginTop: 6 }}>{stagesN} {plural(stagesN, 'етап', 'етапи', 'етапів')} · {w} {arch ? `${plural(w, 'активна угода', 'активні угоди', 'активних угод')}` : plural(w, 'угода', 'угоди', 'угод')}</div>
                </Link>
              )
            })}
          </div>
        </div>
        <div>
          {funnel && <FunnelEditor key={`${funnel.id}-${funnel.stages.map((s) => s.id + s.name + s.position + s.type + s.color).join()}-${funnel.name}-${funnel.status}`} funnelId={funnel.id}
            initial={{ name: funnel.name, description: funnel.description, active: funnel.status === 'ACTIVE', stages: funnel.stages.map((s) => ({ id: s.id, name: s.name, type: s.type, color: s.color, deals: cnt(s.id) })) }} />}
          <div className="card" style={{ marginTop: 16 }}>
            <h3>Типи етапів</h3>
            <div className="g resp" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 }}>
              <div style={{ background: '#eef3fc', borderRadius: 14, padding: 14 }}><span className="chip c-blue">В роботі</span><div className="s13" style={{ marginTop: 8 }}>Угода активна й входить до суми «в роботі» на аналітиці.</div></div>
              <div style={{ background: '#eaf8ef', borderRadius: 14, padding: 14 }}><span className="chip c-green">Виграно</span><div className="s13" style={{ marginTop: 8 }}>Угода закрита успішно; клієнт може отримати статус «дійсний».</div></div>
              <div style={{ background: '#fdeeed', borderRadius: 14, padding: 14 }}><span className="chip c-red">Втрачено</span><div className="s13" style={{ marginTop: 8 }}>Угода закрита без продажу; обов’язкова причина втрати.</div></div>
            </div>
          </div>
        </div>
      </div>
      {one(sp.new) === '1' && (
        <Modal closeHref="/funnels/settings" title="Нова воронка" subtitle="Створюється з базовими етапами — потім їх можна змінити" narrow><NewFunnelForm action={createFunnel} /></Modal>
      )}
    </Shell>
  )
}
