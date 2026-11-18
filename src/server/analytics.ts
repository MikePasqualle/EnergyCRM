import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import type { Period } from './period'
import { kyivDate, todayKyiv } from './period'
import { dIso } from '@/lib/format'

export type Filters = { mgr: number | null; funnelId: number | null }

const mgrOwner = (f: Filters, col = 'd."ownerId"') => (f.mgr ? Prisma.sql`AND ${Prisma.raw(col)} = ${f.mgr}` : Prisma.empty)
const fun = (f: Filters, col = 'd."funnelId"') => (f.funnelId ? Prisma.sql`AND ${Prisma.raw(col)} = ${f.funnelId}` : Prisma.empty)

export async function dashboard(f: Filters, per: Period) {
  const clientWhere = f.mgr ? Prisma.sql`WHERE "managerId" = ${f.mgr}` : Prisma.empty
  const [st, work, closed, pay, payPrev, contacts, stages] = await Promise.all([
    db.$queryRaw<{ status: string; n: number }[]>`SELECT status::text, count(*)::int n FROM "Client" ${clientWhere} GROUP BY status`,
    db.$queryRaw<{ n: number; amt: number }[]>`SELECT count(*)::int n, coalesce(sum(d.amount),0)::float8 amt FROM "Deal" d JOIN "Stage" s ON s.id=d."stageId"
      WHERE s.type='WORKING' ${fun(f)} ${mgrOwner(f)}`,
    db.$queryRaw<{ type: string; n: number }[]>`SELECT s.type::text, count(*)::int n FROM "Deal" d JOIN "Stage" s ON s.id=d."stageId"
      WHERE s.type IN ('WON','LOST') AND d."closedAt" >= ${per.start} AND d."closedAt" < ${per.end} ${fun(f)} ${mgrOwner(f)} GROUP BY s.type`,
    db.$queryRaw<{ n: number; amt: number }[]>`SELECT count(*)::int n, coalesce(sum(p.amount),0)::float8 amt FROM "Payment" p JOIN "Deal" d ON d.id=p."dealId"
      WHERE p.status='PAID' AND p.date >= ${per.startDay}::date AND p.date < ${per.endDay}::date ${fun(f)} ${mgrOwner(f)}`,
    db.$queryRaw<{ amt: number }[]>`SELECT coalesce(sum(p.amount),0)::float8 amt FROM "Payment" p JOIN "Deal" d ON d.id=p."dealId"
      WHERE p.status='PAID' AND p.date >= ${per.prevStartDay}::date AND p.date < ${per.prevEndDay}::date ${fun(f)} ${mgrOwner(f)}`,
    db.$queryRaw<{ id: number; name: string; n: number }[]>`SELECT u.id, u.name, count(c.id)::int n FROM "User" u
      LEFT JOIN "Communication" c ON c."authorId"=u.id AND c.at >= ${per.start} AND c.at < ${per.end}
      WHERE u.status='ACTIVE' AND u."roleId" IN (SELECT id FROM "Role" WHERE "isAdmin"=false) ${f.mgr ? Prisma.sql`AND u.id = ${f.mgr}` : Prisma.empty}
      GROUP BY u.id ORDER BY n DESC, u.name LIMIT 4`,
    f.funnelId === null ? Promise.resolve(null) : null,
  ])
  void stages
  const byStatus = Object.fromEntries(st.map((r) => [r.status, r.n])) as Record<string, number>
  const clients = { total: (byStatus.COLD ?? 0) + (byStatus.WARM ?? 0) + (byStatus.ACTIVE ?? 0), cold: byStatus.COLD ?? 0, warm: byStatus.WARM ?? 0, active: byStatus.ACTIVE ?? 0 }
  const won = closed.find((r) => r.type === 'WON')?.n ?? 0
  const lost = closed.find((r) => r.type === 'LOST')?.n ?? 0

  // етапи обраної (або першої) воронки
  const funnel = f.funnelId
    ? await db.funnel.findUnique({ where: { id: f.funnelId } })
    : await db.funnel.findFirst({ where: { status: 'ACTIVE' }, orderBy: { position: 'asc' } })
  const stageRows = funnel
    ? await db.$queryRaw<{ id: number; name: string; type: string; color: string; n: number; amt: number }[]>`
        SELECT s.id, s.name, s.type::text, s.color, count(d.id)::int n, coalesce(sum(d.amount),0)::float8 amt
        FROM "Stage" s LEFT JOIN "Deal" d ON d."stageId"=s.id ${mgrOwner(f)}
          AND (s.type='WORKING' OR (d."closedAt" >= ${per.start} AND d."closedAt" < ${per.end}))
        WHERE s."funnelId"=${funnel.id} AND s.type <> 'LOST' GROUP BY s.id ORDER BY s.position`
    : []

  // споживання: ряд за 12 місяців
  const t = todayKyiv()
  const first = new Date(Date.UTC(t.y, t.m - 11, 1))
  const consWhere = f.mgr ? Prisma.sql`AND c."managerId" = ${f.mgr}` : Prisma.empty
  const series = await db.$queryRaw<{ month: Date; total: number; a: number; b: number; gen: number }[]>`
    SELECT m.month, sum(m.kwh+m."genKwh")::float8 total,
      coalesce(sum(CASE WHEN s."group"='A' THEN m.kwh+m."genKwh" END),0)::float8 a,
      coalesce(sum(CASE WHEN s."group"='B' THEN m.kwh+m."genKwh" END),0)::float8 b,
      coalesce(sum(m."genKwh"),0)::float8 gen
    FROM "ConsumptionMonthly" m JOIN "System" s ON s.id=m."systemId" JOIN "Client" c ON c.id=s."clientId"
    WHERE m.month >= ${dIso(first)}::date AND m.month <= ${dIso(new Date(Date.UTC(t.y, t.m, 1)))}::date ${consWhere}
    GROUP BY m.month ORDER BY m.month`
  const months12 = Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(t.y, t.m - 11 + i, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() } })
  const idx = (y: number, m: number) => series.find((r) => r.month.getUTCFullYear() === y && r.month.getUTCMonth() === m)
  const ser = months12.map(({ y, m }) => ({ y, m, total: idx(y, m)?.total ?? 0 }))
  const inPeriod = per.months.map(({ y, m }) => idx(y, m)).filter(Boolean) as typeof series
  const sumKwh = inPeriod.reduce((a, r) => a + r.total, 0)
  const aKwh = inPeriod.reduce((a, r) => a + r.a, 0), bKwh = inPeriod.reduce((a, r) => a + r.b, 0)

  const mFrom = per.months[0], mTo = per.months[per.months.length - 1]
  const sup = await db.$queryRaw<{ name: string | null; kwh: number }[]>`
    SELECT sup.name, sum((m.kwh+m."genKwh") * coalesce(sh."sharePct",100) / 100.0)::float8 kwh
    FROM "ConsumptionMonthly" m JOIN "System" s ON s.id=m."systemId" JOIN "Client" c ON c.id=s."clientId"
    LEFT JOIN "SupplierShare" sh ON sh."systemId"=s.id AND sh."validFrom" <= (m.month + interval '1 month - 1 day')::date AND (sh."validTo" IS NULL OR sh."validTo" >= m.month)
    LEFT JOIN "Supplier" sup ON sup.id=sh."supplierId"
    WHERE m.month >= ${dIso(kyivDate(mFrom.y, mFrom.m, 1, 12))}::date AND m.month <= ${dIso(kyivDate(mTo.y, mTo.m, 1, 12))}::date ${consWhere}
    GROUP BY sup.name ORDER BY kwh DESC`
  const named = sup.filter((r) => r.name)
  const topSup = named[0] ?? null
  const supTotal = named.reduce((a, r) => a + r.kwh, 0) // частки рахуємо серед обсягу з заданим постачальником

  const recent = await db.$queryRaw<{ client: string; purpose: string; product: string; amount: number }[]>`
    SELECT c.name client, p.purpose, pr.name product, p.amount::float8 amount FROM "Payment" p
    JOIN "Deal" d ON d.id=p."dealId" JOIN "Client" c ON c.id=p."clientId" JOIN "Product" pr ON pr.id=d."productId"
    WHERE p.status='PAID' AND p.date >= ${per.startDay}::date AND p.date < ${per.endDay}::date ${fun(f)} ${mgrOwner(f)}
    ORDER BY p.date DESC, p.amount DESC LIMIT 4`

  return {
    clients, work: work[0], won, lost, pay: pay[0], payPrevAmt: payPrev[0]?.amt ?? 0, contacts, funnel, stageRows, ser,
    cons: { total: sumKwh, a: aKwh, b: bKwh, gen: inPeriod.reduce((x, r) => x + r.gen, 0) },
    topSup: topSup && supTotal ? { name: topSup.name!, pct: Math.round((topSup.kwh / supTotal) * 100) } : null, recent,
  }
}

