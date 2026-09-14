import type { Metadata } from 'next'
import { Archivo, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

/*
 * Two typefaces, and there is no serif. Archivo carries everything that is
 * read, IBM Plex Mono carries everything that is looked up: labels, dates,
 * identifiers, key figures and quick capture. See DESIGN_1.md §2.
 */
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-archivo',
  display: 'swap',
})

const plex = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Task Studio',
  description: 'Portfolio-manager',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="da" className={`${archivo.variable} ${plex.variable}`}>
      <body className="min-h-screen bg-paper text-ink">{children}</body>
    </html>
  )
}
