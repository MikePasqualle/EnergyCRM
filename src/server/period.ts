import { dIso } from '@/lib/format'

const TZ = 'Europe/Kyiv'
function kyivParts(d: Date) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', hour12: false })
  const o: Record<string, string> = {}
  for (const p of f.formatToParts(d)) o[p.type] = p.value
  return { y: +o.year, m: +o.month - 1, d: +o.day, h: +o.hour % 24 }
}
/** Миттєвість, що відповідає (y, m, d, h) за київським часом */
export function kyivDate(y: number, m: number, d: number, h = 0): Date {
  for (const off of [3, 2]) {
    const g = new Date(Date.UTC(y, m, d, h - off))
    const p = kyivParts(g)
    if (p.h === h && p.d === new Date(Date.UTC(y, m, d)).getUTCDate()) return g
  }
  return new Date(Date.UTC(y, m, d, h - 2))
}
export const todayKyiv = () => kyivParts(new Date())
const day = (y: number, m: number, d: number) => dIso(kyivDate(y, m, d, 12))

export type PeriodKey = 'week' | 'month' | 'quarter' | 'range'
export type Period = {
  key: PeriodKey; start: Date; end: Date; startDay: string; endDay: string
  prevStart: Date; prevEnd: Date; prevStartDay: string; prevEndDay: string
  label: string; monthWord: string; prevWord: string
  months: { y: number; m: number }[]
}
const MON_GEN = ['січні', 'лютому', 'березні', 'квітні', 'травні', 'червні', 'липні', 'серпні', 'вересні', 'жовтні', 'листопаді', 'грудні']
const MON_FOR = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень']
const MON_OF = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня']
export const monthFor = (m: number) => MON_FOR[m]
export const monthPrev = (m: number) => MON_OF[(m + 11) % 12]
void MON_GEN

export function parsePeriod(p?: string, from?: string, to?: string): Period {
  const t = todayKyiv()
  const key: PeriodKey = p === 'week' || p === 'quarter' || p === 'range' ? p : 'month'
  let sy = t.y, sm = t.m, sd = t.d, ey = t.y, em = t.m, ed = t.d
  let label = '', prevWord = 'до попереднього періоду'
  const add = (y: number, m: number, d: number, n: number) => { const x = new Date(Date.UTC(y, m, d + n)); return [x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()] as const }
  let months: { y: number; m: number }[] = []
  let ps: readonly [number, number, number], pe: readonly [number, number, number]
  if (key === 'week') {
    ;[sy, sm, sd] = add(t.y, t.m, t.d, -6); ;[ey, em, ed] = add(t.y, t.m, t.d, 1)
    ps = add(sy, sm, sd, -7); pe = [sy, sm, sd]
    label = 'останні 7 днів'
  } else if (key === 'quarter') {
    const q = Math.floor(t.m / 3)
    sy = t.y; sm = q * 3; sd = 1; ey = q === 3 ? t.y + 1 : t.y; em = (q * 3 + 3) % 12; ed = 1
    ps = q === 0 ? [t.y - 1, 9, 1] : [t.y, (q - 1) * 3, 1]; pe = [sy, sm, 1]
    label = `${['I', 'II', 'III', 'IV'][q]} квартал ${t.y}`
  } else if (key === 'range' && from && to && /^\d{4}-\d\d-\d\d$/.test(from) && /^\d{4}-\d\d-\d\d$/.test(to) && from <= to) {
    const [a, b, c] = from.split('-').map(Number), [x, y, z] = to.split('-').map(Number)
    sy = a; sm = b - 1; sd = c; ;[ey, em, ed] = add(x, y - 1, z, 1)
    const len = Math.round((Date.UTC(ey, em, ed) - Date.UTC(sy, sm, sd)) / 864e5)
    ps = add(sy, sm, sd, -len); pe = [sy, sm, sd]
    label = `${c}.${String(b).padStart(2, '0')}–${z}.${String(y).padStart(2, '0')}.${x}`
  } else {
    sy = t.y; sm = t.m; sd = 1; ;[ey, em] = t.m === 11 ? [t.y + 1, 0] : [t.y, t.m + 1]; ed = 1
    ps = t.m === 0 ? [t.y - 1, 11, 1] : [t.y, t.m - 1, 1]; pe = [sy, sm, 1]
    label = `${MON_FOR[t.m]}`
    prevWord = `до ${MON_OF[(t.m + 11) % 12]}`
  }
  const eff: PeriodKey = key === 'range' && !label.includes('–') ? 'month' : key
  // місяці, що перетинають період (для споживання)
  let cy = sy, cm = sm
  const endMonthIdx = ey * 12 + em - (ed === 1 ? 1 : 0)
  while (cy * 12 + cm <= endMonthIdx) { months.push({ y: cy, m: cm }); cm++; if (cm > 11) { cm = 0; cy++ } }
  if (!months.length) months = [{ y: sy, m: sm }]
  // слово для підпису споживання
  const monthWord = eff === 'month' ? `за ${MON_FOR[sm]}` : eff === 'quarter' ? 'за квартал' : 'за обраний період'
  return {
    key: eff, start: kyivDate(sy, sm, sd), end: kyivDate(ey, em, ed), startDay: day(sy, sm, sd), endDay: day(ey, em, ed),
    prevStart: kyivDate(ps[0], ps[1], ps[2]), prevEnd: kyivDate(pe[0], pe[1], pe[2]), prevStartDay: day(ps[0], ps[1], ps[2]), prevEndDay: day(pe[0], pe[1], pe[2]),
    label, monthWord, prevWord, months,
  }
}
