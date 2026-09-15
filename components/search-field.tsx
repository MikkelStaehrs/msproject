'use client'

import { useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'

/**
 * The search field.
 *
 * A plain GET form, so the query is the address and the results are rendered
 * on the server like every other list in the app: Enter submits it, the back
 * button returns to the previous search, and a link to `/search?q=` is a
 * search somebody else can open. The one piece of script is what a form
 * cannot do on its own: take focus the moment the page opens, and honour the
 * `Esc` the band promises. Escape on a field with text clears it; on an empty
 * field it leaves the page the way it was entered.
 *
 * 17 px mono, the concept's size for it. That is also above the 16 px under
 * which Safari zooms in on focus, so no pointer rule is needed here.
 */
export function SearchField({ q, count }: { q: string; count: number | null }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)

  return (
    <form
      action="/search"
      method="get"
      role="search"
      className="flex max-w-[900px] items-center gap-[14px] border-b border-line-strong pb-[11px]"
    >
      <Search size={20} strokeWidth={1} className="shrink-0 text-muted" aria-hidden />
      <input
        ref={input}
        name="q"
        defaultValue={q}
        autoFocus
        aria-label="Search"
        spellCheck={false}
        autoComplete="off"
        placeholder="Search"
        className="mono min-w-0 flex-1 border-0 bg-transparent p-0 text-[17px] text-ink outline-none placeholder:text-muted"
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          e.preventDefault()
          if (input.current && input.current.value !== '') {
            input.current.value = ''
            if (q !== '') router.push('/search')
          } else {
            router.back()
          }
        }}
      />
      {count !== null && (
        <span className="micro shrink-0 text-muted">
          {count} result{count === 1 ? '' : 's'}
        </span>
      )}
    </form>
  )
}
