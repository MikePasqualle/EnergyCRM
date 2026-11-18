import { randomBytes } from 'node:crypto'

export const MIN_PASSWORD = 12

export function validatePassword(p: string): string | null {
  if (p.length < MIN_PASSWORD) return `Пароль має містити щонайменше ${MIN_PASSWORD} символів`
  if (!/[A-Za-zА-Яа-яІіЇїЄєҐґ]/.test(p) || !/\d/.test(p)) return 'Пароль має містити літери та цифри'
  return null
}

export function tempPassword() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz'
  const dig = '23456789'
  const pick = (set: string) => set[randomBytes(1)[0] % set.length]
  const groups = Array.from({ length: 4 }, () => pick(abc) + pick(abc) + pick(dig))
  return groups.join('-') // напр. Xt4-Rm9-Qw2-Lp7 (≥12 символів, літери й цифри)
}

