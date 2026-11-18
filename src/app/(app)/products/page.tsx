import Link from 'next/link'
import { requireCan } from '@/server/auth'
import { Shell } from '@/components/Shell'
import { ProductEditor } from '@/components/ProductEditor'
import { db } from '@/lib/db'
import { can } from '@/server/permissions'
import { n } from '@/lib/format'
import { one, type SP } from '@/lib/url'

export const metadata = { title: 'Продукти — EnergyCRM' }
const GRP = { A: ['А', 'c-purple'], B: ['Б', 'c-blue'], BOTH: ['А і Б', 'c-gray'] } as const

export default async function Products({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireCan('products')
  const sp = await searchParams
  const tab = one(sp.t) === 'archive' ? 'ARCHIVED' : 'ACTIVE'
  const [products, counts, dealCounts] = await Promise.all([
    db.product.findMany({ where: { status: tab }, orderBy: { name: 'asc' } }),
    db.product.groupBy({ by: ['status'], _count: { _all: true } }),
    db.deal.groupBy({ by: ['productId'], _count: { _all: true } }),
  ])
  const cnt = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0
  const isNew = one(sp.new) === '1' && can(user, 'products', 'create')
  const sel = isNew ? null : products.find((p) => p.id === Number(one(sp.p))) ?? products[0]
  const archived = await db.product.findMany({ where: { status: 'ARCHIVED' }, select: { name: true } })

  return (
    <Shell user={user} active="products">
      <div className="head">
        <div><h1 className="title">Продукти</h1><div className="sub">Тарифні пропозиції, які підставляються в угоди · редагує лише адміністратор</div></div>
        {can(user, 'products', 'create') && <Link className="btn dark" href="/products?new=1" style={{ height: 46, padding: '0 22px' }}>+ Додати продукт</Link>}
      </div>
      <div className="g resp" style={{ gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,1fr)', alignItems: 'start' }}>
        <div className="card" style={{ padding: '8px 8px 4px' }}>
          <div className="row" style={{ padding: '12px 12px 4px', gap: 10 }}>
            <div className="subtabs" style={{ background: '#eef1f5' }}><Link className={tab === 'ACTIVE' ? 'on' : ''} href="/products">Активні · {cnt('ACTIVE')}</Link><Link className={tab === 'ARCHIVED' ? 'on' : ''} href="/products?t=archive">Архів · {cnt('ARCHIVED')}</Link></div>
          </div>
          <div className="scroll-x"><table className="tbl">
            <thead><tr><th>Продукт</th><th>Тарифна модель</th><th style={{ textAlign: 'right' }}>Ціна, ₴/МВт·год</th><th>Група</th><th style={{ textAlign: 'right' }}>Угод</th><th>Статус</th></tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} style={p.id === sel?.id ? { background: '#f1f6fe' } : undefined}>
                  <td><Link href={`/products?p=${p.id}${tab === 'ARCHIVED' ? '&t=archive' : ''}`} style={{ textDecoration: 'none' }}><b>{p.name}</b></Link><div className="s12 muted">Термін {p.termMonths} міс.</div></td>
                  <td className="s13">{p.tariffModel}</td><td className="num b" style={{ textAlign: 'right' }}>{n(Number(p.price))}</td>
                  <td><span className={`chip ${GRP[p.group][1]}`}>{GRP[p.group][0]}</span></td>
                  <td className="num" style={{ textAlign: 'right' }}>{dealCounts.find((d) => d.productId === p.id)?._count._all ?? 0}</td>
                  <td><span className={`chip ${p.status === 'ACTIVE' ? 'c-green' : 'c-gray'}`}>{p.status === 'ACTIVE' ? 'Активний' : 'В архіві'}</span></td>
                </tr>
              ))}
              {!products.length && <tr><td colSpan={6} className="muted">Продуктів немає</td></tr>}
            </tbody>
          </table></div>
          {archived.length > 0 && tab === 'ACTIVE' && <div className="s12 muted" style={{ padding: 12 }}>Архівний продукт «{archived[0].name}» не пропонується для нових угод, але лишається в історичних.</div>}
        </div>
        <ProductEditor key={sel?.id ?? 'new'} canEdit={can(user, 'products', sel ? 'edit' : 'create')} cancelHref="/products"
          init={sel ? { id: sel.id, name: sel.name, description: sel.description, price: String(Number(sel.price)), tariffModel: sel.tariffModel, termMonths: String(sel.termMonths), minVolumeMwh: String(sel.minVolumeMwh), group: sel.group, terms: sel.terms, archived: sel.status === 'ARCHIVED' }
            : { id: null, name: '', description: '', price: '', tariffModel: 'Фіксована', termMonths: '12', minVolumeMwh: '0', group: 'BOTH', terms: '', archived: false }} />
      </div>
    </Shell>
  )
}
