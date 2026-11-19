import 'server-only'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { can, sees_all, type SessionUser } from '@/server/permissions'
import { canAccessClient, canAccessDeal, clientWhere, dealWhere } from '@/server/access'
import { dashboard, managersReport } from '@/server/analytics'
import { parsePeriod } from '@/server/period'
import { findDuplicates } from '@/server/dupes'
import { insertDeal, moveDealCore } from '@/server/dealsCore'
import { commSchema, insertClient, insertCommunication, updateClientCore, validateClient, type ClientInput } from '@/server/clientsCore'
import { dShortY, n, uah } from '@/lib/format'

export type Mode = 'chat' | 'actions'
export type ToolCtx = { u: SessionUser; mode: Mode; threadId: number }
export type Card = { title: string; rows: [string, string][]; confirm: string }
export type Outcome = { content: unknown; pending?: { id: string; card: Card } }

export const STEP_LABELS: Record<string, string> = {
  get_reference_data: 'Довідники', get_form_requirements: 'Форма введення', search_clients: 'Пошук клієнтів', get_client: 'Картка клієнта',
  search_deals: 'Пошук угод', get_analytics: 'Аналітика', get_managers_report: 'Звіт менеджерів', find_duplicates: 'Перевірка дублікатів',
  create_client: 'Підготовка клієнта', update_client: 'Підготовка змін клієнта', create_deal: 'Підготовка угоди', move_deal: 'Підготовка переходу етапу', add_communication: 'Підготовка запису комунікації',
}

const STATUS_UA = { COLD: 'Холодний', WARM: 'Теплий', ACTIVE: 'Дійсний' } as const
const TYPE_UA = { COMPANY: 'Юридична особа', FOP: 'ФОП', PERSON: 'Фізична особа' } as const
const STAGE_UA = { WORKING: 'в роботі', WON: 'виграно', LOST: 'втрачено' } as const
const num = (v: unknown) => Number(v)
const day = (d: Date | null) => (d ? dShortY(d) : null)
const daysAgo = (d: Date | null) => (d ? Math.floor((Date.now() - d.getTime()) / 864e5) : null)

/* ===================== Опис інструментів для моделі ===================== */
const str = (description: string) => ({ type: 'string', description })
const int = (description: string) => ({ type: 'integer', description })
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false })