export type MgrRow = {
  id: number; name: string; email: string; clients: number; calls: number; mails: number; meets: number
  work: number; won: number; lost: number; wonSum: number; wonVol: number
}

/** FR-7.4: відпрацьовано менеджерами за період */
export async function managersReport(funnelId: number | null, per: Period, onlyUser: number | null = null) {
  const f: Filters = { mgr: null, funnelId }
  const rows = await db.$queryRaw<MgrRow[]>`
    SELECT u.id, u.name, u.email,
      (SELECT count(*)::int FROM "Client" c WHERE c."managerId"=u.id) clients,
      (SELECT count(*)::int FROM "Communication" m WHERE m."authorId"=u.id AND m.channel='Дзвінок' AND m.at >= ${per.start} AND m.at < ${per.end}) calls,
      (SELECT count(*)::int FROM "Communication" m WHERE m."authorId"=u.id AND m.channel='Лист' AND m.at >= ${per.start} AND m.at < ${per.end}) mails,
      (SELECT count(*)::int FROM "Communication" m WHERE m."authorId"=u.id AND m.channel='Зустріч' AND m.at >= ${per.start} AND m.at < ${per.end}) meets,
      (SELECT count(*)::int FROM "Deal" d JOIN "Stage" s ON s.id=d."stageId" WHERE d."ownerId"=u.id AND s.type='WORKING' ${fun(f)}) work,
      (SELECT count(*)::int FROM "Deal" d JOIN "Stage" s ON s.id=d."stageId" WHERE d."ownerId"=u.id AND s.type='WON' AND d."closedAt" >= ${per.start} AND d."closedAt" < ${per.end} ${fun(f)}) won,
      (SELECT count(*)::int FROM "Deal" d JOIN "Stage" s ON s.id=d."stageId" WHERE d."ownerId"=u.id AND s.type='LOST' AND d."closedAt" >= ${per.start} AND d."closedAt" < ${per.end} ${fun(f)}) lost,
      (SELECT coalesce(sum(d.amount),0)::float8 FROM "Deal" d JOIN "Stage" s ON s.id=d."stageId" WHERE d."ownerId"=u.id AND s.type='WON' AND d."closedAt" >= ${per.start} AND d."closedAt" < ${per.end} ${fun(f)}) "wonSum",
      (SELECT coalesce(sum(d."volumeMwh"),0)::float8 FROM "Deal" d JOIN "Stage" s ON s.id=d."stageId" WHERE d."ownerId"=u.id AND s.type='WON' AND d."closedAt" >= ${per.start} AND d."closedAt" < ${per.end} ${fun(f)}) "wonVol"
    FROM "User" u JOIN "Role" r ON r.id=u."roleId"
    WHERE r."isAdmin"=false ${onlyUser ? Prisma.sql`AND u.id = ${onlyUser}` : Prisma.empty}
    ORDER BY (SELECT count(*) FROM "Communication" m WHERE m."authorId"=u.id AND m.at >= ${per.start} AND m.at < ${per.end}) DESC, u.name`
  // за днями — для діаграми «по чотири дні»
  const daily = await db.$queryRaw<{ d: string; ch: string; n: number }[]>`
    SELECT to_char(m.at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Kyiv','YYYY-MM-DD') d, m.channel ch, count(*)::int n
    FROM "Communication" m WHERE m.at >= ${per.start} AND m.at < ${per.end} ${onlyUser ? Prisma.sql`AND m."authorId" = ${onlyUser}` : Prisma.empty}
    GROUP BY 1,2 ORDER BY 1`
  return { rows, daily }
}
