import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src'), 'server-only': path.resolve(__dirname, 'tests/stub-server-only.ts') } },
  test: { include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'], environment: 'node', env: { DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://mikepatsan@localhost:5432/energycrm' }, testTimeout: 30000 },
})
