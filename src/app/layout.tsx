import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin', 'cyrillic'], weight: ['400', '500', '600', '700'], variable: '--font-inter', display: 'swap' })

export const metadata: Metadata = { title: 'EnergyCRM', description: 'Внутрішня платформа продажу електроенергії' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk" className={inter.variable}>
      <body style={{ fontFamily: 'var(--font-inter), Inter, system-ui, -apple-system, sans-serif' }}>{children}</body>
    </html>
  )
}
