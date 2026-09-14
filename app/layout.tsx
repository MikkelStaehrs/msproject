import type { Metadata } from 'next'
import { Archivo, Bodoni_Moda } from 'next/font/google'
import './globals.css'

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-archivo',
  display: 'swap',
})

const bodoni = Bodoni_Moda({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-bodoni',
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
    <html lang="da" className={`${archivo.variable} ${bodoni.variable}`}>
      <body className="min-h-screen bg-paper text-ink">{children}</body>
    </html>
  )
}
