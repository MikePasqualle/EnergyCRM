/**
 * Демо-дані = дані з макетів дизайну (1 248 клієнтів 612/301/335, 186 угод у роботі,
 * 74 виграні на 3,82 млн ₴, 641 контакт за листопад тощо).
 *   npm run db:seed            — демо-набір
 *   SEED_MODE=prod npm run db:seed — лише ролі, довідники й акаунт адміна
 */
import { PrismaClient, Prisma } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import argon2 from 'argon2'

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
export const DEMO_PASSWORD = 'EnergyCRM-2026!'

// ---------- детермінований генератор ----------
let _s = 20261117
const rnd = () => {
  _s |= 0; _s = (_s + 0x6d2b79f5) | 0
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1))
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]
const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }

// Київський час (літній до останньої неділі жовтня)
function lastSun(y: number, m: number) { const d = new Date(Date.UTC(y, m + 1, 0)); return d.getUTCDate() - d.getUTCDay() }
function K(y: number, m: number, d: number, h = 12, mi = 0) {
  const dst = Date.UTC(y, m, d) >= Date.UTC(y, 2, lastSun(y, 2)) && Date.UTC(y, m, d) < Date.UTC(y, 9, lastSun(y, 9))
  return new Date(Date.UTC(y, m, d, h - (dst ? 3 : 2), mi))
}
const D = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d))

const ADMIN_PERMS = Object.fromEntries(
  ['analytics', 'funnels', 'clients', 'deals', 'products', 'users', 'audit'].map((k) => [k, { view: true, create: true, edit: true, delete: true }]),
)
const USER_PERMS = {
  analytics: { view: true }, funnels: { view: true },
  clients: { view: true, create: true, edit: true }, deals: { view: true, create: true, edit: true },
  products: { view: true },
}

const normPhone = (raw: string) => { const d = raw.replace(/\D/g, ''); return d.startsWith('380') ? '+' + d : d.startsWith('0') ? '+38' + d : '+' + d }