export const TOOLS = [
  { name: 'get_reference_data', description: 'Довідники CRM: активні менеджери (id, імʼя), воронки з етапами, продукти, джерела, канали комунікації, постачальники. Викликай перед створенням клієнта чи угоди, щоб знати допустимі значення та id.', input_schema: obj({}) },
  { name: 'get_form_requirements', description: 'Опис флоу введення: які поля обовʼязкові й необовʼязкові для створення клієнта, угоди, запису комунікації, зміни етапу. Викликай перед будь-якою зміною даних, щоб знати, чого може не вистачати.', input_schema: obj({ entity: { type: 'string', enum: ['client', 'deal', 'communication', 'deal_stage'] } }, ['entity']) },
  { name: 'search_clients', description: 'Пошук клієнтів у реєстрі за фільтрами (лише ті, що доступні користувачу). Повертає до 25 рядків і загальну кількість. Для підрахунків використовуй total.', input_schema: obj({
    query: str('Частина назви, ПІБ, телефону, email або ЄДРПОУ'), status: { type: 'string', enum: ['COLD', 'WARM', 'ACTIVE'] }, city: str('Місто (точний збіг без регістру)'),
    group: { type: 'string', enum: ['A', 'B'], description: 'Група споживача серед систем клієнта' }, manager_id: int('id менеджера'),
    no_contact_days: int('Лише клієнти без контакту понад N днів (або взагалі без контактів)'), has_active_deals: { type: 'boolean', description: 'true — лише з активними угодами; false — без них' },
    limit: int('Скільки рядків повернути, до 25 (типово 15)'),
  }) },
  { name: 'get_client', description: 'Повна картка клієнта: контакти, менеджер, системи (обʼєкти), угоди, останні комунікації.', input_schema: obj({ client_id: int('id клієнта') }, ['client_id']) },
  { name: 'search_deals', description: 'Пошук угод. Повертає до 25 рядків, загальну кількість і суму за місяць (amount) по всіх знайдених.', input_schema: obj({
    client_id: int('id клієнта'), funnel_id: int('id воронки'), stage_type: { type: 'string', enum: ['WORKING', 'WON', 'LOST'] }, owner_id: int('id менеджера-власника'),
    min_amount: { type: 'number', description: 'Мінімальна сума за місяць, ₴' }, limit: int('До 25 (типово 15)'),
  }) },
  { name: 'get_analytics', description: 'Показники аналітики за період: клієнти за статусами, угоди в роботі, виграно/втрачено, оплачено, воронка по етапах, споживання, комунікації менеджерів.', input_schema: obj({
    period: { type: 'string', enum: ['week', 'month', 'quarter', 'range'], description: 'Типово month (поточний місяць)' }, from: str('YYYY-MM-DD для period=range'), to: str('YYYY-MM-DD для period=range'),
    manager_id: int('Лише один менеджер (адміністратор); решта користувачів бачать тільки свої дані'), funnel_id: int('id воронки'),
  }) },
  { name: 'get_managers_report', description: 'Звіт по менеджерах за період: клієнти, дзвінки, листи, зустрічі, угоди в роботі, виграно, втрачено, сума виграних. Лише для користувачів з доступом до всього реєстру.', input_schema: obj({
    period: { type: 'string', enum: ['week', 'month', 'quarter', 'range'] }, from: str('YYYY-MM-DD'), to: str('YYYY-MM-DD'), funnel_id: int('id воронки'),
  }) },
  { name: 'find_duplicates', description: 'Перевірка, чи вже є клієнт з таким телефоном або email.', input_schema: obj({ phone: str('Телефон'), email: str('Email') }) },
  { name: 'create_client', description: 'ПІДГОТУВАТИ створення клієнта (опційно з основним обʼєктом і одразу угодою). Нічого не створює: повертає картку, яку користувач має підтвердити кнопкою. Якщо чогось бракує — повертає missing; тоді запитай користувача, не вгадуй.', input_schema: obj({
    type: { type: 'string', enum: ['COMPANY', 'FOP', 'PERSON'], description: 'Юр. особа / ФОП / фіз. особа' }, name: str('Назва компанії або ПІБ'), phone: str('Телефон'), manager_id: int('id менеджера (обовʼязково для адміністратора)'),
    edrpou: str('ЄДРПОУ або РНОКПП'), contact_person: str('Контактна особа'), email: str('Email'), city: str('Місто'), address: str('Адреса'),
    status: { type: 'string', enum: ['COLD', 'WARM', 'ACTIVE'], description: 'Типово COLD' }, source: str('Джерело — зі словника'),
    group: { type: 'string', enum: ['A', 'B'], description: 'Група споживача' }, supplier_id: int('id поточного постачальника'),
    gen_type: str('Тип власної генерації'), gen_power_kw: { type: 'number' }, gen_mode: str('Режим генерації'),
    funnel_id: int('Щоб одразу створити угоду: воронка'), product_id: int('Продукт'), volume_mwh: { type: 'number', description: 'Очікуваний річний обсяг, МВт·год' },
    force_duplicate: { type: 'boolean', description: 'true лише після явного рішення користувача зберегти попри дублікат' },
  }, ['type', 'name', 'phone']) },
  { name: 'update_client', description: 'ПІДГОТУВАТИ зміну даних клієнта (назва, телефон, статус, місто тощо). Менеджера цим інструментом змінити не можна. Потребує підтвердження користувача.', input_schema: obj({
    client_id: int('id клієнта'), name: str(''), phone: str(''), email: str(''), edrpou: str(''), contact_person: str(''), city: str(''), address: str(''), source: str(''),
    status: { type: 'string', enum: ['COLD', 'WARM', 'ACTIVE'] }, type: { type: 'string', enum: ['COMPANY', 'FOP', 'PERSON'] }, force_duplicate: { type: 'boolean' },
  }, ['client_id']) },
  { name: 'create_deal', description: 'ПІДГОТУВАТИ нову угоду для існуючого клієнта (на першому етапі «в роботі»). Сума за місяць = обсяг × ціна ÷ 12, якщо amount не задано. Потребує підтвердження.', input_schema: obj({
    client_id: int('id клієнта'), funnel_id: int('id воронки'), product_id: int('id продукту'), volume_mwh: { type: 'number', description: 'Очікуваний річний обсяг, МВт·год' }, amount: { type: 'number', description: 'Сума за місяць, ₴ (за потреби)' }, note: str('Нотатка'),
  }, ['client_id', 'funnel_id', 'product_id', 'volume_mwh']) },
  { name: 'move_deal', description: 'ПІДГОТУВАТИ перенесення угоди на інший етап тієї ж воронки. Для етапу типу «втрачено» потрібна причина (lost_reason, зі словника причин). Потребує підтвердження.', input_schema: obj({
    deal_id: int('id угоди (не номер)'), stage_id: int('id цільового етапу'), lost_reason: str('Причина втрати'),
  }, ['deal_id', 'stage_id']) },
  { name: 'add_communication', description: 'ПІДГОТУВАТИ запис про комунікацію з клієнтом (дзвінок, лист, зустріч…). Потребує підтвердження.', input_schema: obj({
    client_id: int('id клієнта'), channel: str('Канал зі словника каналів (Дзвінок, Лист, Зустріч …)'), summary: str('Про що домовились'),
  }, ['client_id', 'channel', 'summary']) },
] as const

/* ===================== Допоміжне ===================== */
const cut = (v: unknown, max = 14000) => {
  const s = JSON.stringify(v)
  return s.length > max ? s.slice(0, max) + '…[скорочено]' : s
}
const need = (ctx: ToolCtx, section: string, action: 'view' | 'create' | 'edit') => {
  if (!can(ctx.u, section, action)) throw new UserError(`Недостатньо прав: розділ «${section}», дія «${action}»`)
}
export class UserError extends Error {}

