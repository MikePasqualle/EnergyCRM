import type { NextConfig } from 'next'

const security = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const config: NextConfig = {
  serverExternalPackages: ['argon2', 'pg', 'exceljs'],
  async headers() {
    return [{ source: '/:path*', headers: security }]
  },
}
export default config