async function main() {
  const prod = process.env.SEED_MODE === 'prod'
  await db.$executeRawUnsafe(
    `TRUNCATE "AuditLog","Setting","SavedFilter","Dictionary","Payment","DealStageHistory","Deal","ConsumptionMonthly","ConsumptionHourly","SystemHistory","SupplierShare","System","Communication","ClientAssignment","Client","Stage","Funnel","Product","Supplier","LoginAttempt","Session","User","Role" RESTART IDENTITY CASCADE`,
  )
  const hash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id })

  // ---------- ролі й користувачі ----------
  const admin = await db.role.create({ data: { name: 'Адмін', isAdmin: true, isSystem: true, seeAllClients: true, permissions: ADMIN_PERMS } })
  const userRole = await db.role.create({ data: { name: 'Користувач', isSystem: true, seeAllClients: false, permissions: USER_PERMS } })

  const dicts: [string, string[]][] = [
    ['SOURCE', ['Холодний обзвон', 'Рекомендація', 'Сайт', 'Виставка', 'Партнер']],
    ['LOSS_REASON', ['Обрали іншого постачальника', 'Не відповідає', 'Висока ціна', 'Діючий договір']],
    ['OBJECT_TYPE', ['Виробничий', 'Офісний', 'Складський', 'Торговий']],
    ['CHANNEL', ['Дзвінок', 'Лист', 'Зустріч', 'Месенджер']],
  ]
  for (const [kind, names] of dicts) await db.dictionary.createMany({ data: names.map((name, position) => ({ kind, name, position })) })
  await db.setting.createMany({ data: [{ key: 'currency', value: 'UAH' }, { key: 'unit', value: 'kWh' }, { key: 'timezone', value: 'Europe/Kyiv' }] })

  const owner = await db.user.create({
    data: { name: 'Михайло Пацан', email: 'mp@learntoearn.global', passwordHash: hash, roleId: admin.id, mustChangePassword: false, isOwner: true, lastLoginAt: K(2026, 10, 18, 9, 14) },
  })
  if (prod) { console.log('prod seed: admin', owner.email); return }

  const mgrDefs = [
    { key: 'ОК', name: 'Олена Коваль', email: 'olena@energycrm.ua', clients: 312, last: K(2026, 10, 18, 8, 52) },
    { key: 'ДМ', name: 'Денис Мороз', email: 'denys@energycrm.ua', clients: 268, last: K(2026, 10, 17, 18, 20) },
    { key: 'ІШ', name: 'Ірина Шевчук', email: 'iryna@energycrm.ua', clients: 241, last: K(2026, 10, 18, 9, 3) },
    { key: 'АП', name: 'Андрій Петренко', email: 'andrii@energycrm.ua', clients: 205, last: null as Date | null },
    { key: 'СБ', name: 'Софія Бондар', email: 'sofiia@energycrm.ua', clients: 222, last: K(2026, 10, 12, 17, 40) },
  ]
  const M: Record<string, number> = {}
  const MN: Record<string, string> = {}
  for (const m of mgrDefs) {
    const u = await db.user.create({
      data: {
        name: m.name, email: m.email, passwordHash: hash, roleId: userRole.id, lastLoginAt: m.last,
        mustChangePassword: m.key === 'АП', status: m.key === 'СБ' ? 'BLOCKED' : 'ACTIVE',
      },
    })
    M[m.key] = u.id; MN[m.key] = m.name
  }
  const KEYS = mgrDefs.map((m) => m.key)

  // ---------- постачальники, продукти, воронки ----------
  const sup: Record<string, number> = {}
  for (const [name, phone, status] of [
    ['ТОВ «Укрсбут»', '+380 44 200 15 00', 'ACTIVE'], ['ТОВ «Енергоінвест»', '+380 44 390 77 12', 'ACTIVE'],
    ['ПрАТ «Дніпроенергозбут»', '+380 56 700 41 00', 'ACTIVE'], ['ТОВ «Сонячний Збут»', '+380 48 233 06 18', 'ARCHIVED'],
  ] as const) sup[name] = (await db.supplier.create({ data: { name, phone, status } })).id
  const SU = sup['ТОВ «Укрсбут»'], SE = sup['ТОВ «Енергоінвест»'], SD = sup['ПрАТ «Дніпроенергозбут»']

  const prodDefs = [
    { name: 'Бізнес Стандарт', price: 4270, term: 12, min: 120, group: 'BOTH', model: 'Фіксована', desc: 'Фіксована ціна електроенергії для бізнесу на 12 місяців. Підходить споживачам групи А та Б, погодинне врегулювання небалансів включено.', terms: 'Оплата за фактом, рахунок до 5-го числа. Дострокове розірвання — за 30 днів.' },
    { name: 'Бізнес Гарант', price: 4230, term: 24, min: 500, group: 'A', model: 'Фіксована з гарантією ціни', desc: 'Фіксована ціна на 24 місяці з гарантією незмінності для групи А.', terms: 'Оплата за фактом, аванс 30%. Дострокове розірвання — за 60 днів.' },
    { name: 'Бізнес Мініум', price: 4700, term: 6, min: 20, group: 'B', model: 'Фіксована', desc: 'Короткострокова пропозиція для малого бізнесу та ФОП.', terms: 'Передоплата за місяць.' },
    { name: 'Дім Базовий', price: 4320, term: 12, min: 0, group: 'B', model: 'Фіксована', desc: 'Базовий тариф для населення.', terms: 'Оплата до 20-го числа.' },
  ] as const
  const P: Record<string, { id: number; price: number }> = {}
  for (const p of prodDefs) {
    const r = await db.product.create({ data: { name: p.name, description: p.desc, price: p.price, tariffModel: p.model, termMonths: p.term, minVolumeMwh: p.min, group: p.group, terms: p.terms } })
    P[p.name] = { id: r.id, price: p.price }
  }
  await db.product.create({ data: { name: 'Пілот 2025', description: 'Тестова пропозиція 2025 року.', price: 4100, termMonths: 6, status: 'ARCHIVED', group: 'BOTH' } })

  const mkFunnel = async (name: string, description: string, stages: [string, 'WORKING' | 'WON' | 'LOST', string][], status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE', position = 0) => {
    const f = await db.funnel.create({ data: { name, description, status, position } })
    const ids: number[] = []
    for (let i = 0; i < stages.length; i++) {
      ids.push((await db.stage.create({ data: { funnelId: f.id, name: stages[i][0], type: stages[i][1], color: stages[i][2], position: i + 1 } })).id)
    }
    return { id: f.id, stages: ids }
  }
  const F1 = await mkFunnel('Продаж бізнесу', 'Прямі продажі електроенергії юридичним особам і ФОП', [
    ['Новий контакт', 'WORKING', '#a9c7f5'], ['Розмова', 'WORKING', '#7fa9ee'], ['Пропозиція', 'WORKING', '#f7c948'],
    ['Договір', 'WORKING', '#0f1115'], ['Оплата', 'WON', '#4cbf78'], ['Втрачено', 'LOST', '#f4a6a0'],
  ], 'ACTIVE', 1)
  const F2 = await mkFunnel('Продаж населенню', 'Продаж побутовим споживачам', [
    ['Новий контакт', 'WORKING', '#a9c7f5'], ['Договір', 'WORKING', '#0f1115'], ['Оплата', 'WON', '#4cbf78'], ['Втрачено', 'LOST', '#f4a6a0'],
  ], 'ACTIVE', 2)
  const F3 = await mkFunnel('Повернення клієнтів', 'Робота з клієнтами, що пішли', [
    ['Нагадування', 'WORKING', '#d3b9f3'], ['Пропозиція', 'WORKING', '#f7c948'], ['Повернуто', 'WON', '#4cbf78'], ['Втрачено', 'LOST', '#f4a6a0'],
  ], 'ACTIVE', 3)
  await mkFunnel('Пілот 2025', 'Архівна воронка', [['Контакт', 'WORKING', '#a9c7f5'], ['Угода', 'WON', '#4cbf78'], ['Втрачено', 'LOST', '#f4a6a0']], 'ARCHIVED', 4)

  // ---------- клієнти ----------
  type CDef = {
    name: string; type: 'COMPANY' | 'FOP' | 'PERSON'; city: string; status: 'COLD' | 'WARM' | 'ACTIVE'; phone: string; email: string | null
    mgr: string; last: Date; grp: 'A' | 'B'; shares: [number, number][]; gen?: [string, number, string]; edrpou?: string; contact?: string
    address?: string; source?: string; power?: number; extraDeals?: boolean
  }
  const named: CDef[] = [
    { name: 'ТОВ «Агрохолдинг Схід»', type: 'COMPANY', city: 'Дніпро', status: 'ACTIVE', phone: '+380 67 412 08 15', email: 'v.ostapenko@agroskhid.ua', mgr: 'ОК', last: K(2026, 10, 17, 11, 30), grp: 'A', shares: [[SU, 60], [SE, 40]], gen: ['Сонячна електростанція (СЕС)', 60, 'Для власного споживання'], edrpou: '31407258', contact: 'Василь Остапенко', address: 'вул. Січових Стрільців, 18', source: 'Рекомендація', power: 220 },
    { name: 'ТОВ «Логістик Плюс»', type: 'COMPANY', city: 'Київ', status: 'ACTIVE', phone: '+380 50 118 22 64', email: 'office@logistikplus.ua', mgr: 'ІШ', last: K(2026, 10, 16, 14, 10), grp: 'A', shares: [[SU, 100]], gen: ['Сонячна електростанція (СЕС)', 150, 'З віддачею в мережу'], power: 400, source: 'Сайт' },
    { name: 'ФОП Коваленко І.', type: 'FOP', city: 'Харків', status: 'WARM', phone: '+380 63 774 10 09', email: 'kovalenko.i@gmail.com', mgr: 'АП', last: K(2026, 10, 15, 12), grp: 'B', shares: [[SE, 100]], power: 30, source: 'Холодний обзвон' },
    { name: 'ПП «Будінвест»', type: 'COMPANY', city: 'Львів', status: 'COLD', phone: '+380 32 245 61 30', email: 'info@budinvest.com.ua', mgr: 'ІШ', last: K(2026, 10, 14, 12), grp: 'A', shares: [], power: 300, source: 'Виставка' },
    { name: 'ТОВ «Зелений Дім»', type: 'COMPANY', city: 'Одеса', status: 'COLD', phone: '+380 48 700 31 12', email: 'zelenyi.dim@ukr.net', mgr: 'ОК', last: K(2026, 10, 17, 9), grp: 'B', shares: [], gen: ['Сонячна електростанція (СЕС)', 30, 'Для власного споживання'], power: 40, source: 'Сайт' },
    { name: 'ПрАТ «Київхліб»', type: 'COMPANY', city: 'Київ', status: 'WARM', phone: '+380 44 532 09 77', email: 'energy@kyivhlib.ua', mgr: 'ІШ', last: K(2026, 10, 13, 12), grp: 'A', shares: [[SU, 50], [SE, 50]], power: 250, source: 'Партнер' },
    { name: 'Готель «Карпатія»', type: 'COMPANY', city: 'Яремче', status: 'WARM', phone: '+380 34 342 55 01', email: 'booking@karpatia.hotel', mgr: 'СБ', last: K(2026, 10, 10, 12), grp: 'B', shares: [[SE, 100]], power: 60, source: 'Сайт' },
    { name: 'ТОВ «Теплобуд»', type: 'COMPANY', city: 'Запоріжжя', status: 'WARM', phone: '+380 61 213 48 90', email: 'zakupivli@teplobud.ua', mgr: 'ОК', last: K(2026, 10, 9, 12), grp: 'A', shares: [[SU, 100]], gen: ['Когенерація', 400, 'Для власного споживання'], power: 600, source: 'Рекомендація' },
    { name: 'ФОП Мельник О.', type: 'FOP', city: 'Полтава', status: 'COLD', phone: '+380 66 905 17 43', email: null, mgr: 'ДМ', last: K(2026, 10, 16, 12), grp: 'B', shares: [], power: 15, source: 'Холодний обзвон' },
    { name: 'ТОВ «Агрокомплекс»', type: 'COMPANY', city: 'Вінниця', status: 'WARM', phone: '+380 43 258 70 14', email: 'office@agrokompleks.ua', mgr: 'ДМ', last: K(2026, 10, 12, 12), grp: 'A', shares: [[SU, 100]], power: 500, source: 'Рекомендація' },
    { name: 'ФОП Гнатюк В.', type: 'FOP', city: 'Тернопіль', status: 'WARM', phone: '+380 35 255 41 18', email: 'gnatyuk@ukr.net', mgr: 'ДМ', last: K(2026, 10, 9, 12), grp: 'B', shares: [], power: 20 },
    { name: 'ТОВ «Сигма»', type: 'COMPANY', city: 'Київ', status: 'COLD', phone: '+380 44 600 12 12', email: 'sigma@sigma.ua', mgr: 'ІШ', last: K(2026, 10, 3, 12), grp: 'A', shares: [], power: 200 },
    { name: 'ФОП Лисенко Р.', type: 'FOP', city: 'Суми', status: 'COLD', phone: '+380 54 270 33 09', email: null, mgr: 'АП', last: K(2026, 9, 29, 12), grp: 'B', shares: [], power: 12 },
  ]
  const TOTAL = 1248
  const statusQuota: Record<string, number> = { COLD: 612, WARM: 301, ACTIVE: 335 }
  const mgrQuota: Record<string, number> = Object.fromEntries(mgrDefs.map((m) => [m.key, m.clients]))
  named.forEach((c) => { statusQuota[c.status]--; mgrQuota[c.mgr]-- })

  const surn = ['Шевченко', 'Коваленко', 'Бондаренко', 'Ткаченко', 'Кравченко', 'Олійник', 'Мельник', 'Шевчук', 'Лисенко', 'Поліщук', 'Савченко', 'Руденко', 'Марченко', 'Клименко', 'Гончар', 'Кушнір', 'Мазур', 'Іваненко', 'Петрук', 'Бойко']
  const given = ['Олександр', 'Андрій', 'Василь', 'Ігор', 'Тарас', 'Олена', 'Марія', 'Наталія', 'Юрій', 'Сергій', 'Віктор', 'Оксана']
  const w1 = ['Агро', 'Енерго', 'Будінвест', 'Укр', 'Еко', 'Нова', 'Карпат', 'Дніпро', 'Подільська', 'Південна', 'Полісся', 'Мега', 'Техно', 'Грін', 'Схід', 'Захід', 'Лан', 'Промінь']
  const w2 = ['Плюс', 'Сервіс', 'Холдинг', 'Трейд', 'Продукт', 'Логістик', 'Буд', 'Агро', 'Партнер', 'Груп', 'Інвест', 'Маркет']
  const cities = ['Київ', 'Київ', 'Київ', 'Харків', 'Одеса', 'Дніпро', 'Львів', 'Запоріжжя', 'Вінниця', 'Полтава', 'Черкаси', 'Чернігів', 'Суми', 'Житомир', 'Рівне', 'Луцьк', 'Тернопіль', 'Ужгород', 'Миколаїв', 'Івано-Франківськ']
  const codes = ['50', '63', '66', '67', '68', '73', '93', '95', '96', '97', '98', '99']
  const sources = dicts[0][1]
  const usedPhone = new Set(named.map((c) => normPhone(c.phone)))

  const statusPool = shuffle(Object.entries(statusQuota).flatMap(([s, n]) => Array(Math.max(n, 0)).fill(s))) as ('COLD' | 'WARM' | 'ACTIVE')[]
  const mgrPool = shuffle(Object.entries(mgrQuota).flatMap(([k, n]) => Array(Math.max(n, 0)).fill(k))) as string[]

  const cdefs: CDef[] = [...named]
  const nGen = TOTAL - named.length
  for (let i = 0; i < nGen; i++) {
    const t = pick(['COMPANY', 'COMPANY', 'COMPANY', 'FOP', 'FOP', 'PERSON'] as const)
    const sn = pick(surn)
    const name = t === 'COMPANY' ? `${pick(['ТОВ', 'ТОВ', 'ПП', 'ПрАТ'])} «${pick(w1)} ${pick(w2)}»` : t === 'FOP' ? `ФОП ${sn} ${pick(given)[0]}.` : `${sn} ${pick(given)} ${pick(['Іванович', 'Петрович', 'Олексіївна', 'Миколаївна'])}`
    let phone = ''
    do { phone = `+380 ${pick(codes)} ${ri(100, 999)} ${ri(10, 99)} ${ri(10, 99)}` } while (usedPhone.has(normPhone(phone)))
    usedPhone.add(normPhone(phone))
    const status = statusPool[i]
    cdefs.push({
      name: name + (rnd() < 0.15 ? ` №${ri(2, 9)}` : ''), type: t, city: pick(cities), status, phone,
      email: rnd() < 0.7 ? `info${i + 1}@${pick(['ukr.net', 'gmail.com', 'company.ua', 'biz.ua'])}` : null,
      mgr: mgrPool[i], last: rnd() < 0.85 ? K(2026, 10, ri(1, 17), ri(9, 17)) : K(2026, 9, ri(20, 31), ri(9, 17)),
      grp: rnd() < 0.34 ? 'A' : 'B', shares: [], source: pick(sources), power: t === 'COMPANY' ? ri(30, 400) : ri(5, 40),
    })
  }
  // постачальники: 412 / 287 / 96 клієнтів (як у довіднику)
  const have = { [SU]: 0, [SE]: 0, [SD]: 0 } as Record<number, number>
  named.forEach((c) => c.shares.forEach(([s]) => { have[s]++ }))
  const need: [number, number][] = [[SU, 412 - have[SU]], [SE, 287 - have[SE]], [SD, 96 - have[SD]]]
  const idxPool = shuffle(Array.from({ length: nGen }, (_, i) => named.length + i))
  let cur = 0
  for (const [s, k] of need) for (let j = 0; j < k; j++) cdefs[idxPool[cur++]].shares = [[s, 100]]
  // генерація у ~8% клієнтів
  cdefs.forEach((c, i) => { if (i >= named.length && rnd() < 0.08) c.gen = [pick(['Сонячна електростанція (СЕС)', 'Вітрова', 'Когенерація']), ri(10, 200), pick(['Для власного споживання', 'З віддачею в мережу'])] })

  const createdBase = K(2026, 5, 1)
  await db.client.createMany({
    data: cdefs.map((c, i) => ({
      id: i + 1, type: c.type, name: c.name, edrpou: c.edrpou ?? (c.type === 'COMPANY' ? String(ri(10000000, 49999999)) : null),
      contactPerson: c.contact ?? `${pick(given)} ${pick(surn)}`, phone: c.phone, phoneNorm: normPhone(c.phone),
      email: c.email, emailNorm: c.email?.toLowerCase() ?? null, city: c.city, address: c.address ?? `вул. ${pick(['Центральна', 'Лісова', 'Шевченка', 'Незалежності', 'Промислова'])}, ${ri(1, 99)}`,
      source: c.source ?? pick(sources), status: c.status, managerId: M[c.mgr], createdAt: new Date(createdBase.getTime() + rnd() * 140 * 864e5), lastContactAt: c.last,
    })),
  })
  const cid = (name: string) => cdefs.findIndex((c) => c.name === name) + 1
  console.log('clients', cdefs.length)

  // ---------- системи, частки, генерація ----------
  const objT = dicts[2][1]
  type SDef = { id: number; clientId: number; grp: 'A' | 'B'; gen: boolean }
  const sysRows: Prisma.SystemCreateManyInput[] = []
  const systems: SDef[] = []
  let sid = 0
  const addSys = (clientId: number, p: Partial<Prisma.SystemCreateManyInput> & { grp: 'A' | 'B' }) => {
    sid++
    sysRows.push({
      id: sid, clientId, name: p.name ?? 'Основний обʼєкт', objectType: p.objectType ?? pick(objT), address: p.address ?? cdefs[clientId - 1].address ?? null,
      eic: p.eic ?? `62Z${ri(1000000, 9999999)}${ri(100, 999)}Q${pick('ABCDEFGHJKLMNPQRSTUVWXYZ'.split(''))}`,
      powerKw: p.powerKw ?? 0, group: p.grp, meterType: p.grp === 'A' ? 'Почасовий (інтервальний)' : 'Місячний (інтегральний)',
      hasGeneration: p.hasGeneration ?? false, genType: p.genType ?? null, genPowerKw: p.genPowerKw ?? null, genMode: p.genMode ?? null,
      updatedBy: 'Олена Коваль', updatedAt: p.updatedAt ?? K(2026, 10, ri(1, 17)),
    })
    systems.push({ id: sid, clientId, grp: p.grp, gen: !!p.hasGeneration })
    return sid
  }
  const ID: Record<string, number> = {}
  cdefs.forEach((c, i) => {
    const clientId = i + 1
    const base = { grp: c.grp, powerKw: c.power ?? 50, hasGeneration: !!c.gen, genType: c.gen?.[0], genPowerKw: c.gen?.[1], genMode: c.gen?.[2] }
    if (c.name === 'ТОВ «Агрохолдинг Схід»') {
      ID.elev = addSys(clientId, { ...base, name: 'Елеваторний комплекс', objectType: 'Виробничий', address: 'Дніпро, вул. Січових Стрільців, 18', eic: '62Z8107258391Q5K', powerKw: 220, updatedAt: K(2026, 10, 14, 16, 5) })
      ID.sklad = addSys(clientId, { grp: 'B', name: 'Склад №2', objectType: 'Складський', address: 'Дніпро, Придніпровське шосе, 7', powerKw: 90 })
      ID.office = addSys(clientId, { grp: 'B', name: 'Офіс, оф. 3', objectType: 'Офісний', address: 'Дніпро, вул. Січових Стрільців, 18', powerKw: 30 })
    } else addSys(clientId, base)
  })
  await db.system.createMany({ data: sysRows })

  const shareRows: Prisma.SupplierShareCreateManyInput[] = []
  cdefs.forEach((c, i) => {
    const sys = c.name === 'ТОВ «Агрохолдинг Схід»' ? [ID.elev, ID.sklad, ID.office] : [systems.find((s) => s.clientId === i + 1)!.id]
    sys.forEach((sId, k) => {
      if (c.name === 'ТОВ «Агрохолдинг Схід»') {
        if (k === 0) {
          shareRows.push({ systemId: sId, supplierId: SU, validFrom: D(2025, 11, 1), validTo: D(2026, 10, 30), sharePct: 100 })
          shareRows.push({ systemId: sId, supplierId: SU, validFrom: D(2026, 11, 1), validTo: D(2027, 11, 31), sharePct: 60 })
          shareRows.push({ systemId: sId, supplierId: SE, validFrom: D(2026, 11, 1), validTo: D(2027, 11, 31), sharePct: 40 })
        } else shareRows.push({ systemId: sId, supplierId: k === 1 ? SE : SU, validFrom: D(2026, 0, 1), validTo: null, sharePct: 100 })
      } else for (const [s, pct] of c.shares) shareRows.push({ systemId: sId, supplierId: s, validFrom: D(2026, 0, 1), validTo: D(2027, 11, 31), sharePct: pct })
    })
  })
  await db.supplierShare.createMany({ data: shareRows })
  await db.systemHistory.createMany({
    data: [
      { systemId: ID.elev, at: K(2026, 10, 14, 16, 5), userName: 'Олена Коваль', summary: 'Укрсбут 100% → Укрсбут 60% · Енергоінвест 40%' },
      { systemId: ID.elev, at: K(2026, 9, 29, 14, 20), userName: 'Олена Коваль', summary: 'Дозволена потужність: 200 → 220 кВт' },
      { systemId: ID.elev, at: K(2026, 9, 25, 10, 2), userName: 'Михайло Пацан', summary: 'Групу споживача встановлено: А' },
    ],
  })

  // ---------- споживання ----------
  const heights = [122, 135, 128, 118, 104, 96, 92, 100, 108, 124, 140, 158] // грудень 2025 … листопад 2026
  const monthsList = Array.from({ length: 12 }, (_, i) => ({ y: i === 0 ? 2025 : 2026, m: i === 0 ? 11 : i - 1 }))
  const monthTotalMwh = heights.map((h) => (h / 158) * 2460)
  const fixedElev: Record<string, { grid: number; gen: number }> = { '2026-8': { grid: 80900, gen: 7500 }, '2026-9': { grid: 90600, gen: 6600 }, '2026-10': { grid: 52600, gen: 4900 } }
  const fixedSklad: Record<string, number> = { '2026-8': 14200, '2026-9': 15800, '2026-10': 9100 }
  const fixedOffice: Record<string, number> = { '2026-8': 3100, '2026-9': 3400, '2026-10': 1900 }
  const fixedNamed = (sId: number, key: string): { grid: number; gen: number } | null =>
    sId === ID.elev ? fixedElev[key] ?? null : sId === ID.sklad && fixedSklad[key] ? { grid: fixedSklad[key], gen: 0 } : sId === ID.office && fixedOffice[key] ? { grid: fixedOffice[key], gen: 0 } : null

  const wA = new Map<number, number>(), wB = new Map<number, number>()
  systems.forEach((s) => { if ([ID.elev, ID.sklad, ID.office].includes(s.id)) return; (s.grp === 'A' ? wA : wB).set(s.id, 0.3 + rnd() * 1.7) })
  const monRows: Prisma.ConsumptionMonthlyCreateManyInput[] = []
  monthsList.forEach(({ y, m }, mi) => {
    const key = `${y}-${m}`
    const totalKwh = monthTotalMwh[mi] * 1000
    let fixA = 0, fixB = 0
    ;[ID.elev, ID.sklad, ID.office].forEach((sId) => { const f = fixedNamed(sId, key); if (f) { if (sId === ID.elev) fixA += f.grid + f.gen; else fixB += f.grid + f.gen } })
    const remA = totalKwh * 0.71 - fixA, remB = totalKwh * 0.29 - fixB
    const sumA = [...wA.values()].reduce((a, b) => a + b, 0), sumB = [...wB.values()].reduce((a, b) => a + b, 0)
    const month = D(y, m, 1)
    wA.forEach((w, sId) => { const t = (remA * w) / sumA, g = systems[sId - 1].gen ? t * 0.08 : 0; monRows.push({ systemId: sId, month, kwh: (t - g).toFixed(3), genKwh: g.toFixed(3), source: 'manual' }) })
    wB.forEach((w, sId) => { const t = (remB * w) / sumB, g = systems[sId - 1].gen ? t * 0.1 : 0; monRows.push({ systemId: sId, month, kwh: (t - g).toFixed(3), genKwh: g.toFixed(3), source: 'manual' }) })
    ;[ID.elev, ID.sklad, ID.office].forEach((sId) => {
      const f = fixedNamed(sId, key)
      if (f) monRows.push({ systemId: sId, month, kwh: f.grid, genKwh: f.gen, source: sId === ID.elev ? 'hourly' : 'manual' })
      else monRows.push({ systemId: sId, month, kwh: sId === ID.elev ? 85000 : sId === ID.sklad ? 14000 : 3000, genKwh: 0, source: sId === ID.elev ? 'hourly' : 'manual' })
    })
  })
  // для "жовтня/вересня" і т.д. елеватор: ключі виправлено: місяць 8=вересень, 9=жовтень, 10=листопад
  const fix = new Map<string, Prisma.ConsumptionMonthlyCreateManyInput>()
  monRows.forEach((r) => fix.set(`${r.systemId}-${(r.month as Date).toISOString()}`, r))
  for (let i = 0; i < monRows.length; i += 5000) await db.consumptionMonthly.createMany({ data: monRows.slice(i, i + 5000) })

  // погодинні значення елеватора (вер–лис 17), точно в суму місяця; 14 листопада = 3 380 кВт·год, пік 210
  const shape = (h: number) => 0.2 + 0.8 * Math.exp(-(((h - 11) / 5) ** 2))
  const S = Array.from({ length: 24 }, (_, h) => shape(h)).reduce((a, b) => a + b, 0)
  const bb = (24 * 210 - 3380) / (24 - S), aa = 210 - bb // a + b*shape; max(shape)≈1 at h≈11.5
  const base14 = Array.from({ length: 24 }, (_, h) => aa + bb * shape(h))
  const scale14 = 1
  const profile14 = base14.map((v) => v * scale14)
  const genShape = (h: number) => (h >= 7 && h <= 18 ? Math.exp(-(((h - 12.5) / 3.5) ** 2)) : 0)
  const hourRows: Prisma.ConsumptionHourlyCreateManyInput[] = []
  const spans: [number, number, number, number, number][] = [[2026, 8, 1, 30, 87]/*total MWh sum below*/, [2026, 9, 1, 31, 0], [2026, 10, 1, 17, 0]] as never
  const monthDefs = [{ y: 2026, m: 8, days: 30, tot: 88400, gen: 7500 }, { y: 2026, m: 9, days: 31, tot: 97200, gen: 6600 }, { y: 2026, m: 10, days: 17, tot: 57500, gen: 4900 }]
  void spans
  for (const md of monthDefs) {
    const days = Array.from({ length: md.days }, (_, i) => i + 1)
    const prof = new Map<number, number[]>()
    const isFixed = (d: number) => md.m === 10 && d === 14
    let fixedSum = 0
    days.forEach((d) => {
      const f = 0.88 + rnd() * 0.24
      const mean14 = base14.reduce((a, b) => a + b, 0) / 24
      const p = isFixed(d) ? profile14 : base14.map((v) => (0.45 * v + 0.55 * mean14) * f * (d % 7 === 0 || d % 7 === 6 ? 0.82 : 1))
      prof.set(d, p); if (isFixed(d)) fixedSum += p.reduce((a, b) => a + b, 0)
    })
    const otherSum = days.filter((d) => !isFixed(d)).reduce((a, d) => a + prof.get(d)!.reduce((x, y) => x + y, 0), 0)
    const k = (md.tot - fixedSum) / otherSum
    const genTotalShape = days.reduce((a) => a + Array.from({ length: 24 }, (_, h) => genShape(h)).reduce((x, y) => x + y, 0), 0)
    days.forEach((d) => {
      const p = prof.get(d)!
      p.forEach((v, h) => {
        const tot = isFixed(d) ? v : v * k
        const gen = Math.min((genShape(h) * md.gen) / genTotalShape, tot * 0.5)
        hourRows.push({ systemId: ID.elev, ts: K(md.y, md.m, d, h), kwh: (tot - gen).toFixed(3), genKwh: gen.toFixed(3) })
      })
    })
  }
  for (let i = 0; i < hourRows.length; i += 2000) await db.consumptionHourly.createMany({ data: hourRows.slice(i, i + 2000) })
  // місячний агрегат елеватора = сума годин (узгодження джерел)
  await db.$executeRawUnsafe(`
    INSERT INTO "ConsumptionMonthly" ("systemId","month","kwh","genKwh","source")
    SELECT "systemId", date_trunc('month', "ts" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Kyiv')::date, sum("kwh"), sum("genKwh"), 'hourly'
    FROM "ConsumptionHourly" GROUP BY 1,2
    ON CONFLICT ("systemId","month") DO UPDATE SET "kwh"=EXCLUDED."kwh","genKwh"=EXCLUDED."genKwh","source"='hourly'`)

  // ---------- угоди ----------
  type DealSpec = { clientId: number; funnel: typeof F1; stageIdx: number; product: string; amount: number; vol: number; owner: string; updated: Date; created: Date; note?: string; lost?: string; number?: number; hist: { from: string | null; to: string; by: string; at: Date }[] }
  const st1 = ['Новий контакт', 'Розмова', 'Пропозиція', 'Договір', 'Оплата', 'Втрачено']
  const deals: DealSpec[] = []
  const histFor = (names: string[], idx: number, by: string, end: Date, start: Date) => {
    const out: DealSpec['hist'] = []
    const steps = idx + 1
    for (let i = 0; i < steps; i++) {
      const at = new Date(start.getTime() + ((end.getTime() - start.getTime()) * i) / Math.max(steps - 1, 1))
      out.push({ from: i === 0 ? null : names[i - 1], to: names[i], by: i === 0 ? 'Михайло Пацан' : by, at })
    }
    return out
  }
  const nd = (c: string, idx: number, product: string, amount: number, vol: number, owner: string, upd: Date, extra: Partial<DealSpec> = {}) =>
    deals.push({ clientId: cid(c), funnel: F1, stageIdx: idx, product, amount, vol, owner, updated: upd, created: K(2026, 9, ri(10, 24)), hist: histFor(st1, idx === 5 ? 1 : idx, MN[owner], upd, K(2026, 9, 24, 9, 30)), ...extra })
  // стовпець «Новий контакт»
  nd('ТОВ «Зелений Дім»', 0, 'Бізнес Стандарт', 186400, 520, 'ОК', K(2026, 10, 17, 10))
  nd('ФОП Мельник О.', 0, 'Бізнес Мініум', 24800, 64, 'ДМ', K(2026, 10, 16, 10))
  nd('ПП «Будінвест»', 0, 'Бізнес Гарант', 612000, 1740, 'ІШ', K(2026, 10, 14, 10))
  // «Розмова»
  nd('ТОВ «Логістик Плюс»', 1, 'Бізнес Гарант', 840000, 2380, 'ОК', K(2026, 10, 17, 9))
  nd('ФОП Коваленко І.', 1, 'Бізнес Мініум', 38450, 96, 'АП', K(2026, 10, 15, 9))
  nd('ТОВ «Агрокомплекс»', 1, 'Бізнес Стандарт', 1120000, 3100, 'ДМ', K(2026, 10, 12, 9))
  nd('ТОВ «Агрохолдинг Схід»', 1, 'Бізнес Гарант', 238000, 680, 'ОК', K(2026, 10, 11, 9), { number: 203 })
  // «Пропозиція»
  nd('ПрАТ «Київхліб»', 2, 'Бізнес Стандарт', 287900, 810, 'ІШ', K(2026, 10, 13, 12))
  nd('Готель «Карпатія»', 2, 'Бізнес Стандарт', 96300, 270, 'СБ', K(2026, 10, 10, 12))
  // «Договір»
  nd('ТОВ «Теплобуд»', 3, 'Бізнес Гарант', 524000, 1490, 'ОК', K(2026, 10, 9, 12))
  nd('ФОП Гнатюк В.', 3, 'Бізнес Мініум', 31200, 80, 'ДМ', K(2026, 10, 9, 11))
  // «Оплата» (виграно)
  nd('ТОВ «Агрохолдинг Схід»', 4, 'Бізнес Стандарт', 412800, 1160, 'ОК', K(2026, 10, 17, 11, 42), { number: 187, created: K(2026, 9, 24, 9, 30), closedAtOverride: K(2026, 10, 17, 11, 42), note: 'Клієнт переходить від поточного постачальника з 1 грудня. Графік споживання групи А погоджено, генерації на об’єктах немає.', hist: [
    { from: null, to: 'Новий контакт', by: 'Михайло Пацан', at: K(2026, 9, 24, 9, 30) }, { from: 'Новий контакт', to: 'Розмова', by: 'Олена Коваль', at: K(2026, 9, 29, 14, 18) },
    { from: 'Розмова', to: 'Пропозиція', by: 'Олена Коваль', at: K(2026, 10, 6, 10, 20) }, { from: 'Пропозиція', to: 'Договір', by: 'Олена Коваль', at: K(2026, 10, 14, 16, 5) },
    { from: 'Договір', to: 'Оплата', by: 'Олена Коваль', at: K(2026, 10, 17, 11, 42) }] } as never)
  nd('ТОВ «Логістик Плюс»', 4, 'Бізнес Гарант', 150000, 2380, 'ІШ', K(2026, 10, 16, 15), { note: 'Аванс' })
  // «Втрачено»
  nd('ТОВ «Сигма»', 5, 'Бізнес Стандарт', 214000, 600, 'ІШ', K(2026, 10, 8, 12), { lost: 'Обрали іншого постачальника' })
  nd('ФОП Лисенко Р.', 5, 'Бізнес Мініум', 22600, 58, 'АП', K(2026, 10, 4, 12), { lost: 'Не відповідає' })

  const namedCnt = (idx: number) => deals.filter((d) => d.stageIdx === idx).length
  const namedBy = (idx: number, k: string) => deals.filter((d) => d.stageIdx === idx && d.owner === k).length
  const namedSum = (idx: number) => deals.filter((d) => d.stageIdx === idx).reduce((a, d) => a + d.amount, 0)

  // квоти менеджерів: у роботі, виграно, втрачено
  const quota = {
    work: { ОК: 52, ДМ: 44, ІШ: 38, АП: 31, СБ: 21 } as Record<string, number>,
    won: { ОК: 22, ДМ: 19, ІШ: 15, АП: 11, СБ: 7 } as Record<string, number>,
    lost: { ОК: 6, ДМ: 8, ІШ: 7, АП: 5, СБ: 3 } as Record<string, number>,
  }
  const wonSum: Record<string, number> = { ОК: 1120000, ДМ: 940000, ІШ: 780000, АП: 620000, СБ: 360000 }
  const wonVol: Record<string, number> = { ОК: 6840, ДМ: 5910, ІШ: 4620, АП: 3380, СБ: 2160 }
  for (const k of KEYS) {
    for (const idx of [0, 1, 2, 3]) quota.work[k] -= namedBy(idx, k)
    quota.won[k] -= namedBy(4, k); quota.lost[k] -= namedBy(5, k)
  }
  const stageTargets = [{ n: 71, s: 2900000 }, { n: 52, s: 3600000 }, { n: 38, s: 3400000 }, { n: 25, s: 2500000 }]
  const workOwners = shuffle(KEYS.flatMap((k) => Array(Math.max(quota.work[k], 0)).fill(k)))
  const clientsByMgr = (k: string) => cdefs.map((c, i) => ({ c, id: i + 1 })).filter((x) => x.c.mgr === k)
  const pickClient = (k: string) => pick(clientsByMgr(k)).id
  const prodForType = (cid_: number) => { const g = cdefs[cid_ - 1].grp; return g === 'A' ? pick(['Бізнес Стандарт', 'Бізнес Гарант']) : pick(['Бізнес Стандарт', 'Бізнес Мініум']) }
  const scaleTo = (arr: number[], target: number) => { const t = arr.reduce((a, b) => a + b, 0); const r = arr.map((v) => Math.round((v / t) * target / 100) * 100); r[r.length - 1] += target - r.reduce((a, b) => a + b, 0); return r }
  let oi = 0
  stageTargets.forEach((t, idx) => {
    const cnt = t.n - namedCnt(idx), sum = t.s - namedSum(idx)
    const amts = scaleTo(Array.from({ length: cnt }, () => 0.2 + rnd() * 1.8), sum)
    for (let j = 0; j < cnt; j++) {
      const owner = workOwners[oi++]; const c = pickClient(owner); const prod = prodForType(c)
      const upd = rnd() < 0.8 ? K(2026, 9, ri(10, 31), ri(9, 17)) : K(2026, 10, ri(1, 7), ri(9, 17)); const start = new Date(upd.getTime() - ri(5, 25) * 864e5)
      deals.push({ clientId: c, funnel: F1, stageIdx: idx, product: prod, amount: amts[j], vol: Math.max(Math.round((amts[j] * 12) / P[prod].price), 1), owner, updated: upd, created: start, hist: histFor(st1, idx, MN[owner], upd, start) })
    }
  })
  // виграні: суми й обсяги точно по менеджерах
  for (const k of KEYS) {
    const cnt = quota.won[k]
    const namedAmt = deals.filter((d) => d.stageIdx === 4 && d.owner === k).reduce((a, d) => a + d.amount, 0)
    const namedVol = deals.filter((d) => d.stageIdx === 4 && d.owner === k).reduce((a, d) => a + d.vol, 0)
    const amts = scaleTo(Array.from({ length: cnt }, () => 0.3 + rnd() * 1.7), wonSum[k] - namedAmt)
    const vols = scaleTo(Array.from({ length: cnt }, () => 0.3 + rnd() * 1.7), wonVol[k] - namedVol).map((v) => Math.max(v, 1))
    vols[cnt - 1] += wonVol[k] - namedVol - vols.reduce((a, b) => a + b, 0)
    for (let j = 0; j < cnt; j++) {
      const c = pickClient(k); const prod = prodForType(c); const upd = K(2026, 10, ri(1, 17), ri(9, 17)); const start = new Date(upd.getTime() - ri(12, 40) * 864e5)
      deals.push({ clientId: c, funnel: F1, stageIdx: 4, product: prod, amount: amts[j], vol: vols[j], owner: k, updated: upd, created: start, hist: histFor(st1, 4, MN[k], upd, start) })
    }
  }
  // втрачені: 29, 1,9 млн ₴
  const lostOwners = shuffle(KEYS.flatMap((k) => Array(Math.max(quota.lost[k], 0)).fill(k)))
  const lostN = 29 - namedCnt(5), lostAmts = scaleTo(Array.from({ length: lostN }, () => 0.2 + rnd() * 1.8), 1900000 - namedSum(5))
  for (let j = 0; j < lostN; j++) {
    const owner = lostOwners[j]; const c = pickClient(owner); const prod = prodForType(c); const upd = K(2026, 10, ri(1, 12), 12)
    deals.push({ clientId: c, funnel: F1, stageIdx: 5, product: prod, amount: lostAmts[j], vol: Math.max(Math.round((lostAmts[j] * 12) / P[prod].price), 1), owner, updated: upd, created: new Date(upd.getTime() - 20 * 864e5), lost: pick(dicts[1][1]), hist: histFor(st1, 1, MN[owner], upd, new Date(upd.getTime() - 20 * 864e5)) })
  }
  // воронки 2 і 3: 61 та 23 угоди в роботі
  const st2 = ['Новий контакт', 'Договір'], st3 = ['Нагадування', 'Пропозиція']
  for (let j = 0; j < 61; j++) { const owner = pick(KEYS); const c = pickClient(owner); const idx = j % 2; const upd = K(2026, 10, ri(1, 17), 12)
    deals.push({ clientId: c, funnel: F2, stageIdx: idx, product: 'Дім Базовий', amount: ri(8, 60) * 1000, vol: ri(10, 80), owner, updated: upd, created: new Date(upd.getTime() - 9 * 864e5), hist: histFor(st2, idx, MN[owner], upd, new Date(upd.getTime() - 9 * 864e5)) }) }
  for (let j = 0; j < 23; j++) { const owner = pick(KEYS); const c = pickClient(owner); const idx = j % 2; const upd = K(2026, 10, ri(1, 17), 12)
    deals.push({ clientId: c, funnel: F3, stageIdx: idx, product: 'Бізнес Стандарт', amount: ri(30, 200) * 1000, vol: ri(50, 400), owner, updated: upd, created: new Date(upd.getTime() - 14 * 864e5), hist: histFor(st3, idx, MN[owner], upd, new Date(upd.getTime() - 14 * 864e5)) }) }

  // нумерація: іменні №0187 і №0203 на своїх місцях, інші підряд
  const taken = new Set(deals.filter((d) => d.number).map((d) => d.number!))
  let nextNum = 1
  deals.forEach((d) => { if (!d.number) { while (taken.has(nextNum)) nextNum++; d.number = nextNum++ } })
  const dealRows: Prisma.DealCreateManyInput[] = deals.map((d, i) => ({
    id: i + 1, number: d.number!, clientId: d.clientId, funnelId: d.funnel.id, stageId: d.funnel.stages[d.stageIdx], productId: P[d.product].id,
    priceSnapshot: P[d.product].price, volumeMwh: d.vol, amount: d.amount, ownerId: M[d.owner], note: d.note ?? '', lostReason: d.lost ?? null,
    createdAt: d.created, updatedAt: d.updated, closedAt: [4, 5].includes(d.stageIdx) && d.funnel.id === F1.id ? d.updated : null,
  }))
  await db.deal.createMany({ data: dealRows })
  const histRows: Prisma.DealStageHistoryCreateManyInput[] = deals.flatMap((d, i) => d.hist.map((h) => ({ dealId: i + 1, fromStage: h.from, toStage: h.to, userName: h.by, at: h.at })))
  for (let i = 0; i < histRows.length; i += 3000) await db.dealStageHistory.createMany({ data: histRows.slice(i, i + 3000) })
  console.log('deals', deals.length)

  // ---------- оплати: одна на кожну виграну угоду ----------
  const payRows: Prisma.PaymentCreateManyInput[] = []
  deals.forEach((d, i) => {
    if (d.stageIdx !== 4 || d.funnel.id !== F1.id) return
    const isAdvance = d.note === 'Аванс'
    payRows.push({ dealId: i + 1, clientId: d.clientId, date: D(2026, 10, d.updated.getUTCDate()), purpose: isAdvance ? 'Аванс' : 'Рахунок за листопад', amount: d.amount, status: 'PAID' })
    if (d.number === 187) payRows.push({ dealId: i + 1, clientId: d.clientId, date: D(2026, 11, 15), purpose: 'Рахунок за грудень', amount: d.amount, status: 'PENDING' })
  })
  // оплати попереднього місяця (жовтень ≈ 3,41 млн ₴, щоб динаміка була +12%)
  const wonIdx = deals.map((d, i) => ({ d, i })).filter((x) => x.d.stageIdx === 4 && x.d.funnel.id === F1.id && x.d.number !== 187).slice(0, 60)
  const octAmts = (() => { const w = wonIdx.map(() => 0.3 + rnd() * 1.7); const t = w.reduce((a, b) => a + b, 0); const r = w.map((v) => Math.round((v / t) * 3410000 / 100) * 100); r[r.length - 1] += 3410000 - r.reduce((a, b) => a + b, 0); return r })()
  wonIdx.forEach((x, k) => payRows.push({ dealId: x.i + 1, clientId: x.d.clientId, date: D(2026, 9, ri(2, 28)), purpose: 'Рахунок за жовтень', amount: octAmts[k], status: 'PAID' }))
  await db.payment.createMany({ data: payRows })

  // ---------- спілкування: 641 за 1–17 листопада ----------
  const chan = { ОК: [121, 41, 22], ДМ: [98, 36, 18], ІШ: [80, 28, 13], АП: [61, 24, 11], СБ: [57, 20, 11] } as Record<string, number[]>
  const chNames = ['Дзвінок', 'Лист', 'Зустріч']
  const texts: Record<string, string[]> = {
    'Дзвінок': ['Уточнили обсяги споживання на наступний місяць.', 'Обговорили умови договору, клієнт просить час подумати.', 'Не додзвонились, передзвонити завтра.', 'Підтвердили оплату, питань немає.', 'Клієнт цікавиться гарантією ціни.'],
    'Лист': ['Надіслали комерційну пропозицію.', 'Відправили проєкт договору.', 'Надіслали графік споживання на погодження.', 'Нагадування про рахунок.'],
    'Зустріч': ['Зустріч в офісі клієнта, обговорили умови.', 'Підписання документів.', 'Презентація продукту.'],
  }
  const buckets: [number, number, number][] = [[1, 4, 134], [5, 8, 162], [9, 12, 188], [13, 17, 157]]
  const dayPool = shuffle(buckets.flatMap(([a, b, n]) => Array.from({ length: n }, () => ri(a, b))))
  const commRows: Prisma.CommunicationCreateManyInput[] = []
  // іменні записи Агрохолдингу
  const agro = cid('ТОВ «Агрохолдинг Схід»')
  const agroC: [string, number, number, number, number, string][] = [
    ['Дзвінок', 10, 17, 11, 30, 'Підтвердили оплату за листопад, питань немає.'], ['Зустріч', 10, 14, 15, 0, 'Підписали договір в офісі клієнта.'],
    ['Лист', 10, 10, 9, 12, 'Надіслали проєкт договору та графік споживання.'], ['Лист', 10, 6, 10, 5, 'Комерційна пропозиція на Бізнес Стандарт.'], ['Дзвінок', 9, 29, 14, 0, 'Перша розмова, 18 хв. Зацікавлені у групі А.'],
  ]
  agroC.forEach(([ch, m, d, h, mi, t]) => commRows.push({ clientId: agro, channel: ch, summary: t, authorId: M['ОК'], authorName: 'Олена Коваль', at: K(2026, m, d, h, mi) }))
  let di = 0
  const used: Record<string, number> = { ОК: 3, ДМ: 0, ІШ: 0, АП: 0, СБ: 0 } // іменні вже враховані у квоті ОК (4 за листопад: 17,14,10,6)
  for (const k of KEYS) {
    chan[k].forEach((cnt, ci) => {
      let n = cnt
      if (k === 'ОК') n -= agroC.filter((x) => x[0] === chNames[ci] && x[1] === 10).length
      for (let j = 0; j < n; j++) {
        const c = pickClient(k); const day = dayPool[di++ % dayPool.length]
        commRows.push({ clientId: c, channel: chNames[ci], summary: pick(texts[chNames[ci]]), authorId: M[k], authorName: MN[k], at: K(2026, 10, day, ri(9, 17), ri(0, 59)) })
      }
    })
  }
  void used
  // жовтневі (поза періодом)
  for (let j = 0; j < 400; j++) { const k = pick(KEYS); const ch = pick(chNames); commRows.push({ clientId: pickClient(k), channel: ch, summary: pick(texts[ch]), authorId: M[k], authorName: MN[k], at: K(2026, 9, ri(1, 31), ri(9, 17), ri(0, 59)) }) }
  for (let i = 0; i < commRows.length; i += 3000) await db.communication.createMany({ data: commRows.slice(i, i + 3000) })

  // ---------- закріплення, журнал ----------
  await db.clientAssignment.create({ data: { clientId: cid('ТОВ «Зелений Дім»'), fromUserId: M['ДМ'], toUserId: M['ОК'], byUserId: owner.id, at: K(2026, 10, 17, 9, 20) } })
  const auditRows: Prisma.AuditLogCreateManyInput[] = [
    { at: K(2026, 10, 17, 11, 42), userId: M['ОК'], userName: 'Олена Коваль', action: 'Етап угоди', entity: 'Угода', label: 'Угода №0187', details: 'Договір → Оплата' },
    { at: K(2026, 10, 17, 9, 20), userId: owner.id, userName: 'Михайло Пацан', action: 'Закріплення', entity: 'Клієнт', label: 'ТОВ «Зелений Дім»', details: 'Менеджер: Денис Мороз → Олена Коваль' },
    { at: K(2026, 10, 16, 17, 5), userId: M['ІШ'], userName: 'Ірина Шевчук', action: 'Налаштування споживача', entity: 'Система', label: 'ТОВ «Логістик Плюс» · Склад', details: 'Генерація: немає → СЕС, 150 кВт' },
    { at: K(2026, 10, 14, 16, 5), userId: M['ОК'], userName: 'Олена Коваль', action: 'Налаштування споживача', entity: 'Система', label: 'ТОВ «Агрохолдинг Схід»', details: 'Укрсбут 100% → Укрсбут 60% · Енергоінвест 40%' },
    { at: K(2026, 10, 13, 12, 30), userId: owner.id, userName: 'Михайло Пацан', action: 'Користувач', entity: 'Користувач', label: 'Софія Бондар', details: 'Статус: активний → заблокований' },
    { at: K(2026, 10, 12, 10, 15), userId: owner.id, userName: 'Михайло Пацан', action: 'Продукт', entity: 'Продукт', label: 'Бізнес Мініум', details: 'Ціна: 4 560 → 4 700 ₴/МВт·год' },
  ]
  const acts: [string, string, string][] = [['Етап угоди', 'Угода', 'Новий контакт → Розмова'], ['Клієнт', 'Клієнт', 'Створено клієнта'], ['Етап угоди', 'Угода', 'Розмова → Пропозиція'], ['Налаштування споживача', 'Система', 'Групу споживача змінено'], ['Закріплення', 'Клієнт', 'Менеджера змінено']]
  for (let j = 0; j < 476; j++) {
    const k = pick(KEYS); const [a, e, d] = pick(acts)
    auditRows.push({ at: K(2026, 9 + (j % 2 === 0 ? 1 : 0), ri(1, j % 2 === 0 ? 11 : 31), ri(9, 18), ri(0, 59)), userId: M[k], userName: MN[k], action: a, entity: e, label: cdefs[ri(0, cdefs.length - 1)].name, details: d })
  }
  await db.auditLog.createMany({ data: auditRows })

  // ---------- лічильники ----------
  for (const [t, c] of [['Client', 'id'], ['System', 'id'], ['Deal', 'id']] as const) await db.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${t}"','${c}'), (SELECT MAX("${c}") FROM "${t}"))`)
  await db.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"Deal"','number'), (SELECT MAX("number") FROM "Deal"))`)
  console.log('done · admin: mp@learntoearn.global / ' + DEMO_PASSWORD)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
