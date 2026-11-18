import ExcelJS from 'exceljs'
import { getUser } from '@/server/auth'
import { can, sees_all } from '@/server/permissions'
import { managersReport } from '@/server/analytics'
import { parsePeriod } from '@/server/period'
import { audit } from '@/server/audit'

export async function GET(req: Request) {
  const u = await getUser()
  if (!u || u.mustChangePassword || !can(u, 'analytics', 'view') || !sees_all(u)) return new Response('Forbidden', { status: 403 })
  const sp = new URL(req.url).searchParams
  const per = parsePeriod(sp.get('p') ?? undefined, sp.get('from') ?? undefined, sp.get('to') ?? undefined)
  const { rows } = await managersReport(Number(sp.get('f')) || null, per)
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Менеджери')
  ws.columns = [
    { header: 'Менеджер', key: 'name', width: 24 }, { header: 'Клієнтів', key: 'clients', width: 10 }, { header: 'Дзвінки', key: 'calls', width: 10 },
    { header: 'Листи', key: 'mails', width: 10 }, { header: 'Зустрічі', key: 'meets', width: 10 }, { header: 'Угод у роботі', key: 'work', width: 14 },
    { header: 'Виграно', key: 'won', width: 10 }, { header: 'Втрачено', key: 'lost', width: 10 }, { header: 'Сума виграних, ₴', key: 'wonSum', width: 18 }, { header: 'Обсяг, МВт·год', key: 'wonVol', width: 16 },
  ]
  ws.getRow(1).font = { bold: true }
  rows.forEach((r) => ws.addRow(r))
  await audit(u, 'Експорт', 'Звіт', 'Відпрацьовано менеджерами', per.label)
  const buf = await wb.xlsx.writeBuffer()
  return new Response(buf as ArrayBuffer, {
    headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="managers-${per.startDay}.xlsx"` },
  })
}
