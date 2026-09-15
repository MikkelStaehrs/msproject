import Link from 'next/link'
import { formatDate } from '@/components/ui'
import { formatMoney, lineAmount, lineEur } from '@/lib/cost'
import { deleteCost, setCostState } from '@/lib/cost-actions'
import {
  COST_BUDGET_LABEL,
  COST_RECURRENCE_LABEL,
  COST_STATES,
  COST_STATE_LABEL,
  type Cost,
  type NodeCost,
} from '@/lib/types'

/**
 * The cost column: what it costs, where it sits, and the paper nobody has
 * priced yet.
 *
 * The figures come from v_node_cost, which already answers in euro: a line
 * keeps the currency of the quote and the rate that applied when it was
 * written, and the view is the one place the conversion happens. Nothing here
 * divides by a rate a second time.
 *
 * Rust on this column means a person has to type a figure, not that anything
 * is wrong.
 */

export type LineView = {
  line: Cost
  /** Where under the part it was written, when not on the part itself. */
  path: string | null
  docName: string | null
}

export type PartRow = {
  id: string
  title: string
  code: string
  parts: number
  roll: NodeCost | null
  lines: LineView[]
  /** The scope itself, listed last, when lines were written on it directly. */
  self: boolean
}

export type UnpricedDoc = {
  id: string
  name: string
  folder: string | null
  on: string
  priceHref: string
}

/** Whole euro. A cost line is a price, and a price has no cents worth reading here. */
const eur = (n: number | string) => formatMoney(Math.round(Number(n)), 'EUR')
/** Grouped digits without the unit, for a column whose head already says it. */
const num = (n: number | string) => formatMoney(Math.round(Number(n)), '').trim()

