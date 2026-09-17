'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

/**
 * The overflow. §4: visible in full colour, never dimmed, last in the row's
 * fixed columns, and a list of words on inset paper with a hairline round it.
 *
 * An item is a place to go, a line to write, or a thing to do. The second kind
 * opens the same overlay Ctrl K does, on the node the row is about. The third
 * posts a form to a server action, because moving a node among its siblings
 * and deleting one are writes and a link must never be a write.
 */
export type MoreItem = {
  label: string
  href?: string
  /** Opens quick entry on this node instead of following a link. */
  nodeId?: string
  danger?: boolean
  /** A server action the item posts to, with `fields` as its hidden inputs. */
  action?: (formData: FormData) => void | Promise<void>
  fields?: Record<string, string>
  /** What the browser asks before the form posts. Only for the irreversible. */
  confirm?: string
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
    'block w-full px-[13px] py-[9px] text-left text-[13px] leading-[1.4] hover:bg-hover'
  /* The hairline belongs to whatever sits directly in the menu, which for the
     posting items is the form and not the button inside it. */
  const rule = 'border-b border-line last:border-b-0'

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
                className={`${itemClass} ${rule} ${it.danger ? 'text-rust' : 'text-ink'}`}
                onClick={() => setOpen(false)}
              >
                {it.label}
              </Link>
            ) : it.action ? (
              /*
                The menu stays open while this posts. Closing it would unmount
                the form mid flight, and both of these actions end in a
                redirect that replaces the page anyway.
              */
              <form
                key={it.label}
                action={it.action}
                className={rule}
                onSubmit={(e) => {
                  if (it.confirm && !window.confirm(it.confirm)) e.preventDefault()
                }}
              >
                {Object.entries(it.fields ?? {}).map(([name, value]) => (
                  <input key={name} type="hidden" name={name} value={value} />
                ))}
                <button
                  type="submit"
                  role="menuitem"
                  className={`${itemClass} ${it.danger ? 'text-rust' : 'text-ink'}`}
                >
                  {it.label}
                </button>
              </form>
            ) : (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                className={`${itemClass} ${rule} ${it.danger ? 'text-rust' : 'text-ink'}`}
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
