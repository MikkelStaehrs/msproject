'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * The header navigation. Routes that are not built yet are muted and are not
 * links, which is more honest than a button leading to an empty page.
 */
export function Nav() {
  const pathname = usePathname()
  const onProject = pathname.startsWith('/p/')

  return (
    <nav className="flex w-max items-baseline gap-7 whitespace-nowrap text-xs">
      <Link
        href="/"
        className={
          pathname === '/'
            ? 'border-b border-ink pb-0.5 font-medium text-ink'
            : 'text-muted hover:text-ink'
        }
      >
        Overview
      </Link>
      <Link
        href="/projects"
        className={
          onProject || pathname.startsWith('/projects')
            ? 'border-b border-ink pb-0.5 font-medium text-ink'
            : 'text-muted hover:text-ink'
        }
      >
        Projects
      </Link>
      <Link
        href="/spark"
        className={
          pathname.startsWith('/spark')
            ? 'border-b border-ink pb-0.5 font-medium text-ink'
            : 'text-muted hover:text-ink'
        }
      >
        Sparks
      </Link>
      <Link
        href="/strategy"
        className={
          pathname.startsWith('/strategy')
            ? 'border-b border-ink pb-0.5 font-medium text-ink'
            : 'text-muted hover:text-ink'
        }
      >
        Strategy
      </Link>
      <Link
        href="/blockers"
        className={
          pathname.startsWith('/blockers')
            ? 'border-b border-ink pb-0.5 font-medium text-ink'
            : 'text-muted hover:text-ink'
        }
      >
        Blockers
      </Link>
      <Link
        href="/standup"
        className={
          pathname.startsWith('/standup')
            ? 'border-b border-ink pb-0.5 font-medium text-ink'
            : 'text-muted hover:text-ink'
        }
      >
        Standup
      </Link>
      <Link
        href="/friday"
        className={
          pathname.startsWith('/friday')
            ? 'border-b border-ink pb-0.5 font-medium text-ink'
            : 'text-muted hover:text-ink'
        }
      >
        Friday
      </Link>
      <Link
        href="/templates"
        className={
          pathname.startsWith('/templates')
            ? 'border-b border-ink pb-0.5 font-medium text-ink'
            : 'text-muted hover:text-ink'
        }
      >
        Templates
      </Link>
      <Link
        href="/guide"
        className={
          pathname.startsWith('/guide')
            ? 'border-b border-ink pb-0.5 font-medium text-ink'
            : 'text-rule-strong hover:text-ink'
        }
      >
        Guide
      </Link>
    </nav>
  )
}