function schemaFields(p: z.ZodError) {
  const f: Record<string, string> = {}
  p.issues.forEach((i) => { f[String(i.path[0])] = i.message })
  return f
}

async function activeManagers(u: SessionUser) {
  return db.user.findMany({
    where: { status: 'ACTIVE', ...(sees_all(u) ? { role: { isAdmin: false } } : { id: u.id }) },
    select: { id: true, name: true }, orderBy: { name: 'asc' },
  })
}

/* ===================== Читання ===================== */
const READ: Record<string, (ctx: ToolCtx, input: Record<string, unknown>) => Promise<unknown>> = {
  async get_reference_data(ctx) {
    const [managers, funnels, products, dicts, suppliers] = await Promise.all([
      activeManagers(ctx.u),
      can(ctx.u, 'funnels', 'view') ? db.funnel.findMany({ where: { status: 'ACTIVE' }, orderBy: { position: 'asc' }, include: { stages: { orderBy: { position: 'asc' } } } }) : [],
      can(ctx.u, 'products', 'view') ? db.product.findMany({ where: { status: 'ACTIVE' }, orderBy: { name: 'asc' } }) : [],
      db.dictionary.findMany({ orderBy: [{ kind: 'asc' }, { position: 'asc' }] }),
      db.supplier.findMany({ where: { status: 'ACTIVE' }, orderBy: { name: 'asc' } }),
    ])
    const dk = (k: string) => dicts.filter((d) => d.kind === k).map((d) => d.name)
    return {
      managers,
      funnels: funnels.map((f) => ({ id: f.id, name: f.name, stages: f.stages.map((s) => ({ id: s.id, name: s.name, type: s.type })) })),
      products: products.map((p) => ({ id: p.id, name: p.name, price_uah_per_mwh: num(p.price), group: p.group, min_volume_mwh: p.minVolumeMwh, term_months: p.termMonths })),
      sources: dk('SOURCE'), communication_channels: dk('CHANNEL'), loss_reasons: dk('LOSS_REASON'), object_types: dk('OBJECT_TYPE'),
      suppliers: suppliers.map((s) => ({ id: s.id, name: s.name })),
    }
  },

  async get_form_requirements(_ctx, input) {
    const e = String(input.entity)
    const forms: Record<string, unknown> = {
      client: {
        required: ['type (COMPANY | FOP | PERSON)', 'name — назва або ПІБ', 'phone — формат +380XXXXXXXXX', 'manager_id — закріплений менеджер (користувач без доступу до всього реєстру закріплюється за собою автоматично)'],
        optional: ['edrpou', 'contact_person', 'email', 'city', 'address', 'status (типово COLD)', 'source — зі словника', 'group A/B', 'supplier_id', 'gen_type + gen_power_kw + gen_mode — разом, якщо є власна генерація'],
        optional_deal: 'Щоб одразу створити угоду потрібні разом: funnel_id, product_id, volume_mwh',
        rules: ['Перед створенням перевіряється дублікат за телефоном/email — при збігу потрібне рішення користувача (відкрити існуючого, обʼєднати або зберегти все одно)', 'Дані потрапляють у журнал дій'],
      },
      deal: {
        required: ['client_id', 'funnel_id (активна)', 'product_id (не архівний)', 'volume_mwh > 0'],
        optional: ['amount — інакше обсяг × ціна ÷ 12', 'note'],
        rules: ['Угода створюється на першому етапі «в роботі»', 'Ціна продукту фіксується в угоді'],
      },
      communication: { required: ['client_id', 'channel (зі словника каналів)', 'summary'], optional: [], rules: ['Оновлює дату останнього контакту клієнта'] },
      deal_stage: { required: ['deal_id', 'stage_id (етап тієї ж воронки)'], optional: ['lost_reason — обовʼязкова для етапу «втрачено»'], rules: ['Кожен перехід записується в історію угоди'] },
    }
    return forms[e] ?? { error: 'Невідома сутність' }
  },

  async search_clients(ctx, input) {
    need(ctx, 'clients', 'view')
    const and: Prisma.ClientWhereInput[] = [clientWhere(ctx.u, 'team')]
    const q = typeof input.query === 'string' ? input.query.trim() : ''
    if (q) {
      const digits = q.replace(/\D/g, '')
      and.push({ OR: [
        { name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { contactPerson: { contains: q, mode: 'insensitive' } }, { edrpou: { contains: q } },
        ...(digits.length >= 4 ? [{ phoneNorm: { contains: digits } }] : []),
      ] })
    }
    if (input.status) and.push({ status: input.status as 'COLD' | 'WARM' | 'ACTIVE' })
    if (typeof input.city === 'string' && input.city.trim()) and.push({ city: { equals: input.city.trim(), mode: 'insensitive' } })
    if (input.group) and.push({ systems: { some: { group: input.group as 'A' | 'B' } } })
    if (input.manager_id) and.push({ managerId: num(input.manager_id) })
    if (input.no_contact_days) and.push({ OR: [{ lastContactAt: null }, { lastContactAt: { lt: new Date(Date.now() - num(input.no_contact_days) * 864e5) } }] })
    if (input.has_active_deals === true) and.push({ deals: { some: { stage: { type: 'WORKING' } } } })
    if (input.has_active_deals === false) and.push({ deals: { none: { stage: { type: 'WORKING' } } } })
    const where: Prisma.ClientWhereInput = { AND: and }
    const limit = Math.min(Math.max(num(input.limit) || 15, 1), 25)
    const [total, rows] = await Promise.all([
      db.client.count({ where }),
      db.client.findMany({ where, take: limit, orderBy: { lastContactAt: { sort: 'desc', nulls: 'last' } }, include: { manager: { select: { name: true } }, systems: { select: { group: true } } } }),
    ])
    const agg = await db.deal.groupBy({ by: ['clientId'], where: { clientId: { in: rows.map((r) => r.id) }, stage: { type: 'WORKING' } }, _sum: { amount: true }, _count: { _all: true } })
    return {
      total, shown: rows.length,
      clients: rows.map((c) => {
        const a = agg.find((x) => x.clientId === c.id)
        return {
          id: c.id, name: c.name, type: TYPE_UA[c.type], city: c.city, status: STATUS_UA[c.status], phone: c.phone, email: c.email, manager: c.manager.name, manager_id: c.managerId,
          groups: [...new Set(c.systems.map((s) => s.group).filter((g) => g !== 'UNSET'))], last_contact: day(c.lastContactAt), days_since_contact: daysAgo(c.lastContactAt),
          active_deals: a?._count._all ?? 0, active_deals_uah_per_month: a?._sum.amount ? num(a._sum.amount) : 0,
        }
      }),
    }
  },

  async get_client(ctx, input) {
    need(ctx, 'clients', 'view')
    const id = num(input.client_id)
    const c = await db.client.findFirst({
      where: { id, ...clientWhere(ctx.u, 'team') },
      include: {
        manager: { select: { name: true } },
        systems: { include: { shares: { where: { validTo: null }, include: { supplier: { select: { name: true } } } } } },
        deals: { include: { stage: true, funnel: { select: { name: true } }, product: { select: { name: true } } }, orderBy: { updatedAt: 'desc' }, take: 15 },
        comms: { orderBy: { at: 'desc' }, take: 8 },
      },
    })
    if (!c) throw new UserError('Клієнта не знайдено або він недоступний вам')
    return {
      id: c.id, name: c.name, type: TYPE_UA[c.type], edrpou: c.edrpou, contact_person: c.contactPerson, phone: c.phone, email: c.email, city: c.city, address: c.address, source: c.source,
      status: STATUS_UA[c.status], manager: c.manager.name, created: day(c.createdAt), last_contact: day(c.lastContactAt),
      systems: c.systems.map((s) => ({ name: s.name, group: s.group, power_kw: s.powerKw, eic: s.eic, generation: s.hasGeneration ? `${s.genType ?? ''} ${s.genPowerKw ?? ''} кВт` : null, suppliers: s.shares.map((x) => `${x.supplier.name} ${x.sharePct}%`) })),
      deals: c.deals.map((d) => ({ id: d.id, number: d.number, funnel: d.funnel.name, stage: d.stage.name, stage_type: STAGE_UA[d.stage.type], product: d.product.name, volume_mwh: num(d.volumeMwh), amount_uah_per_month: num(d.amount), lost_reason: d.lostReason })),
      recent_communications: c.comms.map((m) => ({ date: day(m.at), channel: m.channel, summary: m.summary, author: m.authorName })),
    }
  },

  async search_deals(ctx, input) {
    need(ctx, 'deals', 'view')
    const where: Prisma.DealWhereInput = { AND: [
      dealWhere(ctx.u, 'team'),
      ...(input.client_id ? [{ clientId: num(input.client_id) }] : []), ...(input.funnel_id ? [{ funnelId: num(input.funnel_id) }] : []),
      ...(input.stage_type ? [{ stage: { type: input.stage_type as 'WORKING' | 'WON' | 'LOST' } }] : []), ...(input.owner_id ? [{ ownerId: num(input.owner_id) }] : []),
      ...(input.min_amount ? [{ amount: { gte: num(input.min_amount) } }] : []),
    ] }
    const limit = Math.min(Math.max(num(input.limit) || 15, 1), 25)
    const [total, sum, rows] = await Promise.all([
      db.deal.count({ where }), db.deal.aggregate({ where, _sum: { amount: true, volumeMwh: true } }),
      db.deal.findMany({ where, take: limit, orderBy: { updatedAt: 'desc' }, include: { client: { select: { id: true, name: true } }, funnel: { select: { name: true } }, stage: true, product: { select: { name: true } }, owner: { select: { name: true } } } }),
    ])
    return {
      total, total_amount_uah_per_month: num(sum._sum.amount ?? 0), total_volume_mwh: num(sum._sum.volumeMwh ?? 0),
      deals: rows.map((d) => ({ id: d.id, number: String(d.number).padStart(4, '0'), client: d.client.name, client_id: d.client.id, funnel: d.funnel.name, stage: d.stage.name, stage_type: STAGE_UA[d.stage.type], product: d.product.name, volume_mwh: num(d.volumeMwh), amount_uah_per_month: num(d.amount), owner: d.owner.name, updated: day(d.updatedAt), lost_reason: d.lostReason })),
    }
  },

  async get_analytics(ctx, input) {
    need(ctx, 'analytics', 'view')
    const per = parsePeriod(input.period as string | undefined, input.from as string | undefined, input.to as string | undefined)
    const mgr = sees_all(ctx.u) ? (input.manager_id ? num(input.manager_id) : null) : ctx.u.id
    const d = await dashboard({ mgr, funnelId: input.funnel_id ? num(input.funnel_id) : null }, per)
    return {
      period: per.label, scope: mgr ? 'один менеджер' : 'уся команда', clients: d.clients,
      deals_in_work: { count: d.work?.n ?? 0, amount_uah_per_month: d.work?.amt ?? 0 }, won: d.won, lost: d.lost,
      paid: { count: d.pay?.n ?? 0, amount_uah: d.pay?.amt ?? 0, previous_period_uah: d.payPrevAmt },
      funnel: d.funnel ? { name: d.funnel.name, stages: d.stageRows.map((s) => ({ name: s.name, deals: s.n, amount_uah_per_month: s.amt })) } : null,
      consumption_kwh: { total: d.cons.total, group_a: d.cons.a, group_b: d.cons.b, own_generation: d.cons.gen }, top_supplier: d.topSup,
      top_communicators: d.contacts, recent_payments: d.recent,
    }
  },

  async get_managers_report(ctx, input) {
    need(ctx, 'analytics', 'view')
    if (!sees_all(ctx.u)) throw new UserError('Звіт по менеджерах доступний лише користувачам із доступом до всього реєстру')
    const per = parsePeriod(input.period as string | undefined, input.from as string | undefined, input.to as string | undefined)
    const { rows } = await managersReport(input.funnel_id ? num(input.funnel_id) : null, per)
    return { period: per.label, managers: rows.map((r) => ({ id: r.id, name: r.name, clients: r.clients, calls: r.calls, emails: r.mails, meetings: r.meets, deals_in_work: r.work, won: r.won, lost: r.lost, won_uah_per_month: r.wonSum, won_volume_mwh: r.wonVol })) }
  },

  async find_duplicates(ctx, input) {
    need(ctx, 'clients', 'view')
    const dups = await findDuplicates(String(input.phone ?? ''), (input.email as string | undefined) ?? null, undefined, ctx.u)
    return { duplicates: dups.map((d) => ({ id: d.id, name: d.name, phone: d.phone, manager: d.manager, matched_by: d.by, accessible_to_you: d.accessible })) }
  },
}

/* ===================== Зміни: підготовка → підтвердження → виконання ===================== */
type Ready = { kind: 'ready'; card: Card; run: () => Promise<{ message: string; href?: string }> }
type Invalid = { kind: 'invalid'; content: unknown }
type Prep = Ready | Invalid
const invalid = (content: unknown): Invalid => ({ kind: 'invalid', content })

const clientCols = (d: ClientInput, mgrName: string): [string, string][] => [
  ['Назва', d.name], ['Тип', TYPE_UA[d.type]], ...(d.edrpou ? [['ЄДРПОУ', d.edrpou] as [string, string]] : []), ...(d.contactPerson ? [['Контакт', d.contactPerson] as [string, string]] : []),
  ['Телефон', d.phone], ...(d.email ? [['Email', d.email] as [string, string]] : []), ...(d.city ? [['Місто', d.city] as [string, string]] : []), ...(d.address ? [['Адреса', d.address] as [string, string]] : []),
  ['Статус', STATUS_UA[d.status]], ...(d.source ? [['Джерело', d.source] as [string, string]] : []), ['Менеджер', mgrName],
]

const PREP: Record<string, (ctx: ToolCtx, input: Record<string, unknown>) => Promise<Prep>> = {
  async create_client(ctx, i) {
    need(ctx, 'clients', 'create')
    const missing: string[] = []
    const asAdmin = sees_all(ctx.u)
    const managerId = asAdmin ? (i.manager_id ? num(i.manager_id) : 0) : ctx.u.id
    if (!managerId) missing.push('manager_id — закріплений менеджер')
    const raw = { type: i.type, name: i.name, phone: i.phone, edrpou: i.edrpou || undefined, contactPerson: i.contact_person || undefined, email: i.email || undefined, city: i.city || undefined, address: i.address || undefined, status: i.status ?? 'COLD', source: i.source || undefined, managerId: managerId || undefined }
    const v = validateClient(raw)
    const fields = { ...v.fields }
    delete fields.managerId
    if (Object.keys(fields).length) return invalid({ status: 'invalid', fields })
    if (missing.length) return invalid({ status: 'needs_input', missing, hint: 'Запитай користувача; запропонуй варіанти з get_reference_data' })
    const d = v.d!
    const mgr = await db.user.findFirst({ where: { id: managerId, status: 'ACTIVE' } })
    if (!mgr || (!asAdmin && mgr.id !== ctx.u.id)) return invalid({ status: 'invalid', fields: { manager_id: 'Менеджера не знайдено' } })
    const gen = i.gen_type || i.gen_power_kw || i.gen_mode
    if (gen && !(i.gen_type && num(i.gen_power_kw) > 0 && i.gen_mode)) return invalid({ status: 'needs_input', missing: ['gen_type, gen_power_kw і gen_mode — разом, якщо є власна генерація'] })
    const wantsDeal = !!(i.funnel_id || i.product_id || i.volume_mwh)
    let dealRows: [string, string][] = []
    if (wantsDeal) {
      need(ctx, 'deals', 'create')
      const miss = [!i.funnel_id && 'funnel_id', !i.product_id && 'product_id', !(num(i.volume_mwh) > 0) && 'volume_mwh'].filter(Boolean) as string[]
      if (miss.length) return invalid({ status: 'needs_input', missing: miss.map((m) => `${m} — для угоди`) })
      const [f, p] = await Promise.all([db.funnel.findFirst({ where: { id: num(i.funnel_id), status: 'ACTIVE' } }), db.product.findFirst({ where: { id: num(i.product_id), status: 'ACTIVE' } })])
      if (!f || !p) return invalid({ status: 'invalid', fields: { ...(f ? {} : { funnel_id: 'Воронку не знайдено' }), ...(p ? {} : { product_id: 'Продукт не знайдено або в архіві' }) } })
      dealRows = [['Угода', `${f.name} · ${p.name} · ${n(num(i.volume_mwh))} МВт·год`]]
    }
    if (!i.force_duplicate) {
      const dups = await findDuplicates(d.phone, d.email, undefined, ctx.u)
      if (dups.length) return invalid({ status: 'duplicate_found', duplicates: dups.map((x) => ({ id: x.id, name: x.name, phone: x.phone, manager: x.manager, matched_by: x.by, accessible_to_you: x.accessible })), hint: 'Покажи користувачу й запитай: відкрити існуючого, створити нового все одно (force_duplicate) чи скасувати' })
    }
    const supplier = i.supplier_id ? await db.supplier.findFirst({ where: { id: num(i.supplier_id), status: 'ACTIVE' } }) : null
    if (i.supplier_id && !supplier) return invalid({ status: 'invalid', fields: { supplier_id: 'Постачальника не знайдено' } })
    const rows = [...clientCols(d, mgr.name), ...(i.group ? [['Група', String(i.group)] as [string, string]] : []), ...(supplier ? [['Постачальник', supplier.name] as [string, string]] : []), ...(gen ? [['Генерація', `${i.gen_type}, ${i.gen_power_kw} кВт, ${i.gen_mode}`] as [string, string]] : []), ...dealRows]
    return {
      kind: 'ready', card: { title: 'Новий клієнт', rows, confirm: 'Створити клієнта' },
      async run() {
        const c = await insertClient(ctx.u, d, { managerId, group: i.group === 'A' || i.group === 'B' ? i.group : 'UNSET', supplierId: supplier?.id ?? null, gen: gen ? { type: String(i.gen_type), powerKw: num(i.gen_power_kw), mode: String(i.gen_mode) } : null })
        let extra = ''
        if (wantsDeal) {
          const r = await insertDeal(ctx.u, { clientId: c.id, funnelId: num(i.funnel_id), productId: num(i.product_id), volumeMwh: num(i.volume_mwh) })
          extra = 'error' in r ? ` Угоду не створено: ${r.error}.` : ' Угоду створено.'
        }
        return { message: `Клієнта «${c.name}» створено.${extra}`, href: `/clients/${c.id}` }
      },
    }
  },

  async update_client(ctx, i) {
    need(ctx, 'clients', 'edit')
    const id = num(i.client_id)
    if (!(await canAccessClient(ctx.u, id))) return invalid({ status: 'invalid', fields: { client_id: 'Клієнта не знайдено' } })
    const ex = await db.client.findUniqueOrThrow({ where: { id }, include: { manager: { select: { name: true } } } })
    const pick = <T,>(v: unknown, old: T) => (v === undefined || v === null || v === '' ? old : v)
    const v = validateClient({
      type: pick(i.type, ex.type), name: pick(i.name, ex.name), edrpou: pick(i.edrpou, ex.edrpou) || undefined, contactPerson: pick(i.contact_person, ex.contactPerson) || undefined, phone: pick(i.phone, ex.phone),
      email: pick(i.email, ex.email) || undefined, city: pick(i.city, ex.city) || undefined, address: pick(i.address, ex.address) || undefined, status: pick(i.status, ex.status), source: pick(i.source, ex.source) || undefined, managerId: ex.managerId,
    })
    if (!v.d || Object.keys(v.fields).length) return invalid({ status: 'invalid', fields: v.fields })
    const d = v.d
    const changes: [string, string][] = []
    const cmp = (label: string, a: unknown, b: unknown) => { if ((a ?? '') !== (b ?? '')) changes.push([label, `${a || '—'} → ${b || '—'}`]) }
    cmp('Назва', ex.name, d.name); cmp('Телефон', ex.phone, d.phone); cmp('Email', ex.email, d.email); cmp('ЄДРПОУ', ex.edrpou, d.edrpou); cmp('Контакт', ex.contactPerson, d.contactPerson)
    cmp('Місто', ex.city, d.city); cmp('Адреса', ex.address, d.address); cmp('Джерело', ex.source, d.source); cmp('Статус', STATUS_UA[ex.status], STATUS_UA[d.status]); cmp('Тип', TYPE_UA[ex.type], TYPE_UA[d.type])
    if (!changes.length) return invalid({ status: 'no_changes', message: 'Нових значень немає — зміни не потрібні' })
    if (!i.force_duplicate) {
      const dups = await findDuplicates(d.phone, d.email, id, ctx.u)
      if (dups.length) return invalid({ status: 'duplicate_found', duplicates: dups.map((x) => ({ id: x.id, name: x.name, phone: x.phone, matched_by: x.by })) })
    }
    return {
      kind: 'ready', card: { title: `Зміни клієнта «${ex.name}»`, rows: changes, confirm: 'Зберегти зміни' },
      async run() {
        const r = await updateClientCore(ctx.u, id, d, true)
        if (!r.ok) throw new UserError(r.error)
        return { message: `Дані клієнта «${d.name}» оновлено.`, href: `/clients/${id}` }
      },
    }
  },

  async create_deal(ctx, i) {
    need(ctx, 'deals', 'create')
    const s = z.object({ client_id: z.number().int().positive(), funnel_id: z.number().int().positive(), product_id: z.number().int().positive(), volume_mwh: z.number().positive('Вкажіть очікуваний обсяг') }).safeParse({ client_id: num(i.client_id), funnel_id: num(i.funnel_id), product_id: num(i.product_id), volume_mwh: num(i.volume_mwh) })
    if (!s.success) return invalid({ status: 'invalid', fields: schemaFields(s.error) })
    if (!(await canAccessClient(ctx.u, s.data.client_id))) return invalid({ status: 'invalid', fields: { client_id: 'Клієнта не знайдено' } })
    const [c, f, p] = await Promise.all([db.client.findUniqueOrThrow({ where: { id: s.data.client_id } }), db.funnel.findFirst({ where: { id: s.data.funnel_id, status: 'ACTIVE' } }), db.product.findFirst({ where: { id: s.data.product_id, status: 'ACTIVE' } })])
    if (!f || !p) return invalid({ status: 'invalid', fields: { ...(f ? {} : { funnel_id: 'Воронку не знайдено' }), ...(p ? {} : { product_id: 'Продукт не знайдено або в архіві' }) } })
    const amount = i.amount ? num(i.amount) : Math.round((s.data.volume_mwh * num(p.price)) / 12)
    return {
      kind: 'ready', card: { title: 'Нова угода', rows: [['Клієнт', c.name], ['Воронка', f.name], ['Продукт', p.name], ['Обсяг', `${n(s.data.volume_mwh)} МВт·год`], ['Сума', `${uah(amount)}/міс`], ...(i.note ? [['Нотатка', String(i.note)] as [string, string]] : [])], confirm: 'Створити угоду' },
      async run() {
        const r = await insertDeal(ctx.u, { clientId: c.id, funnelId: f.id, productId: p.id, volumeMwh: s.data.volume_mwh, amount: i.amount ? num(i.amount) : undefined, note: i.note ? String(i.note) : undefined })
        if ('error' in r) throw new UserError(r.error)
        return { message: `Угоду для «${c.name}» створено.`, href: `/deals/${r.id}` }
      },
    }
  },

  async move_deal(ctx, i) {
    need(ctx, 'deals', 'edit')
    const dealId = num(i.deal_id), stageId = num(i.stage_id)
    if (!(await canAccessDeal(ctx.u, dealId))) return invalid({ status: 'invalid', fields: { deal_id: 'Угоду не знайдено' } })
    const [deal, to] = await Promise.all([db.deal.findUniqueOrThrow({ where: { id: dealId }, include: { stage: true, client: true } }), db.stage.findUnique({ where: { id: stageId } })])
    if (!to || to.funnelId !== deal.funnelId) return invalid({ status: 'invalid', fields: { stage_id: 'Етап має бути з тієї ж воронки' } })
    if (to.id === deal.stageId) return invalid({ status: 'no_changes', message: 'Угода вже на цьому етапі' })
    if (to.type === 'LOST' && !String(i.lost_reason ?? '').trim()) return invalid({ status: 'needs_input', missing: ['lost_reason — причина втрати (зі словника loss_reasons)'] })
    return {
      kind: 'ready', card: { title: `Угода №${String(deal.number).padStart(4, '0')}`, rows: [['Клієнт', deal.client.name], ['Етап', `${deal.stage.name} → ${to.name}`], ...(to.type === 'LOST' ? [['Причина', String(i.lost_reason)] as [string, string]] : [])], confirm: 'Перенести угоду' },
      async run() {
        const r = await moveDealCore(ctx.u, dealId, stageId, i.lost_reason ? String(i.lost_reason) : undefined)
        if (!r.ok) throw new UserError(r.error)
        return { message: `Угоду перенесено на етап «${to.name}».${r.suggestActive ? ' Клієнт ще не має статусу «Дійсний» — можу змінити.' : ''}`, href: `/deals/${dealId}` }
      },
    }
  },

  async add_communication(ctx, i) {
    need(ctx, 'clients', 'edit')
    const p = commSchema.safeParse({ channel: i.channel, summary: i.summary })
    if (!p.success) return invalid({ status: 'invalid', fields: schemaFields(p.error) })
    const id = num(i.client_id)
    if (!(await canAccessClient(ctx.u, id))) return invalid({ status: 'invalid', fields: { client_id: 'Клієнта не знайдено' } })
    const [c, channels] = await Promise.all([db.client.findUniqueOrThrow({ where: { id } }), db.dictionary.findMany({ where: { kind: 'CHANNEL' } })])
    if (channels.length && !channels.some((x) => x.name.toLowerCase() === p.data.channel.toLowerCase())) return invalid({ status: 'invalid', fields: { channel: `Допустимі канали: ${channels.map((x) => x.name).join(', ')}` } })
    const channel = channels.find((x) => x.name.toLowerCase() === p.data.channel.toLowerCase())?.name ?? p.data.channel
    return {
      kind: 'ready', card: { title: 'Запис про комунікацію', rows: [['Клієнт', c.name], ['Канал', channel], ['Зміст', p.data.summary]], confirm: 'Додати запис' },
      async run() { await insertCommunication(ctx.u, id, channel, p.data.summary); return { message: `Запис додано в історію клієнта «${c.name}».`, href: `/clients/${id}` } },
    }
  },
}

export const WRITE_TOOLS = new Set(Object.keys(PREP))

/* ===================== Виклик інструмента моделлю ===================== */
export async function runTool(ctx: ToolCtx, name: string, input: Record<string, unknown>): Promise<{ text: string; isError: boolean; pending?: { id: string; card: Card } }> {
  try {
    const read = READ[name]
    if (read) return { text: cut(await read(ctx, input)), isError: false }
    const prep = PREP[name]
    if (!prep) return { text: `Невідомий інструмент ${name}`, isError: true }
    if (ctx.mode !== 'actions') return { text: cut({ status: 'chat_mode', message: 'Зараз режим «Чат» — тільки читання. Скажи користувачу перемкнутися в режим «Дії», щоб виконати цю зміну.' }), isError: true }
    const r = await prep(ctx, input)
    if (r.kind === 'invalid') return { text: cut(r.content), isError: false }
    const id = randomBytes(9).toString('base64url')
    await db.agentAction.create({ data: { id, threadId: ctx.threadId, userId: ctx.u.id, tool: name, input: input as Prisma.InputJsonValue, card: r.card as unknown as Prisma.InputJsonValue } })
    return { text: cut({ status: 'awaiting_confirmation', action_id: id, note: 'Картку показано користувачу з кнопками «Підтвердити» / «Скасувати». Дані ще НЕ змінено.' }), isError: false, pending: { id, card: r.card } }
  } catch (e) {
    if (e instanceof UserError) return { text: e.message, isError: true }
    console.error('[agent] tool error', name, e)
    return { text: 'Внутрішня помилка інструмента', isError: true }
  }
}

/** Підтвердження користувачем: повторна перевірка прав і даних, потім виконання. */
export async function confirmAction(u: SessionUser, actionId: string, approve: boolean): Promise<{ ok: boolean; message: string; href?: string; threadId?: number }> {
  const a = await db.agentAction.findFirst({ where: { id: actionId, userId: u.id } })
  if (!a) return { ok: false, message: 'Дію не знайдено' }
  if (a.status !== 'PENDING') return { ok: false, message: 'Цю дію вже оброблено', threadId: a.threadId }
  if (!approve) {
    await db.agentAction.update({ where: { id: a.id }, data: { status: 'CANCELLED' } })
    return { ok: true, message: 'Скасовано. Нічого не змінено.', threadId: a.threadId }
  }
  const claimed = await db.agentAction.updateMany({ where: { id: a.id, status: 'PENDING' }, data: { status: 'DONE' } })
  if (claimed.count !== 1) return { ok: false, message: 'Цю дію вже оброблено', threadId: a.threadId }
  try {
    const prep = await PREP[a.tool]({ u, mode: 'actions', threadId: a.threadId }, { ...(a.input as Record<string, unknown>), force_duplicate: (a.input as Record<string, unknown>).force_duplicate })
    if (prep.kind === 'invalid') throw new UserError(`Дані змінилися: ${cut(prep.content, 400)}`)
    const r = await prep.run()
    return { ok: true, ...r, threadId: a.threadId }
  } catch (e) {
    await db.agentAction.update({ where: { id: a.id }, data: { status: 'FAILED' } })
    return { ok: false, message: e instanceof UserError ? e.message : 'Не вдалося виконати дію', threadId: a.threadId }
  }
}
