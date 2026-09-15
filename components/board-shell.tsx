'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * The board's hands: dragging a card, and walking it from the keyboard.
 *
 * Everything inside is server rendered and stays that way. This adds the two
 * things a server cannot do, and nothing else: it holds no copy of the board
 * and decides nothing about what is on it.
 *
 * A DROP DOES NOT MOVE ANYTHING. It opens the task with the new state already
 * chosen and the line still to write, because the move is not finished until it
 * says why. That is also the honest drawing: an optimistic card sitting in the
 * Done column before anything has been recorded is the board telling you
 * something the database does not know.
 *
 * Landing place is one indented hairline. The card is not lifted, not shadowed
 * and not rotated.
 */
export function BoardShell({
  openHref,
  moveHref,
  children,
}: {
  /** `{id}` is replaced with the node. */
  openHref: string
  /** `{id}` and `{status}` are replaced. */
  moveHref: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const box = useRef<HTMLDivElement>(null)
  const [cursor, setCursor] = useState(-1)

  const cards = () =>
    box.current ? Array.from(box.current.querySelectorAll<HTMLElement>('[data-card]')) : []

  /* Keyboard: J and K walk, Enter opens. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.closest('input, textarea, select') || t.isContentEditable)) return
      const list = cards()
      if (list.length === 0) return

      if (e.key === 'j' || e.key === 'J' || e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        const step = e.key.toLowerCase() === 'j' ? 1 : -1
        const next = Math.max(0, Math.min(cursor < 0 ? 0 : cursor + step, list.length - 1))
        setCursor(next)
        list[next].scrollIntoView({ block: 'nearest' })
      }

      if (e.key === 'Enter' && cursor >= 0 && list[cursor]) {
        e.preventDefault()
        router.push(openHref.replace('{id}', list[cursor].dataset.card ?? ''))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cursor, openHref, router])

  useEffect(() => {
    cards().forEach((c, i) => c.classList.toggle('cursor-card', i === cursor))
  })

  /* Dragging. The line is a real element so it pushes the cards apart. */
  const line = useRef<HTMLDivElement | null>(null)
  const dragged = useRef<string | null>(null)

  const getLine = () => {
    if (!line.current) {
      const el = document.createElement('div')
      el.className = 'droprow'
      line.current = el
    }
    return line.current
  }
  const clearLine = () => {
    const el = line.current
    if (el && el.parentNode) el.parentNode.removeChild(el)
  }

  return (
    <div
      ref={box}
      onDragStart={(e) => {
        const card = (e.target as HTMLElement).closest<HTMLElement>('[data-card]')
        if (!card) return
        dragged.current = card.dataset.card ?? null
        card.classList.add('dragging')
        e.dataTransfer.effectAllowed = 'move'
        try {
          e.dataTransfer.setData('text/plain', dragged.current ?? '')
        } catch {
          /* Safari refuses an empty payload; the ref is the real carrier. */
        }
      }}
      onDragEnd={() => {
        dragged.current = null
        clearLine()
        cards().forEach((c) => c.classList.remove('dragging'))
      }}
      onDragOver={(e) => {
        if (!dragged.current) return
        const col = (e.target as HTMLElement).closest<HTMLElement>('[data-col]')
        if (!col) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        const here = Array.from(col.querySelectorAll<HTMLElement>('[data-card]')).filter(
          (c) => !c.classList.contains('dragging'),
        )
        const before = here.find((c) => {
          const r = c.getBoundingClientRect()
          return e.clientY < r.top + r.height / 2
        })
        if (before) col.insertBefore(getLine(), before)
        else col.appendChild(getLine())
      }}
      onDrop={(e) => {
        const id = dragged.current
        const col = (e.target as HTMLElement).closest<HTMLElement>('[data-col]')
        if (!id || !col) return
        e.preventDefault()
        dragged.current = null
        clearLine()
        router.push(moveHref.replace('{id}', id).replace('{status}', col.dataset.col ?? ''))
      }}
    >
      {children}
    </div>
  )
}
