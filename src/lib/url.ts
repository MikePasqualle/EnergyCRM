export type SP = Record<string, string | string[] | undefined>
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
/** Збирає query-рядок з поточних параметрів із заміною/видаленням ключів */
export function qs(sp: SP, patch: Record<string, string | number | null | undefined> = {}, base = ''): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) { const x = one(v); if (x !== undefined && x !== '') p.set(k, x) }
  for (const [k, v] of Object.entries(patch)) { if (v === null || v === undefined || v === '') p.delete(k); else p.set(k, String(v)) }
  const s = p.toString()
  return base + (s ? `?${s}` : '')
}
