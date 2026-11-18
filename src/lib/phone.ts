/** Нормалізація телефону до +380XXXXXXXXX для пошуку дублікатів (FR-4.3) */
export function normPhone(raw: string): string {
  const d = raw.replace(/\D/g, '')
  if (d.startsWith('380') && d.length === 12) return '+' + d
  if (d.startsWith('0') && d.length === 10) return '+38' + d
  if (d.length === 9) return '+380' + d
  return d ? '+' + d : ''
}
export const normEmail = (e?: string | null) => (e ? e.trim().toLowerCase() : null)
export const validPhone = (raw: string) => /^\+380\d{9}$/.test(normPhone(raw))
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
