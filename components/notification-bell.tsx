'use client'

import Link from 'next/link'
import { Bell } from 'lucide-react'
import { useEffect, useRef, useState, useTransition } from 'react'
import { markFeedSeen } from '@/lib/feed-actions'

/**
 * The bell, and the small panel under it.
 *
 * It was a link to /feed first, on the reasoning that a panel would be a
 * second, shorter copy of that page to keep saying the same thing. That was
 * wrong about what the panel is for. Opening it IS the act of having seen it:
 * the count clears because you looked, which is the whole gesture, and a page
 * you have to navigate to and then navigate back from is that gesture with two
 * extra steps in it.
 *
 * So the panel is not a summary of the feed. It is the notification itself,
 * and /feed is the archive it links to at the bottom.
 *
 * SEEN IS STAMPED ON OPEN, not on close and not per row. The badge goes to
 * nothing the moment the panel appears, locally, so it never lags behind the
 * eye; the server action makes that stick across a reload. If the write fails
 * the count comes back on the next page load, which is the right way round: a
 * boundary that did not save should not pretend it did.
 */
export type BellItem = {
  id: string
  href: string
  /** What happened, already cut to a line. */
  line: string
  /** The work it happened on. */
  where: string
  when: string
  glyph: string
  rust: boolean
  /** It arrived since the last time this was opened. */
  isNew: boolean
}

export function NotificationBell({
  unseen,
  items,
}: {
  unseen: number
  items: BellItem[]
}) {
  const [open, setOpen] = useState(false)
  const [cleared, setCleared] = useState(false)
  const [, startTransition] = useTransition()
  const box = useRef<HTMLSpanElement>(null)

  /*
   * What the panel showed when it opened, held still while it is open.
   *
   * Marking seen revalidates the layout, which re-renders the header with a
   * fresh count and fresh «new» marks. Without this the list would rearrange
   * itself under the eye of the person reading it and every dot would go out
   * a heartbeat after the panel appeared, which is the panel disagreeing with
   * the reason it was opened.
   */
  const [frozen, setFrozen] = useState<{ items: BellItem[]; unseen: number } | null>(null)

  /* Every way out is the same way out: closed, and the next open reads fresh. */
  const close = () => {
    setFrozen(null)
    setOpen(false)
  }

  /* A click anywhere else, or Escape, closes it. Nothing else does. */
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const count = cleared ? 0 : unseen
  const shown = frozen ?? { items, unseen }

  const toggle = () => {
    const next = !open
    if (next) {
      setFrozen({ items, unseen })
      if (unseen > 0 && !cleared) {
        setCleared(true)
        startTransition(() => {
          void markFeedSeen()
        })
      }
      setOpen(true)
    } else {
      close()
    }
  }

  return (
    <span ref={box} className="relative inline-block self-center leading-none">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={count === 0 ? 'What happened' : `What happened, ${count} new for you`}
        title="What happened"
        className="relative block cursor-pointer leading-none text-muted hover:text-green"
      >
        <Bell size={19} strokeWidth={1} aria-hidden="true" />
        {count > 0 && (
          <span
            aria-hidden="true"
            className="mono absolute -right-2 -top-1.5 min-w-[15px] rounded-full bg-rust px-[3px] text-center text-[9px] leading-[15px] text-inset"
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="What happened"
          className="absolute right-0 top-full z-40 mt-2 w-[min(360px,calc(100vw-32px))] border border-line-strong bg-inset text-left"
        >
          <div className="flex items-baseline justify-between gap-3 border-b border-line-strong px-3.5 py-2">
            <span className="lbl text-muted">What happened</span>
            {shown.unseen > 0 && (
              <span className="mono text-[10px] text-rust">{shown.unseen} new</span>
            )}
          </div>

          {shown.items.length === 0 ? (
            <p className="m-0 px-3.5 py-4 text-[12.5px] leading-relaxed text-muted">
              Nothing names you. Work you drive, and blockers waiting on you, show
              up here. Nothing you did yourself ever does.
            </p>
          ) : (
            <div className="max-h-[min(60vh,420px)] overflow-y-auto">
              {shown.items.map((i) => (
                <Link
                  key={i.id}
                  href={i.href}
                  onClick={close}
                  className="flex items-start gap-2.5 border-b border-line px-3.5 py-2.5 last:border-b-0 hover:bg-hover"
                >
                  <span
                    aria-hidden="true"
                    className={`mono w-[1em] shrink-0 pt-px text-center text-[12px] ${
                      i.rust ? 'text-rust' : 'text-muted'
                    }`}
                  >
                    {i.glyph}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] leading-snug text-ink">
                      {i.line}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] leading-snug text-muted">
                      {i.where} · {i.when}
                    </span>
                  </span>
                  {/*
                    What arrived since the last look, marked at the edge rather
                    than by shouting. It stays marked while the panel is open,
                    because it is the answer to «what is new» and clearing it
                    under your eyes would be the panel arguing with itself.
                  */}
                  {i.isNew && (
                    <span aria-label="New" className="mt-[5px] h-[5px] w-[5px] shrink-0 bg-rust" />
                  )}
                </Link>
              ))}
            </div>
          )}

          <Link
            href="/feed"
            onClick={close}
            className="block border-t border-line-strong px-3.5 py-2 text-[12px] text-muted hover:bg-hover hover:text-ink"
          >
            Everything that happened
          </Link>
        </div>
      )}
    </span>
  )
}
