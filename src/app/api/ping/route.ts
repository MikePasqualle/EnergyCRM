import { getUser } from '@/server/auth'
export async function GET() {
  const u = await getUser() // оновлює ковзну сесію
  return Response.json({ ok: !!u })
}
