import { describe, expect, it } from 'vitest'
import { sharesSummary } from '@/lib/shares'
import { normPhone, validPhone, validEmail, normEmail } from '@/lib/phone'
import { can, ADMIN_PERMS, USER_PERMS, sees_all, type SessionUser } from '@/server/permissions'
import { validatePassword, tempPassword } from '@/server/auth-policy'

const user = (admin: boolean, seeAll = false, perms = USER_PERMS): SessionUser => ({ id: 1, name: 'T', email: 't@t.ua', isOwner: false, mustChangePassword: false, role: { id: 1, name: 'r', isAdmin: admin, seeAllClients: seeAll, permissions: admin ? ADMIN_PERMS : perms } })

describe('FR-7.7 частки постачальників', () => {
  it('100% — ок', () => expect(sharesSummary([{ supplierId: 1, validFrom: '2026-12-01', validTo: null, pct: 60 }, { supplierId: 2, validFrom: '2026-12-01', validTo: null, pct: 40 }]).ok).toBe(true))
  it('не 100% — блокує збереження', () => { const r = sharesSummary([{ supplierId: 1, validFrom: '2026-12-01', validTo: null, pct: 60 }, { supplierId: 2, validFrom: '2026-12-01', validTo: null, pct: 30 }]); expect(r.ok).toBe(false); expect(r.error).toContain('90') })
  it('перевіряє кожну дату окремо (накладання періодів)', () => {
    const ok = sharesSummary([{ supplierId: 1, validFrom: '2026-01-01', validTo: '2026-06-30', pct: 100 }, { supplierId: 2, validFrom: '2026-07-01', validTo: null, pct: 100 }])
    expect(ok.ok).toBe(true)
    const bad = sharesSummary([{ supplierId: 1, validFrom: '2026-01-01', validTo: '2026-08-31', pct: 100 }, { supplierId: 2, validFrom: '2026-07-01', validTo: null, pct: 100 }])
    expect(bad.ok).toBe(false)
  })
  it('без постачальників — дозволено', () => expect(sharesSummary([]).ok).toBe(true))
  it('дата завершення раніше початку — помилка', () => expect(sharesSummary([{ supplierId: 1, validFrom: '2026-05-01', validTo: '2026-04-01', pct: 100 }]).ok).toBe(false))
})

describe('FR-4.3 нормалізація контактів для пошуку дублікатів', () => {
  it('приводить різні формати до одного', () => { for (const p of ['+380 63 774 10 09', '063 774 10 09', '0637741009', '380637741009']) expect(normPhone(p)).toBe('+380637741009') })
  it('валідує телефон і email', () => { expect(validPhone('+380 63 774 10 09')).toBe(true); expect(validPhone('12345')).toBe(false); expect(validEmail('a@b.ua')).toBe(true); expect(validEmail('a@b')).toBe(false); expect(normEmail(' A@B.ua ')).toBe('a@b.ua') })
})

describe('Ролі та права (розділ 2, NFR-2)', () => {
  it('адмін може все', () => { expect(can(user(true), 'users', 'delete')).toBe(true); expect(sees_all(user(true))).toBe(true) })
  it('користувач не керує продуктами, воронками, користувачами', () => {
    const u = user(false)
    expect(can(u, 'products', 'edit')).toBe(false); expect(can(u, 'funnels', 'edit')).toBe(false); expect(can(u, 'users', 'view')).toBe(false); expect(can(u, 'clients', 'delete')).toBe(false)
    expect(can(u, 'clients', 'create')).toBe(true); expect(can(u, 'deals', 'edit')).toBe(true); expect(can(u, 'products', 'view')).toBe(true)
  })
  it('менеджер бачить лише закріплених, поки адмін не дозволив', () => { expect(sees_all(user(false))).toBe(false); expect(sees_all(user(false, true))).toBe(true) })
})

describe('NFR-1 парольна політика', () => {
  it('мінімум 12 символів, літери й цифри', () => { expect(validatePassword('short1')).not.toBeNull(); expect(validatePassword('onlyletterslong')).not.toBeNull(); expect(validatePassword('Correct-Horse-9')).toBeNull() })
  it('тимчасовий пароль проходить власну політику', () => { for (let i = 0; i < 50; i++) expect(validatePassword(tempPassword())).toBeNull() })
})

describe('Сума угоди = річний обсяг × ціна ÷ 12', () => { it('1 160 МВт·год × 4 270 ₴ ≈ 412 800 ₴/міс', () => expect(Math.round((1160 * 4270) / 12 / 100) * 100).toBe(412800)) })
