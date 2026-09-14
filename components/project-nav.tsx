'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * The project's sub navigation. Only pages that exist: a muted button leading
 * nowhere is worse than no button.
 *
 * Two of these pages understand a focused part, and for those the focus travels
 * with the link. Standing on Datahub Holeby and pressing Cost used to drop you
 * on the whole project, where the new line then defaulted back to the project:
 * the page followed the focus but the way into it did not carry one.
 *
 * The rest are project level by nature. Identity, Documents, Reports and Brief
 * describe the project as a whole, and handing them a focus would suggest they
 * were about the part.
 *
 * Basis sits directly above Cost because they read the same lines: one as a
 * specification, one as a total.
 */
const FOLLOWS_FOCUS = new Set(['', '/cost', '/meeting', '/grundlag'])

export function ProjectNav({ base }: { base: string }) {
  const pathname = usePathname()
  const search = useSearchParams()
  const focus = search.get('focus')

  const items: [string, string, string][] = [
    ['', base, 'Tree'],
    ['/identitet', `${base}/identitet`, 'Identity'],
    ['/grundlag', `${base}/grundlag`, 'Basis'],
    ['/cost', `${base}/cost`, 'Cost'],
    ['/dokumenter', `${base}/dokumenter`, 'Documents'],
    ['/rapporter', `${base}/rapporter`, 'Reports'],
    ['/brief', `${base}/brief`, 'Brief'],
    ['/meeting', `${base}/meeting`, 'Meeting'],
    ['/map', `${base}/map`, 'Map'],
  ]

  return (
    <nav className="overflow-x-auto py-5 pl-5 pr-5 lg:overflow-visible lg:py-7 lg:pl-16">
      {/*
        A column in the margin on a wide screen. On a phone there is no margin,
        so the nine pages become a row that scrolls sideways: nine stacked lines
        would push the page itself below the fold on every project view.
      */}
      <div className="flex w-max gap-5 lg:w-auto lg:flex-col lg:gap-2.5">
        {items.map(([suffix, href, label]) => {
          const current =
            suffix === '' ? pathname === base : pathname.startsWith(href)
          const target =
            focus && FOLLOWS_FOCUS.has(suffix) ? `${href}?focus=${focus}` : href

          return (
            <Link
              key={href}
              href={target}
              className={`lbl ${
                current
                  ? 'text-ink underline decoration-rule-strong underline-offset-4'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
