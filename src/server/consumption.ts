import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { db, type Tx } from '@/lib/db'
import { kyivDate } from './period'

/** Місячний агрегат для групи А = сума погодин (джерело істини для аналітики; NFR-11) */
export async function recomputeMonth(systemId: number, y: number, m: number, tx: Tx | typeof db = db) {
  const start = kyivDate(y, m, 1, 0), end = kyivDate(y, m + 1, 1, 0)
  const rows = await tx.$queryRaw<{ kwh: number | null; gen: number | null; n: number }[]>(Prisma.sql`
    SELECT sum(kwh)::float8 kwh, sum("genKwh")::float8 gen, count(*)::int n FROM "ConsumptionHourly" WHERE "systemId"=${systemId} AND ts >= ${start} AND ts < ${end}`)
  const month = new Date(Date.UTC(y, m, 1))
  if (!rows[0].n) { await tx.consumptionMonthly.deleteMany({ where: { systemId, month, source: 'hourly' } }); return }
  await tx.consumptionMonthly.upsert({
    where: { systemId_month: { systemId, month } },
    create: { systemId, month, kwh: rows[0].kwh ?? 0, genKwh: rows[0].gen ?? 0, source: 'hourly' },
    update: { kwh: rows[0].kwh ?? 0, genKwh: rows[0].gen ?? 0, source: 'hourly' },
  })
}