export function EconomicsCost({
  code,
  scopeTitle,
  atProject,
  whole,
  roll,
  parts,
  expanded,
  unpriced,
  docsTotal,
  hrefs,
  form,
}: {
  code: string
  scopeTitle: string
  atProject: boolean
  /** Back to the whole project, when standing on a part. */
  whole: string | null
  roll: NodeCost
  parts: PartRow[]
  expanded: string | null
  unpriced: UnpricedDoc[]
  docsTotal: number
  hrefs: {
    here: string
    basis: string
    newLine: string
    files: string
    expand: (partId: string) => string
    collapse: string
    editLine: (lineId: string) => string
  }
  /** The line form, when it is open. Rendered in place, under the toolbar. */
  form: React.ReactNode
}) {
  const any = Number(roll.items) > 0
  const money = (v: number | string) =>
    any && Number(v) > 0 ? (
      <span className="mono">{eur(v)}</span>
    ) : (
      <span className="mono text-rust">Nothing recorded</span>
    )

  return (
    <>
      <div className="lbl text-muted">
        {whole && (
          <>
            <Link href={whole} className="text-ink hover:text-green">
              Whole project
            </Link>
            <span className="mx-2 text-line-strong">&rsaquo;</span>
          </>
        )}
        {code} · what it costs
      </div>
      <h1 className="mt-2 text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] text-balance text-green">
        Economics
      </h1>
      <p className="prose-measure grp-gap text-green-soft">
        Every figure here is the cost lines on {atProject ? 'this project' : scopeTitle}
        &rsquo;s own parts, rolled up through the tree. The page owns nothing: change a line on
        a part and this changes with it.
      </p>

      {/* Actions as buttons with words, kept apart from anything that filters. */}
      <div className="grp-gap flex flex-wrap items-center gap-4">
        <Link href={hrefs.newLine} className="btn btn-ghost">
          New line
        </Link>
        <Link href={hrefs.basis} className="act">
          Basis
        </Link>
      </div>

      {form && <div className="grp-gap">{form}</div>}

      {/* ---------------------------------------------------------------- */}
      {/* What it costs                                                    */}
      {/* ---------------------------------------------------------------- */}
      <h2 className="sec-gap text-[17px] font-semibold tracking-[-0.025em]">What it costs</h2>
      <div className="panel grp-gap max-w-[1120px]">
        <table className="tbl">
          <tbody>
            <tr>
              <td className="grow">
                Priced
                <div className="mt-[5px] text-[12px] leading-[1.45] text-muted">
                  every line, whatever state it is in
                </div>
              </td>
              <td className="text-right">{money(roll.once_priced)}</td>
            </tr>
            <tr>
              <td className="grow">
                Committed
                <div className="mt-[5px] text-[12px] leading-[1.45] text-muted">
                  ordered or invoiced
                </div>
              </td>
              <td className="text-right">{money(roll.once_committed)}</td>
            </tr>
            <tr>
              <td className="grow">
                With a document behind it
                <div className="mt-[5px] text-[12px] leading-[1.45] text-muted">
                  a quote or an order attached to the line
                </div>
              </td>
              <td className="text-right">{money(roll.once_with_paper)}</td>
            </tr>
            <tr>
              <td className="grow">
                Running cost a year
                <div className="mt-[5px] text-[12px] leading-[1.45] text-muted">
                  licences, hosting, service
                </div>
              </td>
              <td className="text-right">{money(roll.annual_priced)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Where it sits                                                    */}
      {/* ---------------------------------------------------------------- */}
      <h2 className="sec-gap text-[17px] font-semibold tracking-[-0.025em]">Where it sits</h2>
      {parts.length === 0 ? (
        <p className="grp-gap max-w-[64ch] text-[12px] leading-[1.5] text-muted">
          Not broken down into parts, and nothing priced on {scopeTitle} itself. A line
          written here would be listed under the part it is for.
        </p>
      ) : (
        <div className="panel grp-gap max-w-[1120px]">
          <table className="tbl">
            <thead>
              <tr>
                <th className="grow">Part</th>
                <th className="text-right">Priced</th>
                <th className="text-right">Committed</th>
                <th className="text-right">Lines</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => {
                const open = expanded === p.id
                const priced = p.roll ? Number(p.roll.once_priced) : sumOnce(p.lines)
                const committed = p.roll
                  ? Number(p.roll.once_committed)
                  : sumOnce(p.lines.filter((v) => isCommitted(v.line)))
                const count = p.roll ? Number(p.roll.items) : p.lines.length
                return (
                  <PartRows
                    key={p.id}
                    part={p}
                    open={open}
                    priced={priced}
                    committed={committed}
                    count={count}
                    href={open ? hrefs.collapse : hrefs.expand(p.id)}
                    here={hrefs.here}
                    editLine={hrefs.editLine}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Paper without a price                                            */}
      {/* ---------------------------------------------------------------- */}
      <h2 className="sec-gap text-[17px] font-semibold tracking-[-0.025em]">
        Paper without a price
      </h2>
      {unpriced.length > 0 ? (
        <>
          <div className="panel grp-gap max-w-[1120px]">
            <table className="tbl">
              <tbody>
                {unpriced.map((d) => (
                  <tr key={d.id}>
                    <td className="grow">
                      <span className="text-[13px] font-medium">{stem(d.name)}</span>
                      <div className="mt-[5px] text-[12px] leading-[1.45] text-muted">
                        {[d.folder, d.on].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td className="mono text-right text-rust">No price attached</td>
                    <td>
                      <Link href={d.priceHref} className="act">
                        Price it
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="grp-gap max-w-[64ch] text-[12px] leading-[1.5] text-muted">
            {unpriced.length === docsTotal
              ? `${unpriced.length} ${unpriced.length === 1 ? 'document is' : 'documents are'} attached to parts of this project and not one of them has a figure against it.`
              : `${unpriced.length} of the ${docsTotal} documents attached to parts of this project ${unpriced.length === 1 ? 'has' : 'have'} no figure against ${unpriced.length === 1 ? 'it' : 'them'}.`}{' '}
            Rust here means a person has to type one, not that anything is wrong.
          </p>
        </>
      ) : (
        <p className="grp-gap max-w-[64ch] text-[12px] leading-[1.5] text-muted">
          {docsTotal === 0 ? (
            <>
              No document is attached to {atProject ? 'this project' : scopeTitle}. Quotes
              arrive on{' '}
              <Link href={hrefs.files} className="text-green underline-offset-[3px] hover:underline">
                Files
              </Link>
              , or with the line itself.
            </>
          ) : (
            <>Every document attached here has a cost line resting on it.</>
          )}
        </p>
      )}
    </>
  )
}

/**
 * One part: its row, and under it the lines it holds when it is the one
 * opened. The row is the action: opening a part is what you come for, and a
 * button saying so on every row would be the same word fifteen times.
 */
function PartRows({
  part,
  open,
  priced,
  committed,
  count,
  href,
  here,
  editLine,
}: {
  part: PartRow
  open: boolean
  priced: number
  committed: number
  count: number
  href: string
  here: string
  editLine: (lineId: string) => string
}) {
  return (
    <>
      <tr className={open ? 'bg-hover' : undefined}>
        <td className="grow !p-0">
          <Link href={href} className="block px-[14px] py-2">
            <span className="text-[13px] font-medium">
              {part.self ? `On ${part.title} itself` : part.title}
            </span>
            <span className="mt-[5px] block text-[12px] leading-[1.45] text-muted">
              {part.code}
              {!part.self && ` · ${part.parts} ${part.parts === 1 ? 'part' : 'parts'}`}
            </span>
          </Link>
        </td>
        <td className={`mono text-right ${priced > 0 ? '' : 'text-rust'}`}>
          {priced > 0 ? num(priced) : 'none'}
        </td>
        <td className={`mono text-right ${committed > 0 ? '' : 'text-muted'}`}>
          {committed > 0 ? num(committed) : '–'}
        </td>
        <td className={`mono text-right ${count > 0 ? '' : 'text-muted'}`}>{count}</td>
      </tr>
      {open && (
        <tr className="hover:!bg-transparent">
          <td colSpan={4} className="grow !p-0">
            {part.lines.length === 0 ? (
              <p className="px-[14px] py-3 text-[12px] leading-[1.5] text-muted">
                Nothing priced on {part.title} yet.
              </p>
            ) : (
              <div>
                {part.lines.map((v) => (
                  <LineRow key={v.line.id} view={v} here={here} editHref={editLine(v.line.id)} />
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

/**
 * A line, in the currency it was quoted in and in euro. The state buttons are
 * the action that happens most: a quote becomes an order, an order becomes an
 * invoice. One click, no form.
 */
function LineRow({
  view,
  here,
  editHref,
}: {
  view: LineView
  here: string
  editHref: string
}) {
  const l = view.line
  return (
    <div className="grid grid-cols-1 items-baseline gap-x-5 gap-y-2 border-t border-line px-[14px] py-3 whitespace-normal lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
      <div className="min-w-0">
        <div className="text-[13px]">{l.description}</div>
        <div className="mt-[5px] flex flex-wrap items-baseline gap-x-3 text-[12px] leading-[1.45] text-muted">
          {view.path && <span>{view.path}</span>}
          <span>{COST_BUDGET_LABEL[l.budget]}</span>
          {l.recurrence !== 'once' && (
            <span>{COST_RECURRENCE_LABEL[l.recurrence].toLowerCase()}</span>
          )}
          <span className="mono">{formatDate(l.dated)}</span>
          {l.vendor && <span>{l.vendor}</span>}
          {l.reference && <span className="mono">{l.reference}</span>}
          {view.docName && l.document_id && (
            <a href={`/api/document/${l.document_id}`} className="text-green hover:underline">
              {view.docName}
            </a>
          )}
          {l.document_id === null && l.state !== 'estimate' && (
            <span className="text-rust">no paper</span>
          )}
          {l.note && <span>{l.note}</span>}
        </div>
      </div>

      <div className="mono text-[13px] lg:text-right">
        {Number(l.quantity) !== 1 && (
          <span className="mr-1.5 text-[11px] text-muted">
            {Number(l.quantity)} x {formatMoney(Number(l.amount), '').trim()}
          </span>
        )}
        {formatMoney(lineAmount(l), l.currency)}
        {l.recurrence !== 'once' && (
          <span className="ml-1 text-[11px] text-muted">
            {l.recurrence === 'monthly' ? 'a month' : l.recurrence === 'quarterly' ? 'a quarter' : 'a year'}
          </span>
        )}
        {l.currency !== 'EUR' && (
          <span className="block text-[11px] text-muted">
            {formatMoney(Math.round(lineEur(l) * 100) / 100, 'EUR')} at {l.eur_rate}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2.5">
        {COST_STATES.map((s) => (
          <form key={s} action={setCostState}>
            <input type="hidden" name="id" value={l.id} />
            <input type="hidden" name="state" value={s} />
            <input type="hidden" name="redirectTo" value={here} />
            <button
              className={`micro cursor-pointer border-0 bg-transparent p-0 ${
                l.state === s ? 'text-green' : 'text-muted hover:text-ink'
              }`}
              aria-pressed={l.state === s}
            >
              {COST_STATE_LABEL[s]}
            </button>
          </form>
        ))}
      </div>

      <div className="flex items-baseline gap-3 lg:justify-end">
        <Link href={editHref} className="act">
          Edit
        </Link>
        <form action={deleteCost}>
          <input type="hidden" name="id" value={l.id} />
          <input type="hidden" name="redirectTo" value={here} />
          <button className="act text-rust">Delete</button>
        </form>
      </div>
    </div>
  )
}

/* The scope's own lines have no roll of their own to read, so they are added here. */
const isCommitted = (l: Cost) => l.state === 'ordered' || l.state === 'invoiced'
const sumOnce = (views: LineView[]) =>
  views.filter((v) => v.line.recurrence === 'once').reduce((s, v) => s + lineEur(v.line), 0)

/** A file name without its extension; the type is said elsewhere. */
const stem = (name: string) => name.replace(/\.[a-z0-9]+$/i, '')
