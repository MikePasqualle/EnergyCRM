/** FR-7.7: на кожну дату сума часток постачальників системи дорівнює 100%, інакше збереження блокується */
export type ShareIn = { supplierId: number; validFrom: string; validTo: string | null; pct: number }

const addDay = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
export const fmtDate = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}` }

export function sharesSummary(shares: ShareIn[]): { ok: boolean; checks: { date: string; sum: number }[]; error?: string } {
  if (!shares.length) return { ok: true, checks: [] }
  for (const s of shares) {
    if (!/^\d{4}-\d\d-\d\d$/.test(s.validFrom)) return { ok: false, checks: [], error: 'Вкажіть дату початку дії для кожного постачальника' }
    if (s.validTo && !/^\d{4}-\d\d-\d\d$/.test(s.validTo)) return { ok: false, checks: [], error: 'Некоректна дата завершення' }
    if (s.validTo && s.validTo < s.validFrom) return { ok: false, checks: [], error: 'Дата завершення раніше за дату початку' }
    if (!Number.isInteger(s.pct) || s.pct < 1 || s.pct > 100) return { ok: false, checks: [], error: 'Частка має бути цілим числом від 1 до 100' }
  }
  const dates = new Set<string>()
  shares.forEach((s) => { dates.add(s.validFrom); if (s.validTo) dates.add(addDay(s.validTo, 1)) })
  const checks: { date: string; sum: number }[] = []
  for (const d of [...dates].sort()) {
    const act = shares.filter((s) => s.validFrom <= d && (!s.validTo || s.validTo >= d))
    if (!act.length) continue // проміжок без постачальника дозволений
    const sum = act.reduce((a, s) => a + s.pct, 0)
    checks.push({ date: d, sum })
  }
  const bad = checks.find((c) => c.sum !== 100)
  return { ok: !bad, checks, error: bad ? `Разом на ${fmtDate(bad.date)}: ${bad.sum} % — сума часток має дорівнювати 100 %` : undefined }
}
