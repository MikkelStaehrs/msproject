'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Five destinations, and nothing else.
 *
 * It carried nine before, and the nine were not the same kind of thing: places
 * you look, rituals that have a time, and tools. Nine peers in one voice means
 * you have to know the whole application before you can find anything in it.
 *
 * What left is not gone. Blockers, Friday and the spark inbox are cuts of the
 * log stream and are reached from where they belong; Templates and the Guide
 * are tools and sit with the account. Read, Work and Files are states of a
 * project and live in its left rail, never up here.
 */
const ITEMS: [string, string, (p: string) => boolean][] = [
  ['/', 'Overview', (p) => p === '/'],
  ['/projects', 'Projects', (p) => p.startsWith('/projects') || p.startsWith('/p/')],
  ['/spark', 'Sparks', (p) => p.startsWith('/spark')],
  ['/standup', 'Stand-up', (p) => p.startsWith('/standup')],
  ['/strategy', 'Budget', (p) => p.startsWith('/strategy')],
]

export function Nav() {
  const pathname = usePathname()

  return (
    <nav className="flex w-max items-baseline gap-6 whitespace-nowrap text-[15px]">
      {ITEMS.map(([href, label, isCurrent]) => (
        <Link
          key={href}
          href={href}
          aria-current={isCurrent(pathname) ? 'page' : undefined}
          className={
            isCurrent(pathname)
              ? 'font-semibold text-green'
              : 'text-ink hover:text-green'
          }
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
