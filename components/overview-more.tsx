'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

/**
 * The overflow. §4: visible in full colour, never dimmed, last in the row's
 * fixed columns, and a list of words on inset paper with a hairline round it.
 *
 * An item is a place to go or a line to write. The second kind opens the same
 * overlay Ctrl K does, on the node the row is about.
 */
export type MoreItem = {
  label: string
  href?: string
  /** Opens quick entry on this node instead of following a link. */
  nodeId?: string
  danger?: boolean
}

export function OverviewMore({ items, label }: { items: MoreItem[]; label: string }) {
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
