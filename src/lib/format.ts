const nf = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 })
const nf1 = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
const TZ = 'Europe/Kyiv'

export const n = (v: number | string | { toString(): string }) => nf.format(Number(v)).replace(/ /g, ' ')
export const n1 = (v: number) => nf1.format(v).replace(/ /g, ' ')
export const uah = (v: number | string | { toString(): string }) => `${n(Math.round(Number(v)))} ₴`
/** ₴ → «3,82 млн ₴» */
export const mln = (v: number) => `${nf.format(Math.round(v / 1e4) / 100).replace(/ /g, ' ')} млн ₴`

const MON = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру']
const MON_FULL = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня']
const MON_NOM = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень']
export const monShort = (i: number) => MON[i]
export const monNom = (i: number) => MON_NOM[i]

function parts(d: Date) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
  const o: Record<string, string> = {}
  for (const p of f.formatToParts(d)) o[p.type] = p.value
  return { y: +o.year, m: +o.month - 1, d: +o.day, hh: o.hour === '24' ? '00' : o.hour, mm: o.minute }
}
export const dShort = (d: Date) => { const p = parts(d); return `${p.d} ${MON[p.m]}` }
export const dTime = (d: Date) => { const p = parts(d); return `${p.d} ${MON[p.m]}, ${p.hh}:${p.mm}` }
export const dLong = (d: Date) => { const p = parts(d); return `${p.d} ${MON_FULL[p.m]} ${p.y}` }
export const dNum = (d: Date) => { const p = parts(d); return `${String(p.d).padStart(2, '0')}.${String(p.m + 1).padStart(2, '0')}.${p.y}` }
export const dShortY = (d: Date) => { const p = parts(d); return `${p.d} ${MON[p.m]} ${p.y}` }
export const dIso = (d: Date) => { const p = parts(d); return `${p.y}-${String(p.m + 1).padStart(2, '0')}-${String(p.d).padStart(2, '0')}` }
export const kyivNow = () => parts(new Date())
export const initials = (name: string) =>
  name.replace(/[«»"]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
export const AV = ['a1', 'a2', 'a3', 'a4', 'a5']
export const avCls = (id: number) => AV[id % AV.length]
