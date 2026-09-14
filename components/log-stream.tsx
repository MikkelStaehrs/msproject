'use client'

import { useState } from 'react'
import Link from 'next/link'

/**
 * One log stream, four kinds.
 *
 * The right column carried four sections: Work log, Blockers, Decisions and
 * Sequence. They are four tables in the database and they were four headings
 * on the screen, which is the schema showing through the interface. What a
 * person has is one question, «what has happened here», and the answer is one
 * list in date order.
 *
 * So the four become one stream with a glyph in front, and the four headings
 * become four switches. Nothing is merged in the database: this composes what
 * the frame already fetched. The glyphs are the ones quick entry already
 * parses, which is why they are these four and not four icons.
 *
 *   ·  a line of work        !  a blocker
 *   ?  a decision            →  an order between two pieces of work
 */

export type LogKind = 'work' | 'blocker' | 'decision' | 'sequence'

export type LogItem = {
  id: string
  kind: LogKind
  /** ISO date, or null for a relation that carries no date of its own. */
  date: string | null
  /** Already formatted, because the server owns the one spelling of a date. */
  when: string | null
  line: string
  note?: string | null
  href?: string | null
  /** Rust means a person has to do something before anything else happens. */
  rust?: boolean
  /** A count at the right of the row: waiting days, mostly. */
  right?: string | null
  /** An action that differs from «open»: Chase, Close, Remove. */
  action?: { label: string; href: string } | null
}

const GLYPH: Record<LogKind, string> = {
  work: '·',
  blocker: '!',
  decision: '?',
  sequence: '→',
}

const FILTERS: [LogKind | 'all', string][] = [
  ['all', 'Everything'],
  ['work', '· Work'],
  ['blocker', '! Blocked'],
  ['decision', '? Decided'],
  ['sequence', '→ Order'],
]

export function LogStream({ items, empty }: { items: LogItem[]; empty: string }) {
  const [kind, setKind] = useState<LogKind | 'all'>('all')
  const shown = kind === 'all' ? items : items.filter((i) => i.kind === kind)

  return (
    <div>
      <div className="filterrow mt-3">
        {FILTERS.map(([k, label]) => {
          const n = k === 'all' ? items.length : items.filter((i) => i.kind === k).length
          return (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              disabled={n === 0 && k !== 'all'}
              className={n === 0 && k !== 'all' ? 'opacity-40' : undefined}
            >
              {label} {n > 0 ? n : ''}
            </button>
          )
        })}
      </div>

      {shown.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted">{empty}</p>
      ) : (
        <div className="panel mt-3.5">
          {shown.map((i) => (
            <div
              key={i.id}
              className="flex items-start gap-3 border-b border-rule px-3.5 py-3 last:border-b-0 hover:bg-hover"
            >
              <span
                className={`mono w-[1.1em] shrink-0 text-center ${
                  i.rust ? 'text-oxblood' : 'text-muted'
                }`}
              >
                {GLYPH[i.kind]}
              </span>
              <div className="min-w-0 flex-1">
                {i.href ? (
                  <Link href={i.href} className="block leading-snug hover:text-green">
                    {i.line}
                  </Link>
                ) : (
                  <div className="leading-snug">{i.line}</div>
                )}
                {i.note && (
                  <div className="mt-1 text-[12px] leading-snug text-muted">{i.note}</div>
                )}
              </div>
              {i.right && (
                <span
                  className={`mono shrink-0 text-[11px] ${
                    i.rust ? 'text-oxblood' : 'text-muted'
                  }`}
                >
                  {i.right}
                </span>
              )}
              {i.action && (
                <Link href={i.action.href} className="act shrink-0">
                  {i.action.label}
                </Link>
              )}
              {i.when && (
                <span className="mono shrink-0 pt-0.5 text-[9.5px] uppercase tracking-[0.1em] text-muted">
                  {i.when}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
