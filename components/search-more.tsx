'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

/**
 * The overflow at the end of a search row.
 *
 * §4: the row itself opens what it found, and the one visible affordance
 * beside it is the `⋯`, in full colour and never dimmed. What it opens is a
 * list of words on inset paper behind one hairline: no shadow, no radius.
 *
 * Two kinds of item. A link goes somewhere, and every form on the work page
 * is already reachable by address, so «Edit» and «Add a part» are links there.
 * «Write a line» is the one thing that is not an address: it opens the same
 * overlay Ctrl K does, on the node the row is about, which is why this is a
 * client component rather than a `details`.
 */
export type SearchMoreItem = {
  label: string
  href?: string
  /** Opens quick entry on this node instead of following a link. */
  nodeId?: string
  danger?: boolean
}

export function SearchMore({ items, label }: { items: SearchMoreItem[]; label: string }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)

  /* A click anywhere else, or Escape, closes it. Nothing else does. */
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const itemClass =
    'block w-full border-b border-line px-[13px] py-[9px] text-left text-[13px] leading-[1.4] last:border-b-0 hover:bg-hover'

  return (
    <span ref={box} className="relative z-10 inline-block">
      <button
        type="button"
        className="more"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More on ${label}`}
        onClick={() => setOpen((o) => !o)}
      >
        &#8943;
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 min-w-[200px] border border-line-strong bg-inset"
        >
          {items.map((it) =>
            it.href ? (
              <Link
                key={it.label}
                role="menuitem"
                href={it.href}
                className={`${itemClass} ${it.danger ? 'text-rust' : 'text-ink'}`}
                onClick={() => setOpen(false)}
              >
                {it.label}
              </Link>
            ) : (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                className={`${itemClass} ${it.danger ? 'text-rust' : 'text-ink'}`}
                onClick={() => {
                  setOpen(false)
                  if (it.nodeId) {
                    window.dispatchEvent(
                      new CustomEvent('quickadd:open', { detail: { nodeId: it.nodeId } }),
                    )
                  }
                }}
              >
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </span>
  )
}
