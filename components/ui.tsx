import { blocks, describe, opening, spans, type Block } from '@/lib/prose'
import type { EffectiveStatus, NodeStatus } from '@/lib/types'

/* -------------------------------------------------------------------------
   Date format. One place, so the whole app writes dates the same way.
   ------------------------------------------------------------------------- */

const shortDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
})

const longDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** '2026-09-06' -> '6 Sep' */
export function formatDate(iso: string) {
  return shortDate.format(new Date(iso + 'T00:00:00'))
}

/** '2026-09-06' -> '6 September 2026' */
export function formatDateLong(iso: string) {
  return longDate.format(new Date(iso + 'T00:00:00'))
}

/** Days to or from a date, phrased as a sentence. */
export function relativeDays(days: number) {
  if (days === 0) return 'today'
  if (days < 0) return `${Math.abs(days)} days overdue`
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

/* -------------------------------------------------------------------------
   Status mark: a 7 px square plus a word. Never colour alone.
   ------------------------------------------------------------------------- */

const MARK: Record<EffectiveStatus, string> = {
  idea: 'border border-muted',
  planned: 'border border-muted',
  active: 'bg-green',
  blocked: 'bg-oxblood',
  paused: 'border border-oxblood',
  done: 'bg-ink',
  cancelled: 'bg-rule-strong',
}

/**
 * `blocked` is not a status you can choose, so it arrives beside the status
 * rather than inside it. An open blocker wins the mark: it is the thing that
 * needs someone to act.
 */
export function StatusMark({
  status,
  blocked = false,
}: {
  status: NodeStatus
  blocked?: boolean
}) {
  return <span className={`block size-[7px] shrink-0 ${MARK[blocked ? 'blocked' : status]}`} />
}

/* -------------------------------------------------------------------------
   Progress scale: one cell per task in the subtree. Never editable.
   Above 24 tasks the cells become unreadable and it falls back to one bar.
   ------------------------------------------------------------------------- */

export function ProgressScale({ done, total }: { done: number; total: number }) {
  if (total === 0) {
    return <span className="block h-1.5 flex-1 bg-empty" />
  }

  if (total > 24) {
    const pct = Math.round((100 * done) / total)
    return (
      <span className="block h-1.5 flex-1 bg-empty">
        <span className="block h-full bg-green" style={{ width: `${pct}%` }} />
      </span>
    )
  }

  return (
    <span className="flex flex-1 gap-0.5">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 flex-1 ${i < done ? 'bg-green' : 'bg-empty'}`}
        />
      ))}
    </span>
  )
}

/** Progress as a full row: the scale, the percentage and the task count. */
export function ProgressRow({
  done,
  total,
  pct,
}: {
  done: number
  total: number
  pct: number
}) {
  return (
    <div className="flex items-center gap-4">
      <ProgressScale done={done} total={total} />
      <span className="num min-w-[52px] text-right text-xl">{pct} %</span>
      <span className="min-w-[54px] text-[11px] tabular-nums text-muted">
        {done} of {total}
      </span>
    </div>
  )
}

/* -------------------------------------------------------------------------
   Rules
   ------------------------------------------------------------------------- */

export function Rule({ strong = false }: { strong?: boolean }) {
  return <div className={`h-px ${strong ? 'bg-rule-strong' : 'bg-rule'}`} />
}

/* -------------------------------------------------------------------------
   Help text as a tooltip.

   The label gets a dotted underline and carries the explanation itself: no
   extra glyph, no icons. Pure CSS, so it works without JavaScript. It also
   solves the hint text that wrapped to two lines and pushed its field down,
   breaking the alignment of the row.
   ------------------------------------------------------------------------- */

export function Hint({ children, text }: { children: React.ReactNode; text: string }) {
  return (
    <span className="group relative inline-block">
      {/* No tabIndex: the label must not add a tab stop in front of every
          single field in an app that is keyboard first. The title attribute
          is the fallback for anyone not using a mouse. */}
      <span
        title={text}
        className="cursor-help border-b border-dotted border-rule-strong"
      >
        {children}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-30 mt-2 hidden w-60 border border-ink bg-sheet px-3 py-2 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-ink group-hover:block"
      >
        {text}
      </span>
    </span>
  )
}

/* -------------------------------------------------------------------------
 * Written text
 * ---------------------------------------------------------------------- */

/**
 * A description, shown the way it was typed.
 *
 * Four pages were each rendering `node.description` inside a single <p>, and
 * HTML collapses whitespace, so the paragraphs somebody wrote arrived as one
 * slab. `whitespace-pre-line` keeps the line breaks inside a paragraph; the
 * gap between paragraphs is real spacing rather than an empty line, because a
 * blank line in a textarea is a paragraph break, not a blank line.
 */
export function Prose({
  text,
  className = '',
}: {
  text: string | null | undefined
  className?: string
}) {
  const parts = blocks(text)
  if (parts.length === 0) return null

  return (
    <div className={`flex flex-col gap-2.5 ${className}`}>
      {parts.map((b, i) => (
        <ProseBlock key={i} block={b} />
      ))}
    </div>
  )
}

/**
 * A paragraph, or a table where the paragraph was written as one.
 *
 * The note stays plain text: nothing is stored as a structure, and the raw
 * lines remain editable, greppable and printable. A model writes pipe rows
 * unprompted when the thing is a list of items with numbers against them, and
 * three cabinet quotes read as three cabinet quotes rather than as a sentence
 * with commas in it.
 */
function ProseBlock({ block }: { block: Block }) {
  if (block.kind === 'text') {
    return (
      <p className="whitespace-pre-line leading-relaxed">
        <Marked text={block.text} />
      </p>
    )
  }

  return (
    /* Its own scroller: a wide table must never make the page scroll. */
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[18rem] border-collapse text-left">
        {block.head && (
          <thead>
            <tr className="border-b border-rule-strong">
              {block.head.map((cell, i) => (
                <th
                  key={i}
                  className="lbl-tight py-1.5 pr-5 align-baseline font-medium text-muted last:pr-0"
                >
                  <Marked text={cell} />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {block.rows.map((row, r) => (
            <tr key={r} className="border-b border-rule last:border-0">
              {row.map((cell, c) => (
                <td
                  key={c}
                  /* Numbers line up under each other; words do not need to. */
                  className={`py-1.5 pr-5 align-baseline last:pr-0 ${
                    /^[\d\s.,+-]+$/.test(cell) ? 'num tabular-nums' : ''
                  }`}
                >
                  <Marked text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The same, cut to its opening with the rest a click away.
 *
 * A specification worth writing runs to four paragraphs, and four paragraphs
 * at the top of every page pushes the work itself below the fold. The cut is a
 * paragraph rather than a character count: an opening paragraph reads as an
 * opening, where a sentence stopped mid-clause reads as damage.
 *
 * `details` rather than state, so this stays a server component, survives
 * printing and needs no JavaScript to open.
 */
export function ProseOpening({
  text,
  className = '',
}: {
  text: string | null | undefined
  className?: string
}) {
  const { first, rest } = opening(text)
  if (first === null) return null

  return (
    <div className={className}>
      <p className="whitespace-pre-line leading-relaxed">{first}</p>

      {rest.length > 0 && (
        <details className="group mt-2">
          <summary className="lbl inline-block cursor-pointer list-none text-rule-strong hover:text-ink [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">
              Read the rest
              <span className="ml-1.5 tabular-nums">
                {rest.length + 1} paragraphs
              </span>
            </span>
            <span className="hidden group-open:inline">Less</span>
          </summary>
          <div className="mt-2.5 flex flex-col gap-2.5">
            {rest.map((p, i) => (
              <p key={i} className="whitespace-pre-line leading-relaxed">
                {p}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

/**
 * `**like this**`, and nothing else.
 *
 * A model writes it unprompted, and inside a note carrying two price tables it
 * is doing real work: marking the section headings and the totals. Shown raw it
 * was literal asterisks on the page, which is worse than either rendering it or
 * not having it at all. Everything beyond bold is another thing the raw text
 * would stop being.
 */
function Marked({ text }: { text: string }) {
  const parts = spans(text)
  if (parts.length === 1 && !parts[0].bold) return <>{text}</>

  return (
    <>
      {parts.map((s, i) =>
        s.bold ? (
          <strong key={i} className="font-medium text-ink">
            {s.text}
          </strong>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  )
}

/**
 * Written text, folded away, saying what it is hiding.
 *
 * Two price tables should not push the thought they belong to off the screen.
 * But folded to nothing they look like nothing, so the summary counts what is
 * in there: tables and rows, which is what tells you at a glance whether this
 * is a sentence or a bill of materials.
 *
 * `details` rather than state, so it stays a server component and opens itself
 * when the page is printed.
 */
export function ProseFolded({
  text,
  label = 'note',
  className = '',
}: {
  text: string | null | undefined
  label?: string
  className?: string
}) {
  const what = describe(text)
  if (what === null) return null

  return (
    <details className={`group ${className}`}>
      <summary className="lbl-tight inline-block cursor-pointer list-none text-rule-strong hover:text-ink [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">
          {label} <span className="ml-1 tabular-nums">{what}</span>
        </span>
        <span className="hidden group-open:inline">Hide the {label}</span>
      </summary>
      <Prose text={text} className="mt-2.5" />
    </details>
  )
}
