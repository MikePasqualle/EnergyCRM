import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const g = globalThis as unknown as { prisma?: PrismaClient }

export const db =
  g.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  })

if (process.env.NODE_ENV !== 'production') g.prisma = db
export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]
